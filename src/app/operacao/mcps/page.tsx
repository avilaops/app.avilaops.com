import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { ehDono, getAdmin } from "@/lib/auth";
import { contextoDaSecao } from "@/lib/navegacao";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Inventário persistido, uma publicação por MCP.
 * enabled=false significa que a integração ainda não foi homologada.
 * Não consulta endpoints MCP e nunca transforma HTTP 200 em sucesso de MCP.
 */
export default async function PublicacoesMcpPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  if (!ehDono(admin.role)) redirect("/operacao");

  const publicacoes = await prisma.mcpPublication.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="mcps">
      <CabecalhoTela
        titulo="Publicações MCP"
        descricao="Uma publicação independente por aplicação."
        {...contextoDaSecao("mcps")}
      />
      <main className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-12">
        <p className="text-sm text-muted-foreground">
          Cadastro no PostgreSQL. Endpoints registrados não significam que uma
          publicação esteja acessível, autenticada ou homologada. O monitoramento
          de disponibilidade será incorporado após validar cada contrato MCP.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-3 font-semibold">Publicação</th>
                <th className="px-4 py-3 font-semibold">Domínio</th>
                <th className="px-4 py-3 font-semibold">Endpoint cadastrado</th>
                <th className="px-4 py-3 font-semibold">Homologação</th>
              </tr>
            </thead>
            <tbody>
              {publicacoes.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3">{item.domain ?? "A definir"}</td>
                  <td className="px-4 py-3 font-mono text-xs break-all">
                    {item.endpoint ?? "A definir"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.enabled ? "Habilitado no cadastro" : "Pendente"}
                  </td>
                </tr>
              ))}
              {publicacoes.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-muted-foreground">
                  Nenhuma publicação cadastrada.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <section className="rounded-xl border border-border p-4 text-sm">
          <h2 className="font-semibold">Serviços de apoio</h2>
          <p className="mt-2 text-muted-foreground">
            Hindsight: memoria.avilaops.com (interface própria).
            Experiments: ml.avilaops.com. Painel central: app.avilaops.com.
            PostgreSQL concentrado no servidor applications; sem migração de
            bancos de outras aplicações por esta funcionalidade.
          </p>
        </section>
      </main>
    </AppShell>
  );
}
