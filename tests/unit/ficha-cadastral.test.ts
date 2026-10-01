import { describe, expect, it } from "vitest";
import { camposPreenchidos, lerFichaCadastral } from "@/lib/ficha-cadastral";

// Texto exato que o unpdf extrai da ficha da Ludus (PDF do "Imprimir em PDF"
// do Windows), mantido aqui para o teste não depender do arquivo.
const FICHA_LUDUS = [
  "FICHA CADASTRAL",
  "Razão Social: LUDUS EQUIPAMENTOS PARA MUSCULAÇÃO LTDA",
  "Nome de Fantasia: LUDUS EQUIPAMENTOS",
  "CNPJ: 66.058.955/0001-08",
  "Inscrição Estadual: 718.319.130.117",
  "Endereço: Rua Copacabana, 4108",
  "Bairro: Parque Santa Felicia",
  "CEP: 15.505-058",
  "Cidade: Votuporanga – SP",
  "Telefone: (17) 99721-8555",
  "WhatsApp: (17) 99721-8555",
  "Email: ludusequipamentos@gmail.com",
].join("\n");

describe("leitura de ficha cadastral", () => {
  it("lê a ficha da Ludus campo a campo", () => {
    expect(lerFichaCadastral(FICHA_LUDUS)).toEqual({
      razaoSocial: "Ludus Equipamentos para Musculação Ltda",
      nomeFantasia: "Ludus Equipamentos",
      cpfCnpj: "66058955000108",
      inscricaoEstadual: "718.319.130.117",
      logradouro: "Rua Copacabana",
      numero: "4108",
      bairro: "Parque Santa Felicia",
      cep: "15505-058",
      cidade: "Votuporanga",
      uf: "SP",
      telefone: "(17) 99721-8555",
      whatsapp: "(17) 99721-8555",
      email: "ludusequipamentos@gmail.com",
    });
  });

  it("separa dois rótulos na mesma linha (ficha em colunas)", () => {
    const ficha = lerFichaCadastral(
      "CEP: 01310-100   Cidade/UF: São Paulo/SP\nFone: 11 3333-4444   E-mail: Contato@Empresa.com.br",
    );
    expect(ficha).toMatchObject({
      cep: "01310-100",
      cidade: "São Paulo",
      uf: "SP",
      telefone: "11 3333-4444",
      email: "contato@empresa.com.br",
    });
  });

  it("aceita rótulo em caixa alta e sem acento", () => {
    const ficha = lerFichaCadastral("RAZAO SOCIAL: ACME LTDA\nNOME FANTASIA: ACME\nENDERECO: AV. BRASIL, 100 - SALA 3");
    expect(ficha).toMatchObject({
      razaoSocial: "Acme Ltda",
      nomeFantasia: "Acme",
      logradouro: "Av. Brasil",
      numero: "100",
      complemento: "Sala 3",
    });
  });

  it("CNPJ com dígito errado não entra", () => {
    expect(lerFichaCadastral("CNPJ: 66.058.955/0001-09").cpfCnpj).toBeUndefined();
  });

  it("CPF válido entra só com dígitos", () => {
    expect(lerFichaCadastral("CPF: 529.982.247-25").cpfCnpj).toBe("52998224725");
  });

  it("o primeiro valor do campo vence (rodapé repete o nome)", () => {
    const ficha = lerFichaCadastral("Razão Social: PRIMEIRA LTDA\n...\nRazão Social: ASSINATURA");
    expect(ficha.razaoSocial).toBe("Primeira Ltda");
  });

  it("palavra de rótulo no meio de um valor não vira campo", () => {
    const ficha = lerFichaCadastral("Nome de Fantasia: CASA DO CEP\nBairro: Centro");
    expect(ficha.nomeFantasia).toBe("Casa do Cep");
    expect(ficha.cep).toBeUndefined();
  });

  it("'Contato:' com telefone não vira nome de responsável", () => {
    expect(lerFichaCadastral("Contato: (17) 3421-0000").responsavel).toBeUndefined();
    expect(lerFichaCadastral("Contato: Maria Souza").responsavel).toBe("Maria Souza");
  });

  it("texto sem rótulo nenhum não inventa campo", () => {
    expect(lerFichaCadastral("Prezados, segue em anexo.")).toEqual({});
    expect(camposPreenchidos(lerFichaCadastral(FICHA_LUDUS))).toHaveLength(13);
  });
});
