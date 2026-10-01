import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

const mock = vi.hoisted(() => ({
  cookie: vi.fn(), sso: vi.fn(), find: vi.fn(), link: vi.fn(), query: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mock.cookie }) }));
vi.mock("@/lib/sso", () => ({ lerSessaoSSO: mock.sso }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  adminIdentity: { findFirst: mock.find }, coreIdentityLink: { findUnique: mock.link }, $queryRaw: mock.query,
} }));
import { getAdmin, getSessaoPortal, autenticarPortal } from "@/lib/auth";

const account = { id: "local", nome: "Test", email: "test@example.invalid", role: "ADMIN", ativo: true, organizationId: "org" };
beforeEach(() => {
  vi.resetAllMocks();
  process.env.APP_JWT_SECRET = "unit-test-only";
  mock.sso.mockResolvedValue(null);
  mock.query.mockResolvedValue([{ allowed: true }]);
});
describe("identidade central e sessão", () => {
  it("recusa login desativado antes de validar senha", async () => {
    mock.find.mockResolvedValue({ ...account, ativo: false });
    expect(await autenticarPortal(account.email, "unused")).toBeNull();
  });
  it("consulta estado ativo e remove empresa sem participação vigente", async () => {
    mock.cookie.mockReturnValue({ value: jwt.sign({ sub: account.id, role: "ADMIN" }, process.env.APP_JWT_SECRET!) });
    mock.find.mockResolvedValue(account);
    mock.query.mockResolvedValue([{ allowed: false }]);
    expect((await getSessaoPortal())?.organizationId).toBeNull();
    expect(mock.find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: account.id, ativo: true } }));
  });
  it("SSO com vínculo explícito funciona mesmo com e-mail alterado", async () => {
    mock.sso.mockResolvedValue({ sub: "auth-id", email: "new@example.invalid", papel: "CLIENTE" });
    mock.link.mockResolvedValue({ identity: account });
    expect((await getSessaoPortal())?.id).toBe(account.id);
    expect(mock.find).not.toHaveBeenCalled();
    expect(await getAdmin()).toBeNull();
  });
  it("vínculo desativado não cai para associação por e-mail", async () => {
    mock.sso.mockResolvedValue({ sub: "auth-id", email: account.email, papel: "ADMIN" });
    mock.link.mockResolvedValue({ identity: { ...account, ativo: false } });
    expect(await getSessaoPortal()).toBeNull();
    expect(mock.find).not.toHaveBeenCalled();
  });
  it("preserva fallback legado apenas para contas internas ativas", async () => {
    mock.sso.mockResolvedValue({ sub: "legacy", email: account.email, papel: "ADMIN" });
    mock.link.mockResolvedValue(null);
    mock.find.mockResolvedValue({ ...account, role: "OWNER" });
    expect((await getAdmin())?.role).toBe("OWNER");
    expect(mock.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ativo: true }) }));
  });
  it("SSO sem subject não consulta vínculos nem usa e-mail", async () => {
    mock.sso.mockResolvedValue({ email: account.email, papel: "ADMIN" });
    expect(await getSessaoPortal()).toBeNull();
    expect(mock.link).not.toHaveBeenCalled();
  });
});
