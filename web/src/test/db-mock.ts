/**
 * Chainable Supabase client mock for route-handler tests.
 *
 * Every awaited query chain (`.from(...).select(...).eq(...).single()` etc.)
 * resolves to the next result in the queue, in execution order. All chained
 * method calls are recorded in `calls` so tests can assert on arguments
 * (e.g. what was passed to `insert`, `update`, `upsert`, or `rpc`).
 */

export interface DbResult {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}

export interface DbCall {
  method: string;
  args: unknown[];
}

export function createDbMock(queue: DbResult[] = []) {
  const calls: DbCall[] = [];

  const makeBuilder = (): unknown =>
    new Proxy(() => {}, {
      get(_target, prop: string) {
        if (prop === "then") {
          const res = queue.length ? queue.shift()! : {};
          const resolved = {
            data: res.data ?? null,
            error: res.error ?? null,
            count: res.count ?? null,
          };
          return (resolve: (v: unknown) => void) => resolve(resolved);
        }
        return (...args: unknown[]) => {
          calls.push({ method: prop, args });
          return makeBuilder();
        };
      },
    });

  const db = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return makeBuilder();
    },
    rpc: (fn: string, params?: unknown) => {
      calls.push({ method: "rpc", args: [fn, params] });
      return makeBuilder();
    },
  };

  /** First recorded call with this method name (e.g. "insert", "rpc"). */
  const firstCall = (method: string) => calls.find((c) => c.method === method);
  /** All recorded calls with this method name. */
  const allCalls = (method: string) => calls.filter((c) => c.method === method);

  return { db, calls, queue, firstCall, allCalls };
}
