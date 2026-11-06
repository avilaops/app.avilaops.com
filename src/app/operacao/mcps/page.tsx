import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { getAdmin } from "@/lib/auth";

/**
 * Inventário inicial de publicações MCP.
 * Endereços são alvos de configuração, não provas de disponibilidade.
 * Nenhuma chamada remota ou operação de escrita é feita nesta tela.
 */
const publicacoes = [
  { nome: "Auth", dominio: "auth.avilaops.com", endpoint: "https://auth.avilaops.com/mcp" },
  { nome: "Mail", dominio: "mail.avilaops.com", endpoint: "https://mail.avilaops.com/mcp" },
  { nome: "CRM", dominio: "crm.avilaops.com", endpoint: "https://crm.avilaops.com/mcp" },
  { nome: "TMS", dominio: "tms.avilaops.com", endpoint: "https://tms.avilaops.com/mcp" },
  { nome: "CMS", dominio: "cms.avilaops.com", endpoint: "https://cms.avilaops.com/mcp" },
  { nome: "Lojas", dominio: "lojas.avilaops.com", endpoint: "https://lojas.avilaops.com/mcp" },
  { nome: "ERP", dominio: "erp.avilaops.com", endpoint: "https://erp.avilaops.com/mcp" },
  { nome: "MLOps / Experiments", dominio: "ml.avilaops.com", endpoint: "https://ml.avilaops.com/mcp" },
  { nome: "Avx-tools", dominio: null, endpoint: null },
  { nome: "n8n", dominio: "n8n.avilaops.com", endpoint: null },
] as const;

export default async function PublicacoesMcpPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="operations">
      <CabecalhoTela
        titulo="Publicações MCP"
        descricao="Um MCP por publicação, com endpoint e ciclo de vida independentes."
      />
      <main className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-12">
        <p className="text-sm text-muted-foreground">
          Inventário inicial de arquitetura. Os endpoints abaixo são propostos e
          ainda não foram verificados em produção. Não representam serviços ativos.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-3 font-semibold">MCP</th>
                <th className="px-4 py-3 font-semibold">Domínio</th>
                <th className="px-4 py-3 font-semibold">Endpoint planejado</th>
                <th className="px-4 py-3 font-semibold">Situação</th>
              </tr>
            </thead>
            <tbody>
              {publicacoes.map((item) => (
                <tr key={item.nome} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{item.nome}</td>
                  <td className="px-4 py-3">{item.dominio ?? "A definir"}</td>
                  <td className="px-4 py-3 font-mono text-xs break-all">{item.endpoint ?? "A definir"}</td>
                  <td className="px-4 py-3 text-muted-foreground">Não verificado</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="rounded-xl border border-border p-4 text-sm">
          <h2 className="font-semibold">Serviços de apoio</h2>
          <p className="mt-2 text-muted-foreground">
            Hindsight: memoria.avilaops.com (interface própria).
            Painel central: app.avilaops.com. Persistência PostgreSQL:
            servidor applications. Os bancos existentes devem ser inventariados
            antes de qualquer migração.
          </p>
        </section>
      </main>
    </AppShell>
  );
}
