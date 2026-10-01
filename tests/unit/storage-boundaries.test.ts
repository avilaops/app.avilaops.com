import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/r2", () => ({ uploadOrganizationBrandAsset: vi.fn(), getObjectBuffer: vi.fn(), getPrivateObjectUrl: vi.fn() }));
import { readOrganizationBrandAssetBuffer, saveOrganizationBrandAssetFile } from "@/lib/brand-asset-storage";
import { campaignImagePath } from "@/lib/newsletter-image-storage";
afterEach(() => vi.unstubAllEnvs());

it("recusa caminho em diretório vizinho com o mesmo prefixo", async () => {
  const base = path.resolve("output/nucleo-postgres", `storage-${randomUUID()}`);
  const root = path.join(base, "assets");
  await mkdir(`${root}-other`, { recursive: true });
  await writeFile(path.join(`${root}-other`, "example.txt"), "outside");
  vi.stubEnv("ORGANIZATION_ASSETS_STORAGE_PATH", root);
  expect(await readOrganizationBrandAssetBuffer("local:../assets-other/example.txt")).toBeNull();
});
it("normaliza segmentos de upload e permite ler o arquivo salvo", async () => {
  vi.stubEnv("ORGANIZATION_ASSETS_STORAGE_PATH", path.resolve("output/nucleo-postgres", `storage-${randomUUID()}`));
  vi.stubEnv("R2_BUCKET", "");
  const key = await saveOrganizationBrandAssetFile("org", "..", "image.png", Buffer.from("test"), "image/png");
  expect(key).toContain("local:org/_/");
  expect(await readOrganizationBrandAssetBuffer(key)).toEqual(Buffer.from("test"));
});
it("newsletter mantém validação estrita do nome do arquivo", () => {
  expect(campaignImagePath("../anything.png")).toBeNull();
  expect(campaignImagePath(`${"a".repeat(32)}.png`)).not.toBeNull();
});
