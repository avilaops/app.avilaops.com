/**
 * Importa as vagas que hoje vivem no arquivo do site para `operations.job_postings`.
 *
 *   npx tsx scripts/seed-job-postings.ts
 *
 * Idempotente: reexecutar atualiza pelo `ref` em vez de duplicar. Enquanto o
 * `jobs.ts` do site existir, ele é a origem; depois que o banco virar a fonte
 * da verdade, este script deixa de ser necessário.
 */
import { PrismaClient } from "@prisma/client";

import { jobs } from "../../jobs.avilaops.com/src/lib/jobs";
import { endOfBusinessDay, startOfBusinessDay } from "../src/lib/job-postings";

const prisma = new PrismaClient();

async function main() {
  console.log(`Origem: jobs.avilaops.com/src/lib/jobs.ts (${jobs.length} vagas)\n`);

  for (const job of jobs) {
    const content = {
      intro: job.intro,
      responsibilities: job.responsibilities,
      expertise: job.expertise,
      closing: job.closing,
      benefits: job.benefits,
      ...(job.travel ? { travel: job.travel } : {}),
    };

    const data = {
      slug: job.slug,
      title: job.title,
      area: job.area,
      team: job.team,
      location: job.location,
      locationType: job.locationType,
      contract: job.contract,
      summary: job.summary,
      content,
      // As quatro estão no ar hoje; entram como PUBLISHED para o build pelo
      // banco reproduzir exatamente o site atual.
      status: "PUBLISHED",
      postedAt: startOfBusinessDay(job.postedAt),
      validThrough: endOfBusinessDay(job.validThrough),
      publishedAt: startOfBusinessDay(job.postedAt),
    };

    const saved = await prisma.jobPosting.upsert({
      where: { ref: job.ref },
      create: { ref: job.ref, ...data },
      update: data,
    });

    console.log(
      `  ${saved.ref}  ${saved.status.padEnd(9)} ${saved.slug}\n` +
        `           publicada ${saved.postedAt?.toISOString()}  ` +
        `expira ${saved.validThrough?.toISOString()}`,
    );
  }

  const total = await prisma.jobPosting.count();
  const publicadas = await prisma.jobPosting.count({
    where: { status: "PUBLISHED", validThrough: { gt: new Date() } },
  });
  console.log(`\nTotal no banco: ${total} | publicadas e no prazo: ${publicadas}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
