import { classifyCpfCnpj, onlyDigits } from "@/lib/cpf-cnpj";
import { nomeProprio } from "@/lib/format";

/**
 * Leitura de ficha cadastral (o PDF que o cliente manda com "Razão Social:",
 * "CNPJ:", "Endereço:"…) para pré-preencher o cadastro.
 *
 * É leitura por rótulo, sem IA: a ficha é um formulário, e o rótulo diz o que
 * cada valor é. Isso dá resultado exato quando o rótulo existe e nenhum
 * resultado quando não existe — nunca um valor plausível no campo errado.
 *
 * O resultado só preenche o formulário. Quem cadastra confere e salva; nada
 * daqui grava sozinho.
 */

export type FichaCadastral = {
  razaoSocial?: string;
  nomeFantasia?: string;
  cpfCnpj?: string;
  inscricaoEstadual?: string;
  inscricaoMunicipal?: string;
  responsavel?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
};

export type CampoFicha = keyof FichaCadastral;

type Rotulo = { campo: CampoFicha | "endereco" | "cidadeUf"; nomes: string[] };

// Ordem importa: o rótulo mais longo vem antes do mais curto que ele contém
// ("nome de fantasia" antes de "fantasia", "inscrição estadual" antes de "ie").
const ROTULOS: Rotulo[] = [
  { campo: "razaoSocial", nomes: ["razao social", "nome empresarial", "nome da empresa"] },
  { campo: "nomeFantasia", nomes: ["nome de fantasia", "nome fantasia", "fantasia"] },
  { campo: "cpfCnpj", nomes: ["cnpj/cpf", "cpf/cnpj", "cnpj", "cpf"] },
  { campo: "inscricaoEstadual", nomes: ["inscricao estadual", "insc. estadual", "i.e.", "ie"] },
  { campo: "inscricaoMunicipal", nomes: ["inscricao municipal", "insc. municipal", "i.m.", "im"] },
  {
    campo: "responsavel",
    nomes: ["responsavel", "proprietario", "socio administrador", "socio", "contato"],
  },
  { campo: "whatsapp", nomes: ["whatsapp", "whats app", "celular"] },
  { campo: "telefone", nomes: ["telefone", "fone", "tel."] },
  { campo: "email", nomes: ["e-mail", "email"] },
  { campo: "cep", nomes: ["cep"] },
  { campo: "endereco", nomes: ["endereco", "logradouro"] },
  { campo: "numero", nomes: ["numero", "nº", "n°"] },
  { campo: "complemento", nomes: ["complemento"] },
  { campo: "bairro", nomes: ["bairro"] },
  { campo: "cidadeUf", nomes: ["cidade/uf", "cidade", "municipio"] },
  { campo: "uf", nomes: ["estado", "uf"] },
];

const UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

/** Minúsculo e sem acento, preservando o comprimento de cada caractere. */
function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

const TODOS_OS_NOMES = ROTULOS.flatMap((rotulo) =>
  rotulo.nomes.map((nome) => ({ nome, campo: rotulo.campo })),
).sort((a, b) => b.nome.length - a.nome.length);

// Um rótulo só vale no começo da linha ou depois de espaço, e sempre seguido
// de ":" — assim "Nome de Fantasia: X" não é lido como "fantasia" no meio de
// outro valor, e duas colunas na mesma linha ("CEP: … Cidade: …") se separam.
const PADRAO_ROTULO = new RegExp(
  `(?:^|\\s)(${TODOS_OS_NOMES.map((item) => escapar(item.nome)).join("|")})\\s*:`,
  "g",
);

function campoDoNome(nome: string) {
  return TODOS_OS_NOMES.find((item) => item.nome === nome)?.campo;
}

function limpar(valor: string): string {
  return valor.replace(/\s+/g, " ").replace(/^[\s\-–—:]+|[\s\-–—,;]+$/g, "").trim();
}

/** Pares rótulo → valor de uma linha, na ordem em que aparecem. */
function paresDaLinha(original: string): Array<{ campo: Rotulo["campo"]; valor: string }> {
  // NFC antes de tirar o acento: assim a versão sem acento tem o mesmo
  // comprimento da original e os índices achados nela valem na original.
  const linha = original.normalize("NFC");
  const normalizada = chave(linha);
  const achados: Array<{ campo: Rotulo["campo"]; inicioValor: number; inicioRotulo: number }> = [];
  for (const casamento of normalizada.matchAll(PADRAO_ROTULO)) {
    const campo = campoDoNome(casamento[1]);
    if (!campo || casamento.index === undefined) continue;
    const inicioRotulo = casamento.index + casamento[0].indexOf(casamento[1]);
    achados.push({ campo, inicioRotulo, inicioValor: casamento.index + casamento[0].length });
  }
  return achados.map((achado, indice) => {
    const fim = achados[indice + 1]?.inicioRotulo ?? linha.length;
    return { campo: achado.campo, valor: limpar(linha.slice(achado.inicioValor, fim)) };
  });
}

function formatarCep(valor: string): string | undefined {
  const digitos = onlyDigits(valor);
  return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : undefined;
}

/** "Rua Copacabana, 4108 - Sala 2" → logradouro, número e complemento. */
function separarEndereco(valor: string) {
  const casamento = valor.match(/^(.*?),\s*(?:n[º°o.]?\s*)?(\d+[a-zA-Z]?|s\/?n)\b\s*[-–—,]?\s*(.*)$/i);
  if (!casamento) return { logradouro: valor };
  return {
    logradouro: limpar(casamento[1]),
    numero: casamento[2].toUpperCase() === "SN" ? "S/N" : casamento[2],
    complemento: limpar(casamento[3]) || undefined,
  };
}

/** "Votuporanga – SP", "Votuporanga/SP" ou "Votuporanga - SP" → cidade e UF. */
function separarCidade(valor: string) {
  const casamento = valor.match(/^(.*?)\s*[-–—/]\s*([A-Za-z]{2})$/);
  if (casamento && UFS.has(casamento[2].toUpperCase())) {
    return { cidade: limpar(casamento[1]), uf: casamento[2].toUpperCase() };
  }
  return { cidade: valor };
}

export function lerFichaCadastral(texto: string): FichaCadastral {
  const ficha: FichaCadastral = {};
  // O primeiro valor de cada campo vence: a ficha costuma repetir o nome da
  // empresa em rodapé ou assinatura, e o do cabeçalho é o preenchido.
  const definir = (campo: CampoFicha, valor: string | undefined) => {
    if (valor && ficha[campo] === undefined) ficha[campo] = valor;
  };

  for (const linha of texto.split(/\r?\n/)) {
    for (const { campo, valor } of paresDaLinha(linha)) {
      if (!valor) continue;
      switch (campo) {
        case "endereco": {
          const partes = separarEndereco(valor);
          definir("logradouro", partes.logradouro);
          definir("numero", partes.numero);
          definir("complemento", partes.complemento);
          break;
        }
        case "cidadeUf": {
          const partes = separarCidade(valor);
          definir("cidade", partes.cidade);
          definir("uf", partes.uf);
          break;
        }
        case "cpfCnpj": {
          const classificado = classifyCpfCnpj(valor);
          if (classificado?.valid) definir("cpfCnpj", classificado.documento);
          break;
        }
        case "cep":
          definir("cep", formatarCep(valor));
          break;
        case "uf": {
          const sigla = valor.toUpperCase();
          if (UFS.has(sigla)) definir("uf", sigla);
          break;
        }
        case "email": {
          const email = valor.toLowerCase().match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0];
          definir("email", email);
          break;
        }
        case "responsavel":
          // "Contato:" às vezes traz o telefone, não a pessoa.
          if (/[a-zà-ú]{2}/i.test(valor) && !valor.includes("@")) definir("responsavel", valor);
          break;
        default:
          definir(campo, valor);
      }
    }
  }

  // Ficha costuma vir toda em caixa alta. Nome, razão social e endereço
  // entram como nome próprio ("Ludus Equipamentos para Musculação Ltda"),
  // igual o painel já os exibe; sigla de UF, e-mail e números ficam como estão.
  for (const campo of CAMPOS_DE_NOME) {
    const valor = ficha[campo];
    if (valor) ficha[campo] = nomeProprio(valor);
  }

  return ficha;
}

const CAMPOS_DE_NOME: CampoFicha[] = [
  "razaoSocial",
  "nomeFantasia",
  "responsavel",
  "logradouro",
  "complemento",
  "bairro",
  "cidade",
];

/** Quantos campos a leitura achou — para a tela dizer o que veio da ficha. */
export function camposPreenchidos(ficha: FichaCadastral): CampoFicha[] {
  return (Object.keys(ficha) as CampoFicha[]).filter((campo) => Boolean(ficha[campo]));
}
