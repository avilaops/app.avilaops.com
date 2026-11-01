import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ lock: vi.fn(), find: vi.fn(), save: vi.fn(), account: vi.fn(), connection: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({
  $executeRaw: db.lock, organizationIntegrationConnection: { findFirst: db.find, upsert: db.save },
  coreExternalAccount: { upsert: db.account }, coreConnection: { upsert: db.connection }, operationsAuditEvent: { create: db.audit },
}) } }));
vi.mock("@/lib/token-de-conexao", () => ({ cifrarToken: () => "encrypted" }));
vi.mock("@/lib/credenciais", () => ({ exigirCredencial: vi.fn(async (key: string) => key === "THREADS_APP_ID" ? "threads-app" : "private-secret") }));
import { connectThreads, parseThreadsState, threadsState, threadsLoginUrl, threadsRequest } from "@/lib/threads";

function providerResponses() {
  return vi.fn()
    .mockResolvedValueOnce(Response.json({ access_token: "short" }))
    .mockResolvedValueOnce(Response.json({ access_token: "long", expires_in: 5184000 }))
    .mockResolvedValueOnce(Response.json({ id: "remote-id", username: "brand" }))
    .mockResolvedValueOnce(Response.json({ data: { is_valid: true, user_id: "remote-id", scopes: ["threads_basic"] } }));
}
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); db.find.mockResolvedValue(null); db.save.mockResolvedValue({ id: "legacy" }); db.account.mockResolvedValue({ id: "account" }); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Threads OAuth", () => {
  it("refuses external URLs, path traversal and query injection", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const path of ["https://evil.test/token", "/v1.0/../me", "//evil.test", "/v1.0/me?token=private"]) {
      await expect(threadsRequest(path, "private")).rejects.toThrow("Caminho");
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("binds state to company and actor and rejects malformed states", () => {
    const state = threadsState("company", "actor");
    expect(parseThreadsState(state)).toEqual({ organizationId: "company", actorId: "actor" });
    expect(threadsState("company", "actor")).not.toBe(state);
    for (const value of [null, "", "company.actor.short", state + ".extra"]) expect(parseThreadsState(value)).toBeNull();
  });
  it("uses Threads credentials, callback and consent scopes", async () => {
    const url = await threadsLoginUrl("https://app.avilaops.com/", "state");
    expect(url.origin).toBe("https://threads.com");
    expect(url.searchParams.get("client_id")).toBe("threads-app");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.avilaops.com/api/integrations/threads/oauth/callback");
    expect(url.searchParams.get("scope")).toBe("threads_basic,threads_content_publish,threads_manage_insights");
    expect(url.toString()).not.toContain("private-secret");
  });
  it("serializes the remote account check and refuses a cross-company connection", async () => {
    vi.stubGlobal("fetch", providerResponses()); db.find.mockResolvedValue({ id: "other" });
    await expect(connectThreads("https://app.avilaops.com", "code", "company", "actor")).rejects.toThrow("outra empresa");
    expect(db.lock).toHaveBeenCalledOnce();
    expect(db.lock.mock.invocationCallOrder[0]).toBeLessThan(db.find.mock.invocationCallOrder[0]);
    expect(db.save).not.toHaveBeenCalled();
  });
  it("persists encrypted credentials and verified basic access in both connection records", async () => {
    const fetch = providerResponses(); vi.stubGlobal("fetch", fetch);
    await expect(connectThreads("https://app.avilaops.com", "code", "company", "actor")).resolves.toEqual({ username: "brand" });
    const exchange = new URL(String(fetch.mock.calls[1][0]));
    expect(exchange.pathname).toBe("/access_token");
    expect(exchange.searchParams.get("access_token")).toBe("short");
    expect(exchange.searchParams.get("grant_type")).toBe("th_exchange_token");
    const inspection = new URL(String(fetch.mock.calls[3][0]));
    expect(inspection.pathname).toBe("/v1.0/debug_token");
    expect(inspection.searchParams.get("access_token")).toBe("TH|threads-app|private-secret");
    expect(inspection.searchParams.get("input_token")).toBe("long");
    expect(db.save).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ organizationId: "company", tokenCiphertext: "encrypted", scopes: ["threads_basic"] }) }));
    expect(db.connection).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ organizationId: "company", authorizedById: "actor", legacyConnectionId: "legacy" }) }));
    expect(db.audit).toHaveBeenCalledOnce();
  });
  it("rejects invalid expiry before writing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ access_token: "short" })).mockResolvedValueOnce(Response.json({ access_token: "long", expires_in: -1 })));
    await expect(connectThreads("https://app.avilaops.com", "code", "company", "actor")).rejects.toThrow("validade");
    expect(db.save).not.toHaveBeenCalled();
  });
  it("never exposes provider bodies in error messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "secret-token" } }, { status: 401 })));
    await expect(threadsRequest("/v1.0/me", "secret-token")).rejects.toThrow("HTTP 401");
    await expect(threadsRequest("/v1.0/me", "secret-token")).rejects.not.toThrow("secret-token");
  });
  it("identifies the failed exchange using only allowlisted numeric diagnostics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ access_token: "short" }))
      .mockResolvedValueOnce(Response.json({ error: { code: 190, error_subcode: 463, message: "private-secret short long" } }, { status: 400 })));
    await expect(connectThreads("https://app.avilaops.com", "private-code", "company", "actor")).rejects.toThrow("HTTP 400");
    expect(console.error).toHaveBeenCalledExactlyOnceWith("[threads.oauth.failed]", {
      stage: "long_lived_token", httpStatus: 400, providerCode: 190, providerSubcode: 463, databaseCode: null,
    });
    expect(db.save).not.toHaveBeenCalled();
  });
  it("does not log arbitrary provider codes or transport errors containing credentials", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("https://provider/?access_token=private-secret"))
      .mockResolvedValueOnce(Response.json({ error: { code: "private-secret", error_subcode: { token: "private-secret" } } }, { status: 400 }));
    vi.stubGlobal("fetch", fetch);
    await expect(connectThreads("https://app.avilaops.com", "code", "company", "actor")).rejects.toThrow();
    await expect(connectThreads("https://app.avilaops.com", "code", "company", "actor")).rejects.toThrow();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-secret");
    expect(console.error).toHaveBeenLastCalledWith("[threads.oauth.failed]", {
      stage: "authorization_code", httpStatus: 400, providerCode: null, providerSubcode: null, databaseCode: null,
    });
  });
  it("identifies persistence errors without logging Prisma messages or queries", async () => {
    vi.stubGlobal("fetch", providerResponses());
    db.save.mockRejectedValueOnce(Object.assign(new Error("private query with private-secret"), { code: "P2002" }));
    await expect(connectThreads("https://app.avilaops.com", "code", "company", "actor")).rejects.toThrow();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("[threads.oauth.failed]", {
      stage: "persistence", httpStatus: null, providerCode: null, providerSubcode: null, databaseCode: "P2002",
    });
  });
});
