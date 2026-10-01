/**
 * Ação do cabeçalho descrita como dado, não como elemento.
 *
 * Precisa ser dado porque a mesma ação aparece de dois jeitos: botão no
 * desktop e item de menu no celular. Com elemento pronto (um `<SyncButton/>`)
 * o menu não tem como virar item, e o celular acabava com quatro botões
 * dividindo 358px, um deles quebrando em duas linhas.
 */
export type AcaoCabecalho =
  | { tipo: "sincronizar" }
  | { tipo: "novo-lancamento" }
  | { tipo: "conciliar" }
  | { tipo: "varredura-cobranca" }
  | { tipo: "link"; rotulo: string; href: string; icone?: "importar" | "cobranca" | "revisar" };

/**
 * As ações que valem para o módulo inteiro, na ordem em que aparecem.
 *
 * Mora fora de `AcoesCabecalho.tsx` porque aquele arquivo é "use client": um
 * valor exportado dele chega à página de servidor como referência de cliente,
 * não como array, e `.filter` quebra a página.
 */
export const ACOES_DO_MODULO: AcaoCabecalho[] = [
  { tipo: "link", rotulo: "Importar arquivo", href: "/financeiro/importar", icone: "importar" },
  { tipo: "sincronizar" },
  { tipo: "novo-lancamento" },
];

