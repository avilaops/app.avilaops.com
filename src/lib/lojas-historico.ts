/**
 * Quem fez uma alteração de catálogo, lido da origem que a plataforma gravou.
 *
 * A plataforma grava a origem como texto. Desde 09/10/2026 alteração feita por
 * gente leva a pessoa (`avilaops:<nome>`, `painel:<e-mail>`, `painel:dono`);
 * antes disso o painel da loja gravava só `painel`. O que este arquivo NÃO faz
 * é completar o que falta: registro antigo sem autor aparece como "autor não
 * registrado", e alteração automática aparece com o nome da integração ou da
 * execução que a fez — não com o de uma pessoa.
 */
export type AutorDaAlteracao = {
  tipo: "pessoa" | "automatica";
  /** Por onde a alteração entrou. */
  caminho: string;
  /** Quem foi, quando é pessoa. `null` = não registrado. */
  autor: string | null;
};

export function autorDaAlteracao(origem: string): AutorDaAlteracao {
  const [prefixo, ...resto] = origem.split(":");
  const complemento = resto.join(":").trim();

  if (prefixo === "avilaops") return { tipo: "pessoa", caminho: "Painel da Ávila Ops", autor: complemento || null };
  if (prefixo === "painel") {
    if (complemento === "dono") return { tipo: "pessoa", caminho: "Painel da loja", autor: "login principal da loja" };
    return { tipo: "pessoa", caminho: "Painel da loja", autor: complemento || null };
  }
  if (prefixo === "api") return { tipo: "automatica", caminho: `API, chave ${complemento || "não identificada"}`, autor: null };
  if (prefixo === "importacao") return { tipo: "automatica", caminho: "Importação em lote", autor: null };
  if (prefixo === "migracao") return { tipo: "automatica", caminho: `Migração ${complemento}`.trim(), autor: null };
  if (prefixo === "mcp") return { tipo: "automatica", caminho: `Assistente (MCP) ${complemento}`.trim(), autor: null };
  // Execuções nomeadas ("auditoria-2026-09-28", "revisao-catalogo-…"): o nome
  // gravado é o que identifica a execução, e vai como está.
  return { tipo: "automatica", caminho: `Execução ${origem}`, autor: null };
}

/** Uma linha: "Painel da loja · maria@loja.com" ou "Importação em lote · automática". */
export function descreverAutor(origem: string): string {
  const a = autorDaAlteracao(origem);
  if (a.tipo === "automatica") return `${a.caminho} · automática`;
  return `${a.caminho} · ${a.autor ?? "autor não registrado"}`;
}

const ROTULOS: Record<string, string> = {
  nome: "Nome",
  slug: "Endereço",
  sku: "SKU",
  gtin: "GTIN",
  marca: "Marca",
  ativo: "Situação",
  categoria: "Categoria",
  categoriaId: "Categoria",
  precoCentavos: "Preço",
  precoDeCentavos: "Preço cheio (de)",
  estoque: "Estoque",
  disponibilidade: "Disponibilidade declarada",
  descricao: "Descrição",
  descricaoCurta: "Descrição curta",
  imagens: "Fotos",
  imagemOrigem: "Origem da foto",
  imagemFamilia: "Família da foto",
  atributos: "Atributos",
  destaque: "Destaque",
};

/** Nome do campo como a pessoa conhece. Campo que a tela não conhece sai com o nome gravado, sem adivinhar. */
export function rotuloDoCampo(campo: string): string {
  return ROTULOS[campo] ?? campo;
}

const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Valor de um campo do histórico, legível e curto. Não interpreta além do que
 * o campo é: dinheiro vira reais, situação vira ativo/inativo, o resto sai
 * como foi gravado. Nunca segredo: o histórico é de catálogo.
 */
export function valorDoCampo(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "vazio";
  if ((campo === "precoCentavos" || campo === "precoDeCentavos") && typeof valor === "number")
    return campo === "precoCentavos" && valor <= 0 ? "sob consulta" : reais(valor);
  if (campo === "ativo" && typeof valor === "boolean") return valor ? "ativo" : "inativo";
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  if (Array.isArray(valor)) return valor.length === 0 ? "vazio" : `${valor.length} ${valor.length === 1 ? "item" : "itens"}`;
  if (typeof valor === "object") return "conteúdo estruturado";
  const texto = String(valor);
  return texto.length > 60 ? `${texto.slice(0, 57)}…` : texto;
}
