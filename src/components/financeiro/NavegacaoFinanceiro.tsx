"use client";

import { usePathname } from "next/navigation";
import { AbasLink } from "@/components/financeiro/Filtros";

const paginas = [
  ["/financeiro", "Visão geral"],
  ["/financeiro/contas", "Contas"],
  ["/financeiro/mercadopago", "Mercado Pago"],
  ["/relatorios", "Relatórios"],
  ["/financeiro/importar", "Importar"],
  ["/financeiro/credito", "Score"],
];

export default function NavegacaoFinanceiro() {
  const caminho = usePathname();
  return <div className="mb-4 min-w-0"><AbasLink rotulo="Páginas do Financeiro" abas={paginas.map(([href, rotulo]) => ({ href, rotulo, ativa: caminho === href }))} /></div>;
}
