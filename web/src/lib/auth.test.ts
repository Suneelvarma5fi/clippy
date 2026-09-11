import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
const clerkAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: clerkAuth }));

/** Re-import the module with NEXT_PUBLIC_AUTH_MODE set, since LOCAL_AUTH is read at import time. */
async function loadAuth(mode: string | undefined) {
  vi.resetModules();
  if (mode === undefined) delete process.env.NEXT_PUBLIC_AUTH_MODE;
  else process.env.NEXT_PUBLIC_AUTH_MODE = mode;
  return import("./auth");
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_AUTH_MODE;
  vi.clearAllMocks();
});

describe("auth seam", () => {
  it("returns the fixed local user without calling Clerk in local mode", async () => {
    const { auth, LOCAL_AUTH, LOCAL_USER_ID } = await loadAuth("local");
    expect(LOCAL_AUTH).toBe(true);
    expect(await auth()).toEqual({ userId: LOCAL_USER_ID });
    expect(clerkAuth).not.toHaveBeenCalled();
  });

  it("delegates to Clerk when the mode is unset", async () => {
    clerkAuth.mockResolvedValue({ userId: "user_clerk" });
    const { auth, LOCAL_AUTH } = await loadAuth(undefined);
    expect(LOCAL_AUTH).toBe(false);
    expect(await auth()).toEqual({ userId: "user_clerk" });
    expect(clerkAuth).toHaveBeenCalledOnce();
  });

  it("delegates to Clerk for any non-local mode value", async () => {
    clerkAuth.mockResolvedValue({ userId: "user_clerk" });
    const { auth, LOCAL_AUTH } = await loadAuth("clerk");
    expect(LOCAL_AUTH).toBe(false);
    expect((await auth()).userId).toBe("user_clerk");
  });

  it("passes through a signed-out Clerk session", async () => {
    clerkAuth.mockResolvedValue({ userId: null });
    const { auth } = await loadAuth(undefined);
    expect(await auth()).toEqual({ userId: null });
  });
});
