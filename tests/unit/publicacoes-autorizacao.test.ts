import { beforeEach,describe,it,expect,vi } from "vitest";
import { NextRequest } from "next/server";
const mocks=vi.hoisted(()=>({getAdmin:vi.fn(),query:vi.fn(),verificar:vi.fn(),listar:vi.fn()}));
vi.mock("@/lib/auth",()=>({getAdmin:mocks.getAdmin,ehDono:(role:string)=>role==="OWNER"}));
vi.mock("@/lib/prisma",()=>({prisma:{$queryRaw:mocks.query,$executeRaw:vi.fn()}}));
vi.mock("@/lib/publicacoes/provedores",()=>({verificarDestino:mocks.verificar,FalhaProvedor:class extends Error{}}));
vi.mock("@/lib/publicacoes/repositorio",()=>({listarPublicacoes:mocks.listar,ConflitoPublicacao:class extends Error{},criarRascunho:vi.fn()}));
import { GET } from "@/app/api/publicacoes/route";
import { POST } from "@/app/api/publicacoes/destinos/route";
beforeEach(()=>vi.resetAllMocks());
describe("autorização das publicações",()=>{
  it("sem sessão interna não revela posts nem toca no banco",async()=>{
    mocks.getAdmin.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(mocks.listar).not.toHaveBeenCalled();
  });
  it("sócio não altera referência de credencial",async()=>{
    mocks.getAdmin.mockResolvedValue({role:"SOCIO"});
    expect((await POST(new NextRequest("https://app.avilaops.com/api/publicacoes/destinos",{method:"POST"}))).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.verificar).not.toHaveBeenCalled();
  });
  it("recusa escrita de outra origem mesmo para OWNER",async()=>{
    mocks.getAdmin.mockResolvedValue({role:"OWNER"});
    const req=new NextRequest("https://app.avilaops.com/api/publicacoes/destinos",{method:"POST",headers:{origin:"https://outro.example",host:"app.avilaops.com"}});
    expect((await POST(req)).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
