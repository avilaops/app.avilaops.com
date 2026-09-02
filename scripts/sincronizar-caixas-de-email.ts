/**
 * Traz para a ficha do cliente as caixas de e-mail que já existem no
 * mail.avilaops.com.
 *
 * O painel não consulta o mail: ele lê o próprio espelho em
 * `operations.organization_integrations` (provider `mailbox:<endereço>`), e
 * esse espelho só é escrito quando a caixa nasce pelo botão "Criar caixa".
 * Caixa criada por fora — pelo /admin do auth, pelo n8n ou na mão — nunca
 * chegou à ficha. Foi o que aconteceu com o `cifrainssdeobras.com.br`: as duas
 * caixas respondem, e a ficha mostrava "Nenhuma caixa ainda".
 *
 * O casamento é pelo domínio da caixa contra `operations.domains`. Domínio que
 * não pertence a nenhum cliente fica de fora e aparece na lista: adivinhar o
 * dono daria a caixa de uma empresa a outra.
 *
 * Roda sem argumento em modo seco (só mostra o que faria); `--aplicar` grava.
 *
 *   npx tsx scripts/sincronizar-caixas-de-email.ts
 *   npx tsx scripts/sincronizar-caixas-de-email.ts --aplicar
 *
 * As caixas vêm do banco `avila_mail`, que é outro banco no mesmo Postgres: a
 * conexão do Prisma não alcança, e o servidor não tem dblink. Então a leitura
 * é por psql, com o mesmo usuário de sistema que o mail usa:
 *
 *   su - postgres -c "psql -d avila_mail -At -F'|' -f scripts/caixas.sql" > caixas.txt
 *
 * O caminho desse arquivo vai em CAIXAS_TSV. Sem ele o script explica e para,
 * em vez de concluir que não existe caixa nenhuma e não fazer nada.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const aplicar = process.argv.includes("--aplicar");

type CaixaDoMail = {
  endereco: string;
  dominio: string;
  status: string;
  display_name: string | null;
  quota_bytes: string | null;
};

/**
 * Lê o despejo do `avila_mail`: uma caixa por linha, campos separados por "|",
 * na ordem endereco|dominio|status|display_name|quota_bytes. É o formato que o
 * `psql -At -F'|'` cospe.
 */
function lerCaixasDoMail(): CaixaDoMail[] {
  const caminho = process.env.CAIXAS_TSV?.trim();
  if (!caminho) {
    throw new Error(
      "CAIXAS_TSV não informado: é o arquivo com o despejo das caixas do avila_mail (veja o cabeçalho deste script).",
    );
  }

  const linhas = readFileSync(caminho, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return linhas.map((linha, indice) => {
    const [endereco, dominio, status, displayName, quotaBytes] = linha.split("|");
    if (!endereco || !dominio) {
      throw new Error(`Linha ${indice + 1} do despejo não tem endereço e domínio: ${linha}`);
    }
    return {
      endereco: endereco.toLowerCase(),
      dominio: dominio.toLowerCase(),
      status: status ?? "",
      display_name: displayName || null,
      quota_bytes: quotaBytes || null,
    };
  });
}

function gigas(quotaBytes: string | null): string | null {
  if (!quotaBytes) return null;
  const bytes = Number(quotaBytes);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return `${Math.round(bytes / 1024 ** 3)} GB`;
}

async function main() {
  const caixas = lerCaixasDoMail();
  if (!caixas.length) {
    console.log("O mail não tem nenhuma caixa.");
    return;
  }

  const dominios = await prisma.$queryRaw<{ organization_id: string; fqdn: string }[]>`
    select organization_id, fqdn
      from operations.domains
     where status <> 'ARCHIVED'
  `;
  const donoDoDominio = new Map(dominios.map((d) => [d.fqdn.toLowerCase(), d.organization_id]));

  const nomes = await prisma.$queryRaw<{ id: string; name: string }[]>`
    select id, name from operations.organizations
  `;
  const nomeDaOrganizacao = new Map(nomes.map((o) => [o.id, o.name]));

  const espelho = await prisma.$queryRaw<{ organization_id: string; provider: string }[]>`
    select organization_id, provider
      from operations.organization_integrations
     where provider like 'mailbox:%'
  `;
  const jaEspelhada = new Set(espelho.map((e) => `${e.organization_id}|${e.provider}`));

  const criar: { organizationId: string; caixa: CaixaDoMail }[] = [];
  const jaEstavam: string[] = [];
  const semDono: string[] = [];

  for (const caixa of caixas) {
    const organizationId = donoDoDominio.get(caixa.dominio.toLowerCase());
    if (!organizationId) {
      semDono.push(caixa.endereco);
      continue;
    }
    if (jaEspelhada.has(`${organizationId}|mailbox:${caixa.endereco}`)) {
      jaEstavam.push(caixa.endereco);
      continue;
    }
    criar.push({ organizationId, caixa });
  }

  for (const { organizationId, caixa } of criar) {
    const empresa = nomeDaOrganizacao.get(organizationId) ?? organizationId;
    console.log(`${aplicar ? "registrando" : "registraria"}  ${caixa.endereco}  ->  ${empresa}`);
    if (!aplicar) continue;

    await prisma.organizationIntegration.upsert({
      where: { organizationId_provider: { organizationId, provider: `mailbox:${caixa.endereco}` } },
      create: {
        organizationId,
        provider: `mailbox:${caixa.endereco}`,
        publicId: caixa.endereco,
        accountName: caixa.display_name || null,
        url: "https://mail.avilaops.com",
        // O mail é a fonte da verdade do estado da caixa.
        status: caixa.status === "active" ? "ACTIVE" : "PENDING",
        notes: gigas(caixa.quota_bytes),
      },
      update: {
        status: caixa.status === "active" ? "ACTIVE" : "PENDING",
        accountName: caixa.display_name || null,
      },
    });
  }

  console.log("");
  console.log(`caixas no mail:        ${caixas.length}`);
  console.log(`já na ficha:           ${jaEstavam.length}`);
  console.log(`${aplicar ? "registradas agora:     " : "registraria:           "}${criar.length}`);
  if (semDono.length) {
    console.log("");
    console.log(`sem cliente dono do domínio (${semDono.length}), ficaram de fora:`);
    for (const endereco of semDono) console.log(`  ${endereco}`);
  }
  if (!aplicar && criar.length) {
    console.log("");
    console.log("Modo seco. Rode com --aplicar para gravar.");
  }
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
