import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/credenciais", () => ({ obterCredencial: vi.fn() }));
vi.mock("@/lib/threads", () => ({ THREADS_GRAPH: "https://graph.threads.com/v1.0", tokenDaEmpresaThreads: vi.fn() }));
import { publicar, type Requisicao } from "@/lib/publicacoes/provedores";
import { publicacaoSchema } from "@/lib/publicacoes/contratos";
import type { Post, Entrega } from "@/lib/publicacoes/repositorio";

const payload = { perfilId: "d6c74c65-4840-4113-8399-c804cddc9ca1", chave: "4370b568-5435-413b-ad3c-82d57fd146a1", titulo: "Post", texto: "Olá", tipo: "text" as const, midiaUrl: null, canais: ["threads" as const], opcionais: [], agendadoEm: "2026-11-01T12:00:00Z" };
const post: Post = { id: "post", perfil_id: payload.perfilId, conteudo: payload, agendado_em: new Date(payload.agendadoEm), estado: "PROCESSANDO", versao: 1 };
const delivery = { canal: "threads", checkpoint: {}, destino: { ativo: true, canal: "threads", identificador: "123", credencial: "META_EMPRESA" } } as Entrega;

describe("publicação Threads", () => {
  it("valida o limite de texto antes de enfileirar", () => {
    expect(publicacaoSchema.safeParse({ ...payload, texto: "a".repeat(500) }).success).toBe(true);
    expect(publicacaoSchema.safeParse({ ...payload, texto: "a".repeat(501) }).success).toBe(false);
  });
  it("persiste container e publicação antes do permalink", async () => {
    const request = vi.fn<Requisicao>().mockResolvedValueOnce({ id: "456" }).mockResolvedValueOnce({ status: "FINISHED" }).mockResolvedValueOnce({ id: "789" }).mockRejectedValueOnce(new Error("timeout"));
    const checkpoint = vi.fn();
    expect(await publicar(post, delivery, checkpoint, { request, token: "test" })).toEqual({ id: "789", url: null });
    expect(request.mock.calls[0][2]?.get("media_type")).toBe("TEXT");
    expect(request.mock.calls[2][2]?.get("creation_id")).toBe("456");
    expect(checkpoint.mock.calls).toEqual([[{ container: "456" }], [{ idPublicado: "789" }]]);
    expect(checkpoint.mock.invocationCallOrder[1]).toBeLessThan(request.mock.invocationCallOrder[3]);
  });
  it("retoma container em processamento sem criar outro", async () => {
    const request = vi.fn<Requisicao>().mockResolvedValue({ status: "IN_PROGRESS" });
    await expect(publicar(post, { ...delivery, checkpoint: { container: "456" } }, vi.fn(), { request, token: "test" })).rejects.toMatchObject({ transitoria: true, ambigua: false });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][2]).toBeUndefined();
  });
  it("container já publicado exige conferência e não republica", async () => {
    const request = vi.fn<Requisicao>().mockResolvedValue({ status: "PUBLISHED" });
    await expect(publicar(post, { ...delivery, checkpoint: { container: "456" } }, vi.fn(), { request, token: "test" })).rejects.toMatchObject({ ambigua: true });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("checkpoint confirmado não repete chamadas", async () => {
    const request = vi.fn<Requisicao>();
    expect(await publicar(post, { ...delivery, checkpoint: { idPublicado: "789" } }, vi.fn(), { request, token: "test" })).toEqual({ id: "789", url: null });
    expect(request).not.toHaveBeenCalled();
  });
  it("falha após publicação não é tratada como recusa do provedor", async () => {
    const request = vi.fn<Requisicao>().mockResolvedValueOnce({ status: "FINISHED" }).mockResolvedValueOnce({});
    await expect(publicar(post, { ...delivery, checkpoint: { container: "456" } }, vi.fn(), { request, token: "test" })).rejects.toMatchObject({ ambigua: true });
  });
});
