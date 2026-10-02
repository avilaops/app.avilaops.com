import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  autenticar: vi.fn(),
  detalhe: vi.fn(),
}));
vi.mock("@/lib/chaves-api", () => ({
  getAdminOuChave: mock.autenticar,
  rastroDaChave: vi.fn(),
}));
vi.mock("@/lib/projects", () => ({
  getProjectDetail: mock.detalhe,
  ERRO_URL_DE_PROJETO: "",
  urlDeProjetoValida: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/http", () => ({ cleanText: vi.fn(), sameOrigin: vi.fn() }));

import { GET } from "@/app/api/projects/[id]/route";

const arquivo = {
  id: "f1", name: "escopo.pdf", kind: "pdf", mimeType: "application/pdf",
  sizeBytes: 120, notes: "Escopo aprovado", createdAt: new Date("2026-10-02T12:00:00Z"),
  storageKey: "interno/cliente/escopo.pdf", uploadedBy: "privado@example.invalid",
  projectId: "p1", campoInternoFuturo: "também privado",
};
const projeto = {
  id: "p1", title: "Projeto", tasks: [{ id: "t1", title: "Tarefa" }],
  organization: { id: "o1", name: "Cliente" }, files: [arquivo],
};
const contexto = () => ({ params: Promise.resolve({ id: "p1" }) });
const pedido = () => new NextRequest("http://localhost:3000/api/projects/p1", {
  headers: { authorization: "Bearer avk_teste" },
});

beforeEach(() => {
  vi.resetAllMocks();
  mock.autenticar.mockResolvedValue({
    admin: { id: "dono", role: "OWNER", chave: { id: "k1", prefixo: "avk_teste", nome: "Teste" } },
  });
  mock.detalhe.mockResolvedValue(projeto);
});

describe("GET projeto com escopo projetos:ler", () => {
  it("preserva tarefas e mídia pública sem expor armazenamento ou uploader", async () => {
    const resposta = await GET(pedido(), contexto());
    expect(resposta.status).toBe(200);
    expect(mock.autenticar).toHaveBeenCalledWith(expect.any(NextRequest), "projetos:ler");
    expect(await resposta.json()).toEqual({ project: {
      ...projeto,
      files: [{
        id: arquivo.id, name: arquivo.name, kind: arquivo.kind, mimeType: arquivo.mimeType,
        sizeBytes: arquivo.sizeBytes, notes: arquivo.notes, createdAt: arquivo.createdAt.toISOString(),
      }],
    } });
    // A projeção não altera o objeto que a tela e outros consumidores usam.
    expect(projeto.files[0].storageKey).toBe(arquivo.storageKey);
  });

  it("projeto sem mídia mantém a lista vazia", async () => {
    mock.detalhe.mockResolvedValue({ ...projeto, files: [] });
    expect((await (await GET(pedido(), contexto())).json()).project.files).toEqual([]);
  });

  it("chave recusada não chega à consulta do projeto", async () => {
    mock.autenticar.mockResolvedValue({ admin: null, erro: "Escopo não autorizado." });
    expect((await GET(pedido(), contexto())).status).toBe(401);
    expect(mock.detalhe).not.toHaveBeenCalled();
  });

  it("projeto inexistente continua respondendo 404", async () => {
    mock.detalhe.mockResolvedValue(null);
    expect((await GET(pedido(), contexto())).status).toBe(404);
  });
});
