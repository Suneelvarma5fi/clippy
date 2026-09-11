/**
 * Integration tests for the API route handlers.
 * Clerk auth, the Supabase admin client, the worker trigger, and R2
 * are all mocked at the module seam — the handlers run for real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { createDbMock } from "@/test/db-mock";

const h = vi.hoisted(() => ({
  auth:              vi.fn(),
  triggerJob:        vi.fn(),
  createAdminClient: vi.fn(),
  fetchYouTubeMeta:  vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: h.auth, LOCAL_AUTH: false, LOCAL_USER_ID: "local-user" }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: h.createAdminClient }));
vi.mock("@/lib/worker", () => ({ triggerJob: h.triggerJob }));
vi.mock("@/lib/r2", () => ({
  freshUrl:       vi.fn(async (k: string | null) => (k ? `https://cdn.test/${k}` : null)),
  freshenExports: vi.fn(async (rows: unknown[]) => rows),
  deleteObject:   vi.fn(async () => {}),
}));
vi.mock("@/lib/youtube", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/youtube")>()),
  fetchYouTubeMeta: h.fetchYouTubeMeta,
}));
import { POST as exportClip }   from "./clips/[id]/export/route";
import { POST as createVideo }  from "./videos/route";
import { POST as createClip }   from "./clips/route";
import { POST as bulkApprove }  from "./clips/bulk-approve/route";
import { POST as retryJob }     from "./jobs/[id]/retry/route";
import { POST as cancelJob }    from "./jobs/[id]/cancel/route";

const post = (body: unknown) =>
  new Request("http://test.local/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ userId: "user_1" });
  h.triggerJob.mockResolvedValue(undefined);
});

// ── POST /api/clips/[id]/export ───────────────────────────────────────────────

describe("POST /api/clips/[id]/export", () => {
  it("rejects unauthenticated requests", async () => {
    h.auth.mockResolvedValue({ userId: null });
    const res = await exportClip(post({}), params("c1"));
    expect(res.status).toBe(401);
  });

  it("404s when the clip doesn't belong to the user", async () => {
    const { db } = createDbMock([{ data: null }]);
    h.createAdminClient.mockReturnValue(db);
    const res = await exportClip(post({}), params("c1"));
    expect(res.status).toBe(404);
  });

  it("cache miss: builds the edit, queues edit_clip", async () => {
    const { db, allCalls } = createDbMock([
      { data: { id: "c1", video_id: "v1", hook: "Hook", cuts: [{ start: 0, end: 5 }] } },
      { data: null },                    // clip_edits lookup → miss
      { data: { id: "edit_1" } },        // claim upsert
      { data: { id: "exp_1" } },         // export insert
      { data: { id: "job_1" } },         // job insert
    ]);
    h.createAdminClient.mockReturnValue(db);
    const res = await exportClip(post({ preset_config: { layout: {} } }), params("c1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ export_id: "exp_1", job_id: "job_1" });
    expect(h.triggerJob).toHaveBeenCalledWith("job_1");
    const exportInsert = allCalls("insert")[0].args[0] as { edit_id: string };
    expect(exportInsert.edit_id).toBe("edit_1");
    const jobInsert = allCalls("insert")[1].args[0] as
      { type: string; payload: { edit_id: string; preset_config: unknown; branding_watermark: boolean } };
    expect(jobInsert.type).toBe("edit_clip");
    expect(jobInsert.payload.edit_id).toBe("edit_1");
    expect(jobInsert.payload.preset_config).toEqual({ layout: {} });
    expect(jobInsert.payload.branding_watermark).toBe(false);
  });

  it("cache hit: restyles and queues style_clip", async () => {
    const { db, allCalls } = createDbMock([
      { data: { id: "c1", video_id: "v1", hook: "Hook", cuts: [{ start: 0, end: 5 }] } },
      { data: { id: "edit_1", status: "done", r2_key: "clip_edits/edit_1/portrait.mp4" } }, // hit
      { data: { id: "exp_2" } },         // export insert
      { data: { id: "job_2" } },         // job insert
    ]);
    h.createAdminClient.mockReturnValue(db);
    const res = await exportClip(post({}), params("c1"));
    expect(res.status).toBe(200);
    expect(h.triggerJob).toHaveBeenCalledWith("job_2");
    const jobInsert = allCalls("insert")[1].args[0] as { type: string; payload: { edit_id: string } };
    expect(jobInsert.type).toBe("style_clip");
    expect(jobInsert.payload.edit_id).toBe("edit_1");
  });

  it("concurrent miss: loses the claim race, reuses the edit", async () => {
    const { db, allCalls } = createDbMock([
      { data: { id: "c1", video_id: "v1", hook: "Hook", cuts: [{ start: 0, end: 5 }] } },
      { data: null },                    // clip_edits lookup → miss
      { data: null },                    // claim upsert → lost race (ignoreDuplicates)
      { data: { id: "edit_1" } },        // re-select the row the racer created
      { data: { id: "exp_3" } },         // export insert
      { data: { id: "job_3" } },         // job insert
    ]);
    h.createAdminClient.mockReturnValue(db);
    const res = await exportClip(post({}), params("c1"));
    expect(res.status).toBe(200);
    const jobInsert = allCalls("insert")[1].args[0] as { type: string; payload: { edit_id: string } };
    expect(jobInsert.type).toBe("edit_clip");
    expect(jobInsert.payload.edit_id).toBe("edit_1");
  });

  it("500s when the export insert fails", async () => {
    const { db } = createDbMock([
      { data: { id: "c1", video_id: "v1", hook: "Hook", cuts: [{ start: 0, end: 5 }] } },
      { data: null },                    // miss
      { data: { id: "edit_1" } },        // claim
      { data: null, error: { message: "insert blew up" } },   // export insert fails
    ]);
    h.createAdminClient.mockReturnValue(db);
    const res = await exportClip(post({}), params("c1"));
    expect(res.status).toBe(500);
    expect(h.triggerJob).not.toHaveBeenCalled();
  });
});

// ── POST /api/videos ──────────────────────────────────────────────────────────

describe("POST /api/videos", () => {
  it("rejects invalid YouTube URLs", async () => {
    const { db } = createDbMock();
    h.createAdminClient.mockReturnValue(db);
    const res = await createVideo(post({ youtube_url: "https://vimeo.com/123" }));
    expect(res.status).toBe(400);
  });

  it("409s on duplicate video", async () => {
    const { db } = createDbMock([
      { data: { id: "v_existing" } },
    ]);
    h.createAdminClient.mockReturnValue(db);
    const res = await createVideo(post({ youtube_url: "https://youtu.be/dQw4w9WgXcQ" }));
    expect(res.status).toBe(409);
  });

  it("creates the video + transcribe job and triggers the worker", async () => {
    h.fetchYouTubeMeta.mockResolvedValue({ title: "T", thumbnail_url: "u", channel_name: "ch" });
    const { db, allCalls } = createDbMock([
      { data: null },                  // no duplicate
      { data: { id: "vid_1" } },       // video insert
      { data: { id: "job_1" } },       // job insert
    ]);
    h.createAdminClient.mockReturnValue(db);
    const res = await createVideo(post({ youtube_url: "https://youtu.be/dQw4w9WgXcQ" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ video_id: "vid_1" });
    expect(h.triggerJob).toHaveBeenCalledWith("job_1");
    const jobInsert = allCalls("insert")[1].args[0] as { type: string; payload: { video_id: string } };
    expect(jobInsert.type).toBe("transcribe");
    expect(jobInsert.payload.video_id).toBe("vid_1");
  });
});

// ── POST /api/clips ───────────────────────────────────────────────────────────

describe("POST /api/clips", () => {
  it("requires video_id and cuts", async () => {
    const res = await createClip(post({ video_id: "v1", cuts: [] }));
    expect(res.status).toBe(400);
  });

  it("404s when the video belongs to someone else", async () => {
    const { db } = createDbMock([{ data: null }]);
    h.createAdminClient.mockReturnValue(db);
    const res = await createClip(post({ video_id: "v1", cuts: [{ start: 0, end: 5 }] }));
    expect(res.status).toBe(404);
  });

  it("computes total duration across cuts and inserts the clip", async () => {
    const { db, firstCall } = createDbMock([
      { data: { id: "v1" } },
      { data: { id: "clip_1" } },
    ]);
    h.createAdminClient.mockReturnValue(db);
    const res = await createClip(post({
      video_id: "v1",
      cuts: [{ start: 0, end: 5 }, { start: 10, end: 17.5 }],
    }));
    expect(res.status).toBe(201);
    const inserted = firstCall("insert")?.args[0] as { duration_sec: number; source: string };
    expect(inserted.duration_sec).toBe(12.5);
    expect(inserted.source).toBe("manual");
  });
});

// ── POST /api/clips/bulk-approve ──────────────────────────────────────────────

describe("POST /api/clips/bulk-approve", () => {
  it("rejects an empty id list and non-boolean approved values", async () => {
    expect((await bulkApprove(post({ clip_ids: [], approved: true }))).status).toBe(400);
    expect((await bulkApprove(post({ clip_ids: ["c1"], approved: "yes" }))).status).toBe(400);
  });

  it("accepts null to clear the review state", async () => {
    const { db, firstCall } = createDbMock([{ data: null }]);
    h.createAdminClient.mockReturnValue(db);
    const res = await bulkApprove(post({ clip_ids: ["c1", "c2"], approved: null }));
    expect(res.status).toBe(200);
    expect(firstCall("update")?.args[0]).toEqual({ approved: null });
  });
});

// ── Jobs: retry / cancel state machine ────────────────────────────────────────

describe("job retry/cancel", () => {
  it("only failed or cancelled jobs can be retried", async () => {
    const { db } = createDbMock([{ data: { id: "j1", status: "done" } }]);
    h.createAdminClient.mockReturnValue(db);
    expect((await retryJob(post({}), params("j1"))).status).toBe(409);
  });

  it("retry resets an errored job and re-triggers the worker", async () => {
    const { db, firstCall } = createDbMock([
      { data: { id: "j1", status: "error" } },
      { data: null },
    ]);
    h.createAdminClient.mockReturnValue(db);
    const res = await retryJob(post({}), params("j1"));
    expect(res.status).toBe(200);
    expect(firstCall("update")?.args[0]).toMatchObject({ status: "queued", error_msg: null });
    expect(h.triggerJob).toHaveBeenCalledWith("j1");
  });

  it("only queued/processing jobs can be cancelled", async () => {
    const { db } = createDbMock([{ data: { id: "j1", status: "done" } }]);
    h.createAdminClient.mockReturnValue(db);
    expect((await cancelJob(post({}), params("j1"))).status).toBe(409);

    const second = createDbMock([{ data: { id: "j1", status: "processing" } }, { data: null }]);
    h.createAdminClient.mockReturnValue(second.db);
    const res = await cancelJob(post({}), params("j1"));
    expect(res.status).toBe(200);
    expect(second.firstCall("update")?.args[0]).toMatchObject({ status: "cancelled" });
  });
});
