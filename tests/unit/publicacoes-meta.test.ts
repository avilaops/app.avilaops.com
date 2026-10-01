import { createCipheriv,createHash,randomBytes } from "node:crypto";
import { afterEach,beforeEach,describe,it,expect,vi } from "vitest";
const mocks=vi.hoisted(()=>({findUnique:vi.fn(),obterCredencial:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{organizationIntegrationConnection:{findUnique:mocks.findUnique}}}));
vi.mock("@/lib/credenciais",()=>({obterCredencial:mocks.obterCredencial,exigirCredencial:vi.fn()}));
import { tokenParaPublicacaoMeta } from "@/lib/meta";
function cifrar() {
  const iv=randomBytes(12),key=createHash("sha256").update("chave-de-teste").digest();
  const cipher=createCipheriv("aes-256-gcm",key,iv);
  const payload=Buffer.concat([cipher.update("token-empresa"),cipher.final()]);
  return [iv,cipher.getAuthTag(),payload].map(b=>b.toString("base64url")).join(".");
}
beforeEach(()=>{
  vi.stubEnv("META_TOKEN_ENCRYPTION_KEY","chave-de-teste");
  mocks.findUnique.mockResolvedValue({status:"ACTIVE",tokenExpiresAt:null,tokenCiphertext:cifrar()});
  mocks.obterCredencial.mockImplementation(async(chave:string)=>chave==="META_APP_SECRET"?"segredo-teste":null);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.clearAllMocks();});
describe("publicação com conexão Meta da empresa",()=>{
  it("busca somente a conexão da organização e escolhe o token da página correta",async()=>{
    const fetch=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({data:[{id:"123",access_token:"token-pagina",instagram_business_account:{id:"456"}}]})));
    expect(await tokenParaPublicacaoMeta("empresa-a","instagram","456")).toBe("token-pagina");
    expect(mocks.findUnique).toHaveBeenCalledWith({where:{organizationId_provider:{organizationId:"empresa-a",provider:"meta_business"}}});
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("appsecret_proof")).toMatch(/^[a-f0-9]{64}$/);
  });
  it("não aceita uma conta que a conexão não administra",async()=>{
    vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({data:[{id:"123",access_token:"token-pagina"}]})));
    await expect(tokenParaPublicacaoMeta("empresa-a","facebook","999")).rejects.toThrow("DESTINO_META_FORA_DA_CONEXAO");
  });
  it("conexão desativada não chama a API",async()=>{
    mocks.findUnique.mockResolvedValue({status:"REVOKED",tokenCiphertext:cifrar()});
    const fetch=vi.spyOn(globalThis,"fetch");
    await expect(tokenParaPublicacaoMeta("empresa-a","facebook","123")).rejects.toThrow("CONEXAO_META_INATIVA");
    expect(fetch).not.toHaveBeenCalled();
  });
});
