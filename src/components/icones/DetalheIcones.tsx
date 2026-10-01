import BadgeStatus from "@/components/sistema/Status";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import GradeMetricas, { Metrica } from "@/components/hub-social/Metricas";
import ListaChaveValor, { BotaoCopiar } from "@/components/hub-social/ListaChaveValor";
import { CartaoLista, LINHA_ITEM, evidenciaConexao, formatarDataHora, tomNota } from "@/components/hub-social/comum";
import PainelIcones from "@/components/icones/PainelIcones";
import { BASE, conexaoSerializada, type ItemDominio } from "@/components/icones/dados";
import { PROVIDER_ICONES } from "@/lib/icones/auditoria";
import { manifesto, trechoHtml } from "@/lib/marca/especificacoes";

/**
 * O conjunto de um domínio, item a item. É a tela que responde "este site está
 * dentro do padrão de entrega?" — e, quando não está, o que exatamente falta e
 * o que colar para resolver.
 */
export default function DetalheIcones({ item }: { item: ItemDominio }) {
  const { fqdn, auditoria } = item;
  const conexao = conexaoSerializada(item.conexao);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        eyebrow="Ícones"
        titulo={fqdn}
        subtitulo="Conjunto de ícones e manifesto conferidos contra o padrão de entrega da casa."
        voltar={{ href: BASE, label: "Ícones" }}
        meta={auditoria ? `Conferido ${formatarDataHora(auditoria.checkedAt)}` : "Sem auditoria"}
      />

      <PainelIcones fqdn={fqdn} />

      {!auditoria ? (
        <EstadoVazio
          titulo="Este domínio ainda não foi conferido"
          descricao="A conferência busca o favicon, o Apple Touch Icon, o manifesto e a imagem de compartilhamento direto no site, e mede cada um."
        />
      ) : (
        <>
          <GradeMetricas rotulo="Nota do padrão">
            <Metrica
              rotulo="Padrão de ícones"
              valor={`${auditoria.nota}/100`}
              tom={tomNota(auditoria.nota, 90, 60)}
              evidencia={evidenciaConexao(
                "Padrão de ícones",
                "POST /api/integrations/icones/run",
                "soma dos pesos dos itens aprovados em avaliarPadrao(); os pesos somam 100",
                conexao,
                { observacao: "Régua mais dura que a do SEO: 90 para aprovado, porque isto é padrão de entrega." },
              )}
            />
            <Metrica
              rotulo="Itens aprovados"
              valor={`${auditoria.itens.filter((i) => i.ok).length}/${auditoria.itens.length}`}
              tom={auditoria.itens.every((i) => i.ok) ? "bom" : "atencao"}
              evidencia={evidenciaConexao(
                "Itens aprovados",
                "POST /api/integrations/icones/run",
                "itens com ok = true em avaliarPadrao()",
                conexao,
              )}
            />
          </GradeMetricas>

          <CartaoLista
            titulo="Padrão de entrega"
            descricao="Cada item existe porque o defeito correspondente já chegou a um site no ar."
          >
            <ul className="m-0 list-none p-0">
              {auditoria.itens.map((item_) => (
                <li key={item_.chave} className={`${LINHA_ITEM} px-4 py-3`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-foreground">{item_.rotulo}</p>
                      <p className="mt-0.5 text-[13px] leading-[1.45] text-muted-foreground">{item_.detalhe}</p>
                    </div>
                    <BadgeStatus
                      status={item_.ok ? "ok" : "fail"}
                      texto={item_.ok ? "Aprovado" : "Faltando"}
                      tom={item_.ok ? "bom" : "atencao"}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CartaoLista>

          <ListaChaveValor
            titulo="O que o site declara hoje"
            itens={[
              {
                rotulo: "Apple Touch Icon",
                valor: auditoria.coleta.html.cabeca?.appleTouchIcon,
                mono: true,
                vazio: "não declarado",
              },
              {
                rotulo: "Manifesto",
                valor: auditoria.coleta.manifesto.caminho,
                mono: true,
                vazio: "não encontrado",
              },
              {
                rotulo: "og:image",
                valor: auditoria.coleta.html.cabeca?.ogImage,
                mono: true,
                vazio: "não declarada",
              },
              {
                rotulo: "theme-color",
                valor: auditoria.coleta.html.cabeca?.themeColor,
                mono: true,
                vazio: "não declarada",
              },
            ]}
          />
        </>
      )}

      <CartaoLista
        titulo="Para colar no site"
        descricao="O padrão da casa, já com os nomes de arquivo que o gerador de ícones produz na ficha do cliente."
      >
        <div className="space-y-4 p-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[13px] font-semibold text-muted-foreground">Tags do &lt;head&gt;</p>
              <BotaoCopiar texto={trechoHtml()} rotulo="Copiar as tags" />
            </div>
            <pre className="detalhes-tecnicos overflow-x-auto rounded-lg bg-[color:var(--superficie-suave)] p-3 text-[12px] leading-[1.6]">
              {trechoHtml()}
            </pre>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[13px] font-semibold text-muted-foreground">site.webmanifest</p>
              <BotaoCopiar texto={manifesto(item.organizacao, null)} rotulo="Copiar o manifesto" />
            </div>
            <pre className="detalhes-tecnicos overflow-x-auto rounded-lg bg-[color:var(--superficie-suave)] p-3 text-[12px] leading-[1.6]">
              {manifesto(item.organizacao, null)}
            </pre>
          </div>
        </div>
      </CartaoLista>

      {conexao ? (
        <ListaChaveValor
          compacto
          titulo="Procedência"
          itens={[
            { rotulo: "Provedor", valor: PROVIDER_ICONES, mono: true },
            { rotulo: "Última conferência", valor: formatarDataHora(conexao.lastSyncedAt), vazio: "nunca" },
            { rotulo: "Resultado", valor: conexao.lastSyncStatus, vazio: "—" },
          ]}
        />
      ) : null}
    </div>
  );
}
