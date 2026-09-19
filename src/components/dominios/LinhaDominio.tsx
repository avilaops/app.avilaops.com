import Link from "next/link";
import BadgeStatus from "@/components/sistema/Status";
import BotaoEvidencia from "@/components/hub-social/FolhaEvidencia";
import { diasAteVencer, JANELA_ATENCAO_DIAS, type DomainRow } from "@/components/dominios/tipos";
import { frescor, type Evidencia } from "@/lib/evidencia";
import { cn } from "@/lib/utils";

/**
 * Uma zona do Cloudflare. A linha inteira leva ao SEO do domínio: o link do
 * fqdn estica um ::after por cima da linha, e os controles internos (nome da
 * organização, botão de evidência) sobem com z-10. Nada de link dentro de
 * link nem botão dentro de link.
 */

const formatoData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

function formatarData(iso: string | null): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : formatoData.format(data);
}

/** Vencimento em uma frase, com o tom que a cor usa. */
function lerVencimento(expiresAt: string | null, agora: Date) {
  const data = formatarData(expiresAt);
  if (!data) return null;

  const dias = diasAteVencer(expiresAt, agora);
  if (dias === null) return { data, texto: `expira ${data}`, critico: false, atencao: false };
  if (dias < 0) return { data, texto: `venceu ${data}`, critico: true, atencao: false };
  if (dias === 0) return { data, texto: `vence hoje (${data})`, critico: true, atencao: false };

  const prazo = dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`;
  return { data, texto: `expira ${data} · ${prazo}`, critico: dias <= 14, atencao: dias <= JANELA_ATENCAO_DIAS };
}

function Separador() {
  return (
    <span aria-hidden="true" className="max-[560px]:hidden">
      ·
    </span>
  );
}

export default function LinhaDominio({ dominio, lidoEm }: { dominio: DomainRow; lidoEm: string }) {
  const agora = new Date(lidoEm);
  const hrefSeo = `/hub-social/seo?domain=${encodeURIComponent(dominio.fqdn)}`;
  const sync = frescor(dominio.dnsLastSyncedAt, agora);
  const vencimento = lerVencimento(dominio.expiresAt, agora);
  const registros = dominio.dnsRecordCount === 1 ? "1 registro DNS" : `${dominio.dnsRecordCount} registros DNS`;

  // Domínio nosso que o registro diz não existir é alarme. A data antiga fica
  // (apagá-la esconderia o problema), mas a linha precisa dizer que ela está
  // velha, senão o cliente aparece com vencimento de um domínio que caiu.
  const semRegistro = dominio.registroBrStatus === "LIVRE";

  // O vencimento não vem do Cloudflare. Quem o publica é o registro do
  // domínio, e a evidência precisa dizer isso, senão o número parece ter
  // saído da zona.
  const observacoes = [
    dominio.cloudflareZoneId ? `Zona do Cloudflare: ${dominio.cloudflareZoneId}` : null,
    dominio.registroBrTitular ? `Titular no registro: ${dominio.registroBrTitular}` : null,
    semRegistro
      ? "O Registro.br não encontrou registro para este domínio na última leitura. A data mostrada é a anterior e não tem mais fonte."
      : null,
    dominio.registroBrLidoEm
      ? null
      : "Sem leitura do Registro.br para este domínio. Use “Atualizar vencimentos”.",
  ].filter(Boolean);

  const evidencia: Evidencia = {
    rotulo: dominio.fqdn,
    origem: dominio.registroBrLidoEm
      ? "domainAsset (Postgres); expires_at e registrar vindos do RDAP do Registro.br"
      : "domainAsset (Postgres)",
    formula: [
      "uma linha de domains por zona do Cloudflare; status, plano e última sincronização gravados por POST /api/integrations/cloudflare/sync",
      dominio.registroBrLidoEm
        ? "vencimento gravado por POST /api/integrations/registro-br/sync, do evento expiration do RDAP em rdap.registro.br"
        : "vencimento ainda não consultado no registro",
    ].join("; "),
    referencia: dominio.id,
    lidoEm,
    gravadoEm: dominio.registroBrLidoEm ?? dominio.dnsLastSyncedAt,
    observacao: observacoes.length > 0 ? observacoes.join(" · ") : undefined,
    bruto: dominio,
  };

  return (
    <li
      className={cn(
        "relative flex min-h-14 items-center gap-3 px-4 py-2.5 text-foreground transition-colors hover:bg-accent motion-reduce:transition-none",
        "has-[[data-linha-link]:active]:bg-accent has-[[data-linha-link]:focus-visible]:ring-[3px] has-[[data-linha-link]:focus-visible]:ring-inset has-[[data-linha-link]:focus-visible]:ring-ring/50",
      )}
    >
      <div className="min-w-0 flex-1">
        <Link
          href={hrefSeo}
          data-linha-link=""
          aria-label={`Abrir SEO de ${dominio.fqdn}`}
          className="block truncate font-mono text-[15px] font-medium text-foreground no-underline outline-none after:absolute after:inset-0 after:content-[''] min-[821px]:text-sm"
        >
          {dominio.fqdn}
        </Link>

        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[13px] leading-5 text-muted-foreground max-[560px]:flex-col max-[560px]:gap-0">
          {dominio.organizationId ? (
            <Link
              href={`/clientes/${encodeURIComponent(dominio.organizationId)}`}
              className="relative z-10 truncate text-primary no-underline outline-none hover:underline focus-visible:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {dominio.organizationName}
            </Link>
          ) : (
            <span className="truncate">{dominio.organizationName}</span>
          )}
          <Separador />
          <span>{dominio.cloudflarePlan ? `Plano ${dominio.cloudflarePlan}` : "Sem plano"}</span>
          <Separador />
          <span className="tabular-nums">{registros}</span>
          <Separador />
          <span>{dominio.dnsLastSyncedAt ? `sync ${sync.texto}` : "nunca sincronizado"}</span>
          {semRegistro ? (
            <>
              <Separador />
              <span className="font-medium text-[color:var(--red)]">
                sem registro no .br
                {vencimento ? ` (data de ${vencimento.data}, agora sem fonte)` : ""}
              </span>
            </>
          ) : vencimento ? (
            <>
              <Separador />
              <span
                className={cn(
                  "tabular-nums",
                  vencimento.critico
                    ? "font-medium text-[color:var(--red)]"
                    : vencimento.atencao
                      ? "font-medium text-[color:var(--amber)]"
                      : undefined,
                )}
              >
                {vencimento.texto}
                {dominio.autoRenew ? " · renovação automática" : ""}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1 self-center">
        <BadgeStatus status={dominio.cloudflareStatus} />
        <span className="relative z-10">
          <BotaoEvidencia evidencia={evidencia} rotulo={`Evidência de ${dominio.fqdn}`} />
        </span>
        <span aria-hidden="true" className="text-lg leading-none text-muted-foreground">
          ›
        </span>
      </div>
    </li>
  );
}
