import { prisma } from "@/lib/prisma";
import { ehDominioBr } from "@/lib/dominio";
import { consultarDominioBr, diasAte, type ConsultaRegistroBr } from "@/lib/registro-br";

/**
 * Preenche a data de vencimento dos domínios `.br` da carteira a partir do
 * Registro.br.
 *
 * As colunas `expires_at` e `registrar` de `operations.domains` existem desde
 * o começo e eram lidas em três telas: `/operacao` ("Domínios em 60 dias"),
 * `/operacao/obs` (que reprova a saúde do domínio a 14 dias do vencimento) e a
 * linha de `/hub-social/dominios`. Mas ninguém as escrevia: a sincronização do
 * Cloudflare só conhece zona, plano e DNS, e o Cloudflare não sabe quando o
 * domínio vence no registro. Na prática o alerta de renovação nunca disparou.
 * É esse buraco que esta sincronização fecha.
 */

const PROVEDOR = "registro_br";

/** Cortesia com um RDAP público e gratuito: uma consulta por vez, com respiro. */
const PAUSA_ENTRE_CONSULTAS_MS = 350;

/** A partir daqui a renovação vira assunto. É a mesma régua de `/operacao`. */
export const JANELA_ATENCAO_DIAS = 60;

export type ResultadoDominio = {
  id: string;
  fqdn: string;
  organizacao: string;
  status: ConsultaRegistroBr["status"];
  expiraEm: string | null;
  diasRestantes: number | null;
  titular: string | null;
  mensagem: string;
  /** Verdadeiro quando esta consulta mudou `expires_at` ou `registrar` no banco. */
  atualizado: boolean;
};

export type ResumoSincronizacao = {
  consultados: number;
  atualizados: number;
  vencendoEm60Dias: number;
  semDataPublicada: number;
  falharam: number;
  /** Domínios nossos que o Registro.br diz que não têm registro. Isto é grave. */
  semRegistro: string[];
  executadoEm: string;
};

export type SincronizacaoVencimentos = {
  resumo: ResumoSincronizacao;
  dominios: ResultadoDominio[];
};

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Consulta cada domínio `.br` da carteira e grava o que voltou.
 *
 * `forcar` pula o cache em memória. É o que o botão "Atualizar vencimentos"
 * usa, para que apertar o botão signifique mesmo ir à rede.
 */
export async function sincronizarVencimentosBr(
  actorId: string | null,
  opcoes: { forcar?: boolean } = {},
): Promise<SincronizacaoVencimentos> {
  const executadoEm = new Date();

  const carteira = await prisma.domainAsset.findMany({
    where: { fqdn: { endsWith: ".br" } },
    select: {
      id: true,
      fqdn: true,
      expiresAt: true,
      registrar: true,
      organization: { select: { name: true } },
    },
    orderBy: { fqdn: "asc" },
  });

  const dominios: ResultadoDominio[] = [];
  const semRegistro: string[] = [];
  let atualizados = 0;
  let falharam = 0;
  let vencendoEm60Dias = 0;
  let semDataPublicada = 0;

  for (const [indice, domainAsset] of carteira.entries()) {
    if (indice > 0) await dormir(PAUSA_ENTRE_CONSULTAS_MS);

    // Defesa contra um `endsWith: ".br"` que pegue algo como `x.com.brasil`.
    if (!ehDominioBr(domainAsset.fqdn)) continue;

    let consulta: ConsultaRegistroBr;
    try {
      consulta = await consultarDominioBr(domainAsset.fqdn, { forcar: opcoes.forcar });
    } catch (erro) {
      falharam += 1;
      const mensagem = erro instanceof Error ? erro.message : "Falha ao consultar o Registro.br.";
      await registrarConexao(domainAsset.fqdn, "ERROR", mensagem, { erro: mensagem });
      dominios.push({
        id: domainAsset.id,
        fqdn: domainAsset.fqdn,
        organizacao: domainAsset.organization.name,
        status: "DESCONHECIDO",
        expiraEm: domainAsset.expiresAt?.toISOString() ?? null,
        diasRestantes: diasAte(domainAsset.expiresAt?.toISOString() ?? null, executadoEm),
        titular: null,
        mensagem,
        atualizado: false,
      });
      continue;
    }

    const dias = diasAte(consulta.expiraEm, executadoEm);
    if (consulta.status === "REGISTRADO" && consulta.expiraEm === null) semDataPublicada += 1;
    if (dias !== null && dias <= JANELA_ATENCAO_DIAS) vencendoEm60Dias += 1;

    // Domínio nosso que sumiu do registro é alarme, não atualização silenciosa:
    // a data antiga fica, porque apagá-la esconderia o problema das telas.
    if (consulta.status === "LIVRE") semRegistro.push(domainAsset.fqdn);

    let atualizado = false;
    if (consulta.status === "REGISTRADO") {
      const novaData = consulta.expiraEm ? new Date(consulta.expiraEm) : null;
      const mudouData = (domainAsset.expiresAt?.getTime() ?? null) !== (novaData?.getTime() ?? null);
      const mudouRegistrador = domainAsset.registrar !== "Registro.br";

      if (mudouData || mudouRegistrador) {
        await prisma.domainAsset.update({
          where: { id: domainAsset.id },
          data: { expiresAt: novaData, registrar: "Registro.br" },
        });
        atualizado = true;
        atualizados += 1;
      }
    }

    if (consulta.status !== "DESCONHECIDO") {
      await registrarConexao(
        domainAsset.fqdn,
        consulta.status === "REGISTRADO" && (dias === null || dias > JANELA_ATENCAO_DIAS) ? "ACTIVE" : "WARNING",
        null,
        {
          status: consulta.status,
          expiraEm: consulta.expiraEm,
          diasRestantes: dias,
          titular: consulta.titular,
          documentoTitular: consulta.documentoTitular,
          registradoEm: consulta.registradoEm,
          nameservers: consulta.nameservers,
          statusRdap: consulta.statusRdap,
          fontes: consulta.fontes,
          consultadoEm: consulta.consultadoEm,
        },
      );
    } else {
      falharam += 1;
      await registrarConexao(domainAsset.fqdn, "ERROR", consulta.mensagem, { fontes: consulta.fontes });
    }

    dominios.push({
      id: domainAsset.id,
      fqdn: domainAsset.fqdn,
      organizacao: domainAsset.organization.name,
      status: consulta.status,
      expiraEm: consulta.expiraEm,
      diasRestantes: dias,
      titular: consulta.titular,
      mensagem: consulta.mensagem,
      atualizado,
    });
  }

  const resumo: ResumoSincronizacao = {
    consultados: dominios.length,
    atualizados,
    vencendoEm60Dias,
    semDataPublicada,
    falharam,
    semRegistro,
    executadoEm: executadoEm.toISOString(),
  };

  await prisma.operationsAuditEvent.create({
    data: {
      actorId,
      action: "REGISTRO_BR_VENCIMENTOS_SINCRONIZADOS",
      entityType: "DomainAsset",
      metadata: JSON.parse(JSON.stringify(resumo)),
    },
  });

  return { resumo, dominios };
}

/**
 * Guarda a última leitura por domínio em `integration_connections`, do mesmo
 * jeito que `domain_renewal` e `seo_audit`. É o que a tela de observabilidade
 * já sabe ler, e evita uma coluna nova em `domains` só para carimbar horário.
 */
async function registrarConexao(
  fqdn: string,
  status: "ACTIVE" | "WARNING" | "ERROR",
  erro: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  const dados = {
    status,
    lastSyncedAt: new Date(),
    lastSyncStatus: erro ? "ERROR" : "SUCCESS",
    lastSyncError: erro,
    metadata: JSON.parse(JSON.stringify(metadata)),
  };

  await prisma.integrationConnection.upsert({
    where: { provider_siteUrl: { provider: PROVEDOR, siteUrl: fqdn } },
    create: { provider: PROVEDOR, siteUrl: fqdn, ...dados },
    update: dados,
  });
}

export const PROVEDOR_REGISTRO_BR = PROVEDOR;
