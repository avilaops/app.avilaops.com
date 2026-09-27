import { PrismaClient } from '@prisma/client';

// Cadastro editorial informado pelo Nicolas; não prova acesso às contas.
// Execução explícita: node scripts/publicacoes-importar-rede.mjs <organizationId>
const organizationId = process.argv[2];
if (!organizationId) throw new Error('Informe a organização responsável pela rede.');
const rede = [
  ['Engenheiro Confuso', 'EngenheiroConfuso', 'ENGENHEIRO_CONFUSO'],
  ['Engenharia Descomplicada', 'EngDescomplicada', 'ENGENHARIA_DESCOMPLICADA'],
  ['Chef Confuso', 'ChefConfuso', 'CHEF_CONFUSO'],
  ['Contador Confuso', 'ContadorConfuso', 'CONTADOR_CONFUSO'],
  ['Vendedor Confuso', 'VendedorConfuso', 'VENDEDOR_CONFUSO'],
  ['Gestor Confuso', 'GestorConfuso', 'GESTOR_CONFUSO'],
  ['Dog da Confusão', 'DogDaConfusao', 'DOG_DA_CONFUSAO'],
];
const db = new PrismaClient();
try {
  const resultado = await db.$transaction(async tx => {
    const empresa = await tx.organization.findUnique({ where: { id: organizationId } });
    if (!empresa || empresa.status !== 'ACTIVE') throw new Error('Organização ausente ou inativa.');
    let criados = 0;
    for (const [nome, subreddit, referencia] of rede) {
      const novos = await tx.$queryRaw`INSERT INTO operations.social_profiles(organization_id,nome)
        VALUES(${organizationId},${nome}) ON CONFLICT(organization_id,nome) DO NOTHING RETURNING id`;
      const [perfil] = await tx.$queryRaw`SELECT id FROM operations.social_profiles WHERE organization_id=${organizationId} AND nome=${nome}`;
      await tx.$executeRaw`INSERT INTO operations.social_destinations(perfil_id,canal,identificador,credencial,ativo)
        VALUES(${perfil.id}::uuid,'reddit',${subreddit},${`SOCIAL_${referencia}_REDDIT_TOKEN`},false)
        ON CONFLICT(perfil_id,canal) DO NOTHING`;
      if (novos.length) {
        criados++;
        const detalhe = JSON.stringify({ perfilId: perfil.id, organizationId, fonte: 'material-rede-nicolas' });
        await tx.$executeRaw`INSERT INTO operations.social_events(evento,autor,detalhe)
          VALUES('PERFIL_IMPORTADO','importacao-autorizada',${detalhe}::jsonb)`;
      }
    }
    return { perfisCriados: criados, perfisVerificados: rede.length };
  });
  console.log(JSON.stringify(resultado));
} finally {
  await db.$disconnect();
}
