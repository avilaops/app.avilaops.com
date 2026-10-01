import { afterEach,describe,it,expect,vi } from "vitest";
import { assinarMidia,validarAssinatura } from "@/lib/publicacoes/midia";
afterEach(()=>vi.unstubAllEnvs());
describe("acesso temporário à mídia do Estúdio",()=>{
  it("vence em uma hora e não aceita trocar o render nem a validade",()=>{
    vi.stubEnv("SOCIAL_MEDIA_SIGNING_KEY","somente-teste-uma-chave-com-32-caracteres");
    vi.stubEnv("APP_URL","https://app.avilaops.com");
    const agora=Date.now();
    const u=new URL(assinarMidia("render123",agora));
    const expira=u.searchParams.get("expira"),sig=u.searchParams.get("assinatura");
    expect(validarAssinatura("render123",expira,sig,agora)).toBe(true);
    expect(validarAssinatura("outro",expira,sig,agora)).toBe(false);
    expect(validarAssinatura("render123",String(Number(expira)+1),sig,agora)).toBe(false);
    expect(validarAssinatura("render123",expira,sig,agora+3601000)).toBe(false);
    expect(validarAssinatura("render123",expira,"não é assinatura",agora)).toBe(false);
  });
  it("não emite link com chave ausente ou host sem TLS",()=>{
    vi.stubEnv("SOCIAL_MEDIA_SIGNING_KEY","");
    expect(()=>assinarMidia("render123")).toThrow();
    vi.stubEnv("SOCIAL_MEDIA_SIGNING_KEY","somente-teste-uma-chave-com-32-caracteres");
    vi.stubEnv("APP_URL","http://app.avilaops.com");
    expect(()=>assinarMidia("render123")).toThrow(/HTTPS/);
  });
});
