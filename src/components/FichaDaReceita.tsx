/**
 * O que a Receita Federal devolveu sobre um CNPJ, inteiro: situação, porte,
 * natureza jurídica, endereço, sócios e TODOS os CNAEs — o principal e os
 * secundários.
 *
 * Até 01/10/2026 o cadastro mostrava só razão social, situação e cidade numa
 * linha, e os CNAEs secundários (que dizem o que a empresa realmente faz)
 * ficavam guardados em `cnpj_data` sem ninguém ver.
 *
 * Sem estado e sem hooks: serve no formulário de entrada e na ficha.
 */

type Dados = Record<string, unknown>;

export type CnaeDaReceita = { codigo: string; descricao: string };

function texto(dados: Dados, chave: string): string {
  const bruto = dados[chave];
  if (bruto === null || bruto === undefined) return "";
  return String(bruto).trim();
}

/** 6201501 → 6201-5/01, o formato em que o CNAE aparece em todo documento. */
export function formatarCnae(codigo: string | number): string {
  const d = String(codigo).replace(/\D/g, "").padStart(7, "0");
  return `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}`;
}

/** Principal primeiro, depois os secundários, sem o "0 - Não informada" da Receita. */
export function cnaesDaReceita(dados: Dados): CnaeDaReceita[] {
  const lista: CnaeDaReceita[] = [];
  const principal = texto(dados, "cnae_fiscal");
  if (principal && principal !== "0") {
    lista.push({ codigo: principal, descricao: texto(dados, "cnae_fiscal_descricao") });
  }
  const secundarios = Array.isArray(dados.cnaes_secundarios) ? dados.cnaes_secundarios : [];
  for (const item of secundarios) {
    if (!item || typeof item !== "object") continue;
    const codigo = texto(item as Dados, "codigo");
    if (!codigo || codigo === "0") continue;
    lista.push({ codigo, descricao: texto(item as Dados, "descricao") });
  }
  return lista;
}

export type SocioDaReceita = { nome: string; qualificacao: string };

export function sociosDaReceita(dados: Dados): SocioDaReceita[] {
  const qsa = Array.isArray(dados.qsa) ? dados.qsa : [];
  return qsa
    .filter((s): s is Dados => Boolean(s) && typeof s === "object")
    .map((s) => ({ nome: texto(s, "nome_socio"), qualificacao: texto(s, "qualificacao_socio") }))
    .filter((s) => s.nome);
}

function formatarData(valor: string) {
  const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : valor;
}

/** "1797218555" → "(17) 9721-8555": o DDD vem colado no número. */
function formatarTelefone(valor: string) {
  const d = valor.replace(/\D/g, "");
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : valor;
}

function formatarDinheiro(valor: unknown) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "";
}

export default function FichaDaReceita({ dados }: { dados: Dados }) {
  const cnaes = cnaesDaReceita(dados);
  const socios = sociosDaReceita(dados);
  const endereco = [
    [texto(dados, "descricao_tipo_de_logradouro"), texto(dados, "logradouro")].filter(Boolean).join(" "),
    texto(dados, "numero"),
    texto(dados, "complemento"),
    texto(dados, "bairro"),
    [texto(dados, "municipio"), texto(dados, "uf")].filter(Boolean).join("/"),
    texto(dados, "cep"),
  ]
    .filter(Boolean)
    .join(", ");

  const linhas: Array<[string, string]> = [
    ["Razão social", texto(dados, "razao_social")],
    ["Nome fantasia", texto(dados, "nome_fantasia")],
    ["Situação", texto(dados, "descricao_situacao_cadastral")],
    ["Abertura", formatarData(texto(dados, "data_inicio_atividade"))],
    ["Porte", texto(dados, "porte")],
    ["Natureza jurídica", texto(dados, "natureza_juridica")],
    ["Capital social", formatarDinheiro(dados.capital_social)],
    ["Simples Nacional", dados.opcao_pelo_simples === true ? "Optante" : dados.opcao_pelo_simples === false ? "Não optante" : ""],
    ["Endereço", endereco],
    ["Telefone", formatarTelefone(texto(dados, "ddd_telefone_1"))],
    ["E-mail", texto(dados, "email").toLowerCase()],
  ];

  return (
    <div className="ficha-receita">
      <dl className="ficha-receita-dados">
        {linhas
          .filter(([, valor]) => valor)
          .map(([rotulo, valor]) => (
            <div key={rotulo}>
              <dt>{rotulo}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
      </dl>

      {cnaes.length ? (
        <div className="ficha-receita-bloco">
          <strong>Atividades (CNAE)</strong>
          <ul>
            {cnaes.map((cnae, i) => (
              <li key={`${cnae.codigo}-${i}`}>
                <code>{formatarCnae(cnae.codigo)}</code> {cnae.descricao}
                {i === 0 ? <em> · principal</em> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {socios.length ? (
        <div className="ficha-receita-bloco">
          <strong>Sócios</strong>
          <ul>
            {socios.map((socio) => (
              <li key={socio.nome}>
                {socio.nome}
                {socio.qualificacao ? <em> · {socio.qualificacao}</em> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <small className="ficha-receita-fonte">Fonte: Receita Federal, via BrasilAPI.</small>
    </div>
  );
}
