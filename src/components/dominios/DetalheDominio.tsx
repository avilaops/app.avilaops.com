import Link from "next/link";
import CabecalhoPagina from "@/components/hub-social/CabecalhoPagina";
import ListaChaveValor from "@/components/hub-social/ListaChaveValor";
import EstadoVazio from "@/components/hub-social/EstadoVazio";
import BadgeStatus from "@/components/sistema/Status";
import { CartaoLista, LINHA_ITEM, LINHA_LINK, formatarDataHora } from "@/components/hub-social/comum";
import PainelDns from "@/components/dominios/PainelDns";
import {
  BASE,
  formatarData,
  rotuloDaSituacao,
  tomDaSituacao,
  type CapacidadesDeEscrita,
  type DominioDaCarteira,
} from "@/components/dominios/dados";
import { rotuloDoServico, type RegistroDns } from "@/lib/dominios/dns";
import { cn } from "@/lib/utils";

/**
 * A ficha de um domínio: o que é, de quem é, até quando vale e o que dá para
 * fazer com ele.
 *
 * Sem abas próprias. O módulo de Ícones já resolveu assim e o celular
 * agradece: seções empilhadas numa rolagem só, em vez de uma segunda barra de
 * navegação dentro de uma tela que já vive sob a barra do Hub Social.
 */
export default function DetalheDominio({
  dominio,
  registros,
  erroDns,
  escrita,
  historico,
}: {
  dominio: DominioDaCarteira;
  registros: RegistroDns[];
  erroDns: string | null;
  escrita: CapacidadesDeEscrita;
  historico: { quando: string; acao: string; quem: string | null; resultado: string | null }[];
}) {
  const prazo =
    dominio.diasRestantes === null
      ? null
      : dominio.diasRestantes < 0
        ? `venceu há ${Math.abs(dominio.diasRestantes)} dias`
        : dominio.diasRestantes === 0
          ? "vence hoje"
          : `faltam ${dominio.diasRestantes} dias`;

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        eyebrow="Domínios"
        titulo={dominio.fqdn}
        subtitulo={dominio.cliente}
        voltar={{ href: BASE, label: "Domínios" }}
        meta={
          <BadgeStatus
            status={dominio.situacao}
            texto={rotuloDaSituacao(dominio)}
            tom={tomDaSituacao(dominio)}
          />
        }
      />

      {dominio.vereditoRegistro === "LIVRE" ? (
        <p role="alert" className="text-[15px] leading-[1.5] text-[color:var(--red)] min-[821px]:text-sm">
          <strong className="font-semibold">Este domínio não consta no registro.</strong> A data abaixo é a da
          última leitura em que ele ainda constava, e não tem mais fonte. Confirme antes de cobrar renovação.
        </p>
      ) : null}

      <ListaChaveValor
        titulo="Informações"
        itens={[
          { rotulo: "Domínio", valor: dominio.fqdn, mono: true, copiar: dominio.fqdn },
          {
            rotulo: "Cliente",
            valor: dominio.cliente,
            href: dominio.clienteId ? `/clientes/${dominio.clienteId}` : undefined,
          },
          { rotulo: "Situação", valor: rotuloDaSituacao(dominio) },
          {
            rotulo: "Vencimento",
            valor: dominio.expiraEm ? `${formatarData(dominio.expiraEm)}${prazo ? ` · ${prazo}` : ""}` : null,
            vazio: "sem data conhecida",
          },
          { rotulo: "Titular", valor: dominio.titular, vazio: "não publicado" },
          { rotulo: "Renovação automática", valor: dominio.renovacaoAutomatica ? "ligada" : "desligada" },
          {
            rotulo: "Serviço de DNS",
            valor: dominio.dnsAqui
              ? `${rotuloDoServico(dominio.servicoDns)} · ${dominio.registrosDns} registros`
              : rotuloDoServico(dominio.servicoDns),
          },
          {
            rotulo: "Última sincronização",
            valor: formatarDataHora(dominio.sincronizadoEm),
            vazio: "nunca sincronizado",
          },
          {
            rotulo: "Última consulta ao registro",
            valor: formatarDataHora(dominio.registroLidoEm),
            vazio: "nunca consultado",
          },
        ]}
      />

      <PainelDns
        fqdn={dominio.fqdn}
        temZona={dominio.dnsAqui}
        registros={registros}
        erro={erroDns}
        podeEditar={escrita.editarDns}
      />

      <CartaoLista titulo="Ações" descricao="O que a central consegue fazer com este domínio agora.">
        <ul className="m-0 list-none p-0">
          <li className={LINHA_ITEM}>
            <Link href={`/hub-social/seo?domain=${encodeURIComponent(dominio.fqdn)}`} className={LINHA_LINK}>
              <span className="min-w-0 flex-1 text-[15px] font-medium">Ver SEO do site</span>
            </Link>
          </li>
          <li className={LINHA_ITEM}>
            <Link href={`/hub-social/icones?domain=${encodeURIComponent(dominio.fqdn)}`} className={LINHA_LINK}>
              <span className="min-w-0 flex-1 text-[15px] font-medium">Conferir ícones da marca</span>
            </Link>
          </li>
          {dominio.clienteId ? (
            <li className={LINHA_ITEM}>
              <Link href={`/clientes/${dominio.clienteId}`} className={LINHA_LINK}>
                <span className="min-w-0 flex-1 text-[15px] font-medium">Abrir ficha do cliente</span>
              </Link>
            </li>
          ) : null}
          <li className={LINHA_ITEM}>
            <div className={cn(LINHA_LINK, "cursor-default")}>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">Renovar domínio</span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground">
                  {escrita.renovar ? "Disponível" : "Ainda não habilitado nesta conta"}
                </span>
              </span>
            </div>
          </li>
          <li className={LINHA_ITEM}>
            <div className={cn(LINHA_LINK, "cursor-default")}>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">Transferir domínio</span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground">
                  {escrita.transferir ? "Disponível" : "Ainda não habilitado nesta conta"}
                </span>
              </span>
            </div>
          </li>
        </ul>
      </CartaoLista>

      <CartaoLista titulo="Histórico" descricao="As operações registradas para este domínio.">
        {historico.length === 0 ? (
          <div className="p-4">
            <EstadoVazio
              compacto
              titulo="Nenhuma operação registrada"
              descricao="Sincronização, consulta e alteração de DNS aparecem aqui assim que acontecerem."
            />
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {historico.map((evento, indice) => (
              <li key={`${evento.quando}-${indice}`} className={cn(LINHA_ITEM, "px-4 py-3")}>
                <span className="block text-[15px] font-medium text-foreground">{evento.acao}</span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground">
                  {formatarDataHora(evento.quando)}
                  {evento.quem ? ` · ${evento.quem}` : ""}
                  {evento.resultado ? ` · ${evento.resultado}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CartaoLista>
    </div>
  );
}
