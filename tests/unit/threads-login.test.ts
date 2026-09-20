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
    .mockResolvedValueOnce(Response.json({ id: "remote-id", username: "brand" }));
}
beforeEach(() => { vi.clearAllMocks(); db.find.mockResolvedValue(null); db.save.mockResolvedValue({ id: "legacy" }); db.account.mockResolvedValue({ id: "account" }); });
afterEach(() => vi.unstubAllGlobals());

describe("Threads OAuth", () => {
  it("binds state to company and actor and rejects malformed states", () => {
    const state = threadsState("company", "actor");
    expect(parseThreadsState(state)).toEqual({ organizationId: "company", actorId: "actor" });
    expect(threadsState("company", "actor")).not.toBe(state);
    for (const value of [null, "", "company.actor.short", state + ".extra"]) expect(parseThreadsState(value)).toBeNull();
  });
  it("uses Threads credentials, callback and consent scopes", async () => {
    const url = await threadsLoginUrl("https://app.avilaops.com/", "state");
    expect(url.origin).toBe("https://threads.net");
    expect(url.searchParams.get("client_id")).toBe("threads-app");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.avilaops.com/api/integrations/threads/oauth/callback");
    expect(url.searchParams.get("scope")).toBe("threads_basic,threads_content_publish");
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
    vi.stubGlobal("fetch", providerResponses());
    await expect(connectThreads("https://app.avilaops.com", "code", "company", "actor")).resolves.toEqual({ username: "brand" });
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
});
