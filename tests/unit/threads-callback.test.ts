import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), organization: vi.fn(), cookie: vi.fn(), remove: vi.fn(), connect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAdmin: mocks.admin }));
vi.mock("@/lib/prisma", () => ({ prisma: { organization: { findFirst: mocks.organization } } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie, delete: mocks.remove }) }));
vi.mock("@/lib/threads", () => ({
  THREADS_STATE_COOKIE: "avila_threads_oauth_state",
  parseThreadsState: (value: string | null) => value?.startsWith("company.actor.") ? { organizationId: "company", actorId: "actor" } : null,
  connectThreads: mocks.connect,
}));
import { GET } from "@/app/api/integrations/threads/oauth/callback/route";
const state = "company.actor.nonce";
function request(extra = "") { return new NextRequest(`https://app.avilaops.com/api/integrations/threads/oauth/callback?state=${state}&code=code${extra}`); }
beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ id: "actor" }); mocks.organization.mockResolvedValue({ id: "company" }); mocks.cookie.mockReturnValue({ value: state }); });
describe("Threads callback authorization", () => {
  it("requires an authenticated administrator", async () => {
    mocks.admin.mockResolvedValue(null);
    expect((await GET(request())).headers.get("location")).toContain("/login");
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it.each(["missing", "mismatch", "other-actor"])("refuses %s state and consumes cookie", async mode => {
    if (mode === "missing") mocks.cookie.mockReturnValue(undefined);
    if (mode === "mismatch") mocks.cookie.mockReturnValue({ value: "different" });
    if (mode === "other-actor") mocks.admin.mockResolvedValue({ id: "other" });
    const response = await GET(request());
    expect(new URL(response.headers.get("location")!).searchParams.has("error")).toBe(true);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledOnce();
  });
  it("does not connect when the provider refuses consent", async () => {
    await GET(request("&error=access_denied&error_description=untrusted"));
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("refuses an archived company at callback time", async () => {
    mocks.organization.mockResolvedValue(null);
    await GET(request());
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("keeps the authorized company on successful redirect", async () => {
    const destination = new URL((await GET(request())).headers.get("location")!);
    expect(destination.searchParams.get("organizationId")).toBe("company");
    expect(destination.searchParams.get("threads")).toBe("1");
    expect(mocks.connect).toHaveBeenCalledWith(expect.any(String), "code", "company", "actor");
  });
});
