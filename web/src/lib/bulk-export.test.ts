import { describe, it, expect, vi } from "vitest";
import { queueBulkExports } from "./bulk-export";

const body = { aspect_ratio: "9:16", preset_config: null };

const jsonResponse = (status: number, payload: unknown = {}) =>
  ({ ok: status < 400, status, json: async () => payload }) as Response;

describe("queueBulkExports", () => {
  it("queues every clip sequentially and reports export ids", async () => {
    let n = 0;
    const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(200, { export_id: `exp_${++n}` }));
    const queuedCallback = vi.fn();

    const result = await queueBulkExports(["c1", "c2", "c3"], body, queuedCallback, fetchFn);

    expect(result).toEqual({
      queued: [
        { clipId: "c1", exportId: "exp_1" },
        { clipId: "c2", exportId: "exp_2" },
        { clipId: "c3", exportId: "exp_3" },
      ],
      failed: 0,
    });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/clips/c1/export");
    expect(queuedCallback).toHaveBeenCalledTimes(3);
  });

  it("counts failures but keeps going", async () => {
    const responses = [
      jsonResponse(500, { error: "boom" }),
      jsonResponse(200, { export_id: "e2" }),
    ];
    const fetchFn = vi.fn(async () => responses.shift() ?? jsonResponse(200, { export_id: "e3" }));

    const result = await queueBulkExports(["c1", "c2", "c3"], body, undefined, fetchFn);

    expect(result.failed).toBe(1);
    expect(result.queued.map((q) => q.clipId)).toEqual(["c2", "c3"]);
  });

  it("treats thrown fetch errors as failures", async () => {
    const fetchFn = vi.fn(async () => { throw new Error("network"); });
    const result = await queueBulkExports(["c1"], body, undefined, fetchFn);
    expect(result).toEqual({ queued: [], failed: 1 });
  });
});
