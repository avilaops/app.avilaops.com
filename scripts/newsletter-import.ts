import { readFile } from "node:fs/promises";
import { importContacts, parseContactList, type ContactEntry } from "../src/lib/newsletter";
import { prisma } from "../src/lib/prisma";

/**
 * Importa contatos para a newsletter a partir de um arquivo.
 *
 *   npx tsx scripts/newsletter-import.ts --file=lista.json --tags=clientes,gmail
 *   npx tsx scripts/newsletter-import.ts --file=lista.txt --source=GMAIL
 *
 * JSON aceita `[{ "email": "...", "name": "...", "company": "..." }]`;
 * TXT aceita um endereço por linha (ou `Nome <e-mail>`).
 */

function argument(name: string, fallback = "") {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
}

async function main() {
  const file = argument("file");
  if (!file) throw new Error("Informe --file=caminho.json|txt");

  const raw = await readFile(file, "utf8");
  const entries: ContactEntry[] = file.endsWith(".json")
    ? (JSON.parse(raw) as ContactEntry[])
    : parseContactList(raw);

  const summary = await importContacts(entries, {
    source: argument("source", "IMPORT").toUpperCase(),
    tags: argument("tags").split(",").map((tag) => tag.trim()).filter(Boolean),
    keepMachineAddresses: process.argv.includes("--keep-machine"),
  });

  console.log(summary);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
