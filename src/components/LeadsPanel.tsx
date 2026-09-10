"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { chamar } from "@/components/provisionamento/comum";

export type LeadDaLista = {
  id: string;
  empresa: string;
  contato: string | null;
  telefone: string | null;
  canal: string;
  estagio: string;
  valorEstimado: number | null;
  notas: string | null;
  proximaAcaoEm: string | null;
  criadoEm: string;
  cliente: { id: string; name: string } | null;
};

/*
 * Os estágios em ordem de funil. O rótulo é o que a tela mostra; o valor é o
 * que está no banco.
 *
 * Esta lista é a do CHECK `leads_stage_check`, que existe desde a migração
 * inicial: NEW, QUALIFIED, DIAGNOSIS, PROPOSAL, WON, LOST. Em 10/09/2026 a tela
 * nasceu oferecendo "CONTACTED", que não está no CHECK, e mudar o estágio
 * devolvia 500. Quem acrescentar um estágio aqui muda o CHECK junto.
 *
 * Estágio fora desta lista aparece como veio, para ninguém sumir com um lead
 * por causa de um valor novo.
 */
const ESTAGIOS: { valor: string; rotulo: string }[] = [
  { valor: "NEW", rotulo: "Novo" },
  { valor: "QUALIFIED", rotulo: "Qualificado" },
  { valor: "DIAGNOSIS", rotulo: "Em diagnóstico" },
  { valor: "PROPOSAL", rotulo: "Proposta enviada" },
  { valor: "WON", rotulo: "Ganho" },
  { valor: "LOST", rotulo: "Perdido" },
];

const rotuloEstagio = (valor: string) =>
  ESTAGIOS.find((e) => e.valor === valor)?.rotulo ?? valor;

function apenasDigitos(telefone: string) {
  return telefone.replace(/\D/g, "");
}

/** WhatsApp com DDI do Brasil quando o número vem sem ele. */
function linkWhatsApp(telefone: string) {
  const digitos = apenasDigitos(telefone);
  if (digitos.length < 10) return null;
  const completo = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${completo}`;
}

function dataCurta(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function diasDesde(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

export default function LeadsPanel({ leads }: { leads: LeadDaLista[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [mostrarFechados, setMostrarFechados] = useState(false);

  const fechados = leads.filter((l) => l.estagio === "WON" || l.estagio === "LOST");
  const abertos = leads.filter((l) => l.estagio !== "WON" && l.estagio !== "LOST");
  const visiveis = mostrarFechados ? leads : abertos;

  async function mudarEstagio(id: string, estagio: string) {
    setErro("");
    setOcupado(id);
    try {
      await chamar(`/api/leads/${id}`, { stage: estagio }, "PATCH");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setOcupado(null);
    }
  }

  if (leads.length === 0) {
    return (
      <section className="operations-panel leads-panel">
        <div className="operations-empty">
          <strong>Nenhum lead ainda.</strong>
          <p>O formulário do avilaops.com cai aqui assim que alguém pedir contato.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="operations-panel leads-panel">
      <div className="operations-panel-heading">
        <h2>{mostrarFechados ? "Todos" : "Em aberto"}</h2>
        <span className="panel-count">{visiveis.length}</span>
        {fechados.length > 0 && (
          <button
            type="button"
            className="text-link"
            onClick={() => setMostrarFechados((v) => !v)}
          >
            {mostrarFechados ? "Só os abertos" : `Ver ganhos e perdidos (${fechados.length})`}
          </button>
        )}
      </div>

      {erro && <p className="prov-empty negative">{erro}</p>}

      <div className="ios-list">
        {visiveis.map((lead) => {
          const whats = lead.telefone ? linkWhatsApp(lead.telefone) : null;
          return (
            <div className="ios-row lead-row" key={lead.id}>
              <div className="prov-row-main">
                <strong>{lead.empresa}</strong>
                <small>
                  {[
                    lead.contato,
                    lead.telefone,
                    `${lead.canal} · ${diasDesde(lead.criadoEm)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
                {lead.notas && <small className="lead-notas">{lead.notas}</small>}
                {lead.proximaAcaoEm && (
                  <small className="negative">Retomar em {dataCurta(lead.proximaAcaoEm)}</small>
                )}
                {lead.cliente && (
                  <Link className="text-link" href={`/clientes/${lead.cliente.id}`}>
                    Já é cliente: {lead.cliente.name}
                  </Link>
                )}
              </div>

              <div className="lead-acoes">
                {whats && (
                  <a
                    className="secondary-button"
                    href={whats}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Falar
                  </a>
                )}
                {/* Mudar o estágio é a única coisa que se faz com um lead nesta
                    tela, então é um campo só, sem folha e sem formulário. */}
                {/* Sem as classes `status-*` aqui: elas pintam a borda de
                    âmbar e o campo passa a parecer erro de validação. Cor de
                    estado é para a pílula, não para o campo que se edita. */}
                <select
                  className="lead-estagio"
                  value={ESTAGIOS.some((e) => e.valor === lead.estagio) ? lead.estagio : ""}
                  disabled={ocupado === lead.id}
                  onChange={(evento) => mudarEstagio(lead.id, evento.target.value)}
                  aria-label={`Estágio de ${lead.empresa}`}
                >
                  {!ESTAGIOS.some((e) => e.valor === lead.estagio) && (
                    <option value="">{rotuloEstagio(lead.estagio)}</option>
                  )}
                  {ESTAGIOS.map((e) => (
                    <option key={e.valor} value={e.valor}>
                      {e.rotulo}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
