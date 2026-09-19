import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Gera SQL; não conecta nem aplica no banco. Inclui somente a entrega core.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const names = ['20260919200000_core_foundation','20260919201000_core_integrity',
  '20260919202000_core_legacy_backfill','20260919203000_core_queries','20260919204000_core_assets_guards'];
const output = process.argv[2];
if (!output) throw new Error('Informe arquivo de saída: node scripts/core/build-release.mjs output/core-release.sql');
let sql = `\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT set_config('core.expected_database', :'expected_database', true);
SELECT pg_advisory_xact_lock(hashtext('avila-core-foundation-20260919'));
DO $$ BEGIN
 IF current_database()<>current_setting('core.expected_database') THEN RAISE EXCEPTION 'Unexpected database'; END IF;
 IF current_user<>'app_avila' AND current_database() NOT LIKE '%_test' THEN RAISE EXCEPTION 'Use the application owner role app_avila'; END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='core') THEN RAISE EXCEPTION 'core already exists; inspect receipts, do not replay blindly'; END IF;
 IF EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN RAISE EXCEPTION 'Unresolved migration exists'; END IF;
END $$;
`;
const manifest = [];
for (const name of names) {
  const bytes = fs.readFileSync(path.join(root,'prisma/migrations',name,'migration.sql'));
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const body = bytes.toString('utf8').replace(/^\uFEFF/,'').replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,'');
  sql += `\n-- ${name}\n${body}\nINSERT INTO public._prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('${randomUUID()}','${checksum}','${name}',now(),now(),1);\n`;
  manifest.push({name,checksum});
}
sql += 'COMMIT;\n';
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
fs.writeFileSync(output,sql);
fs.writeFileSync(output+'.manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({output,migrations:manifest.length,sha256:createHash('sha256').update(sql).digest('hex')}));
