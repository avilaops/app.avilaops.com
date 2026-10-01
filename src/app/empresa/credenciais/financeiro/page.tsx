import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { Grupo, LinhaLink } from "@/components/sistema/Lista";
import { ehDono, getAdmin } from "@/lib/auth";
import { listarCredenciais } from "@/lib/credenciais";
import { FINANCEIRAS } from "@/lib/credenciais-financeiro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financeiro - Credenciais" };

/**
 * Escolher de qual financeira se vai mexer na credencial.
 *
 * Cada linha diz o quanto já está guardado, porque "configurado" e "a
 * configurar" é a única pergunta que se faz olhando esta lista.
 */
export default async function FinanceiroCredenciaisPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  if (!ehDono(admin.role)) redirect("/mais");

  const guardadas = await listarCredenciais();
  const preenchidas = new Set(guardadas.filter((c) => c.preenchida).map((c) => c.chave));

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="menu">
      <CabecalhoTela
        titulo="Financeiro"
        descricao="Quem recebe e quem paga pela casa."
        voltar={{ href: "/empresa/credenciais", rotulo: "Voltar para Credenciais" }}
      />

      <div className="pilha">
        <Grupo titulo="Escolha o serviço">
          {FINANCEIRAS.map((financeira) => {
            const total = financeira.campos.length;
            const prontas = financeira.campos.filter((c) => preenchidas.has(c.chave)).length;
            const faltaObrigatoria = financeira.campos.some(
              (c) => c.obrigatorio && !preenchidas.has(c.chave),
            );

            return (
              <LinhaLink
                key={financeira.slug}
                href={`/empresa/credenciais/financeiro/${financeira.slug}`}
                titulo={financeira.nome}
                descricao={financeira.papel}
                icone="financeiro"
                tom={total === 0 ? "neutro" : faltaObrigatoria ? "amarelo" : "azul"}
                // Sem chave no catálogo, "0 de 0" seria uma meia-verdade: a
                // ficha existe, mas não há o que preencher. A lista diz isso.
                valor={total === 0 ? "sem integração" : `${prontas}/${total}`}
              />
            );
          })}
        </Grupo>
      </div>
    </AppShell>
  );
}
