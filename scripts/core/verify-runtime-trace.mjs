import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function manifests(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await manifests(name));
    else if (entry.name.endsWith('.nft.json')) result.push(name);
  }
  return result;
}
const files = await manifests(path.join(root, '.next/server'));
if (!files.length) throw new Error('Build sem manifests de runtime. Execute next build antes.');
const forbidden = new Set();
for (const manifest of files) {
  const trace = JSON.parse(await fs.readFile(manifest, 'utf8'));
  for (const file of trace.files) {
    const relative = path.relative(root, path.resolve(path.dirname(manifest), file)).replaceAll('\\', '/');
    if (/^(output\/|tests\/|\.git\/|\.playwright-cli\/|\.deploy-[^/]*\/|\.env(?:\.|$))/.test(relative)) {
      forbidden.add(relative.split('/')[0]);
    }
  }
}
if (forbidden.size) throw new Error(`Artefatos locais no pacote de runtime: ${[...forbidden].join(', ')}. Revise o file tracing.`);
console.log(`Runtime verificado: ${files.length} manifests sem artefatos locais ou arquivos de ambiente.`);
