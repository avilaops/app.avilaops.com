import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { descricaoDoLembrete } from "@/lib/regua-cobranca-email-ui";

const estado = vi.hoisted(() => ({ admin: vi.fn(), dono: vi.fn(), origem: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAdmin: estado.admin, ehDono: estado.dono }));
vi.mock("@/lib/http", () => ({ sameOrigin: estado.origem }));
vi.mock("@/lib/prisma", () => ({ prisma: { billingEmailDispatch: { updateMany: estado.updateMany } } }));

const { DELETE } = await import("@/app/api/billing/faturas/[id]/lembretes/[dispatchId]/route");

describe("controles da régua na ficha", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.admin.mockResolvedValue({ id: "admin-1", role: "OWNER" });
    estado.dono.mockReturnValue(true);
    estado.origem.mockReturnValue(true);
    estado.updateMany.mockResolvedValue({ count: 1 });
  });

  it("descreve etapa, estado e horário para a pessoa", () => {
    expect(descricaoDoLembrete({ stage: "PRE_DUE", status: "PENDING", scheduledFor: "2026-11-15T12:00:00.000Z" }))
      .toBe("5 dias antes • Agendado • 15/11/2026, 09:00");
  });

  it("cancela somente o item pendente da fatura indicada", async () => {
    const resposta = await DELETE(
      new NextRequest("https://app.avilaops.com/api/billing/faturas/fatura-1/lembretes/envio-1", {
        method: "DELETE",
        headers: { origin: "https://app.avilaops.com" },
      }),
      { params: Promise.resolve({ id: "fatura-1", dispatchId: "envio-1" }) },
    );
    expect(resposta.status).toBe(200);
    expect(estado.updateMany).toHaveBeenCalledWith({
      where: { id: "envio-1", invoiceId: "fatura-1", status: "PENDING" },
      data: expect.objectContaining({ status: "CANCELLED" }),
    });
  });

  it("não revela existência do item para quem não é dono", async () => {
    estado.dono.mockReturnValue(false);
    const resposta = await DELETE(
      new NextRequest("https://app.avilaops.com/api/billing/faturas/fatura-1/lembretes/envio-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "fatura-1", dispatchId: "envio-1" }) },
    );
    expect(resposta.status).toBe(403);
    expect(estado.updateMany).not.toHaveBeenCalled();
  });
});
