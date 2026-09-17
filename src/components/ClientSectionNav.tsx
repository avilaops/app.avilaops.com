"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const sections = [["summary", "Resumo"], ["registration", "Cadastro"], ["services", "Serviços"], ["finance", "Financeiro"], ["files", "Arquivos"], ["database", "Banco de dados"]] as const;

export default function ClientSectionNav({ clientId, active }: { clientId: string; active: string }) {
  const router = useRouter();
  return <nav className="client-workspace-nav" aria-label="Seções do cliente">
    <label><span>Seção atual</span><select value={active} onChange={(event) => router.push(`/clientes/${clientId}?section=${event.target.value}`)}>{sections.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <div>{sections.map(([key, label]) => <Link key={key} href={`/clientes/${clientId}?section=${key}`} aria-current={active === key ? "page" : undefined}>{label}</Link>)}</div>
  </nav>;
}
