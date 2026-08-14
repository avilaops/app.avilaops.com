export type CnpjLookupData = {
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  cnae_fiscal_descricao?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  ddd_telefone_1?: string;
  email?: string;
  [key: string]: unknown;
};

export async function lookupCnpj(cnpj: string): Promise<CnpjLookupData> {
  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    headers: {
      accept: "application/json",
      "user-agent": "avila-ops-app (app.avilaops.com)",
    },
  });

  if (response.status === 404) {
    throw new Error("CNPJ não encontrado na Receita Federal.");
  }
  if (!response.ok) {
    throw new Error(`BrasilAPI respondeu HTTP ${response.status}`);
  }

  return (await response.json()) as CnpjLookupData;
}
