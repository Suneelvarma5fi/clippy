/**
 * Tests for the presets (brand template) route handlers.
 * Clerk auth + the Supabase admin client are mocked at the module seam; the
 * handlers run for real. Focus: the is_default exclusivity logic the dedicated
 * Brand Templates page relies on.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { createDbMock } from "@/test/db-mock";

const h = vi.hoisted(() => ({
  auth:              vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: h.auth, LOCAL_AUTH: false, LOCAL_USER_ID: "local-user" }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: h.createAdminClient }));

import { GET as listPresets, POST as createPreset } from "./presets/route";
import { PATCH as updatePreset, DELETE as deletePreset } from "./presets/[id]/route";

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
});

describe("POST /api/presets", () => {
  it("rejects unauthenticated requests", async () => {
    h.auth.mockResolvedValue({ userId: null });
    const res = await createPreset(post({ name: "T", config: {} }));
    expect(res.status).toBe(401);
  });

  it("400s without name or config", async () => {
    const res = await createPreset(post({ name: "T" }));
    expect(res.status).toBe(400);
  });

  it("creates a preset without touching the existing default", async () => {
    const { db, allCalls } = createDbMock([
      { count: 3 },                         // under-cap count
      { data: { id: "p1", name: "T" } },    // insert
    ]);
    h.createAdminClient.mockReturnValue(db);
    const res = await createPreset(post({ name: "T", config: { layout: {} } }));
    expect(res.status).toBe(201);
    expect(allCalls("update").length).toBe(0);               // no default clearing
    const insert = allCalls("insert")[0].args[0] as { name: string; is_default: boolean };
    expect(insert.name).toBe("T");
    expect(insert.is_default).toBe(false);
  });

  it("clears the prior default when creating a default template", async () => {
    const { db, allCalls } = createDbMock([
      { count: 3 },                   // under-cap count
      { data: null },                 // clear-default update
      { data: { id: "p2" } },         // insert
    ]);
    h.createAdminClient.mockReturnValue(db);
    const res = await createPreset(post({ name: "T", config: {}, is_default: true }));
    expect(res.status).toBe(201);
    expect(allCalls("update")[0].args[0]).toEqual({ is_default: false });
    const insert = allCalls("insert")[0].args[0] as { is_default: boolean };
    expect(insert.is_default).toBe(true);
  });

  it("409s at the preset cap without inserting", async () => {
    const { db, allCalls } = createDbMock([{ count: 15 }]); // at-cap count
    h.createAdminClient.mockReturnValue(db);
    const res = await createPreset(post({ name: "T", config: {} }));
    expect(res.status).toBe(409);
    expect(allCalls("insert").length).toBe(0);
  });
});

describe("PATCH /api/presets/[id]", () => {
  it("clears the prior default, then applies the update", async () => {
    const { db, allCalls } = createDbMock([
      { data: null },                       // clear-default update
      { data: { id: "p1", name: "T2" } },   // the real update
    ]);
    h.createAdminClient.mockReturnValue(db);
    const res = await updatePreset(post({ name: "T2", config: {}, is_default: true }), params("p1"));
    expect(res.status).toBe(200);
    const updates = allCalls("update");
    expect(updates[0].args[0]).toEqual({ is_default: false });
    expect(updates[1].args[0]).toEqual({ name: "T2", config: {}, is_default: true });
  });

  it("does not clear default when is_default is falsy", async () => {
    const { db, allCalls } = createDbMock([{ data: { id: "p1" } }]); // single update
    h.createAdminClient.mockReturnValue(db);
    const res = await updatePreset(post({ name: "T2", config: {} }), params("p1"));
    expect(res.status).toBe(200);
    expect(allCalls("update").length).toBe(1);   // only the real update, no clearing
  });
});

describe("DELETE /api/presets/[id]", () => {
  it("deletes and returns ok", async () => {
    const { db } = createDbMock([{}]);
    h.createAdminClient.mockReturnValue(db);
    const res = await deletePreset({} as unknown as NextRequest, params("p1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("GET /api/presets", () => {
  it("returns the user's templates", async () => {
    const { db } = createDbMock([{ data: [{ id: "p1" }, { id: "p2" }] }]);
    h.createAdminClient.mockReturnValue(db);
    const res = await listPresets();
    expect(res.status).toBe(200);
    expect((await res.json()).length).toBe(2);
  });
});
