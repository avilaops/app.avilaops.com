"use client";

import { useState } from "react";
import type { CertificadoA1Info, DocumentoDFe } from "@/lib/fiscal/types";
import { nomeProprio } from "@/lib/format";

type OrganizacaoFiscal = {
  id: string;
  name: string;
  document: string | null;
  certificadoInfo: CertificadoA1Info | null;
  ultNSU: string;
  maxNSU: string;
  ultimaSincronizacaoEm: string | null;
  bloqueadoAte: string | null;
};

export default function FiscalCommandCenterClient({
  organizacoesIniciais,
}: {
  organizacoesIniciais: OrganizacaoFiscal[];
}) {
  const [organizacoes, setOrganizacoes] = useState(organizacoesIniciais);
  const [orgSelecionadaId, setOrgSelecionadaId] = useState(
    organizacoesIniciais[0]?.id || ""
  );

  // Estados de Upload de Certificado
  const [arquivoCertificado, setArquivoCertificado] = useState<File | null>(null);
  const [senhaCertificado, setSenhaCertificado] = useState("");
  const [salvandoCertificado, setSalvandoCertificado] = useState(false);
  const [mensagemCertificado, setMensagemCertificado] = useState<{
    tipo: "sucesso" | "erro";
    texto: string;
  } | null>(null);

  // Estados de Sincronização SEFAZ
  const [sincronizando, setSincronizando] = useState(false);
  const [documentos, setDocumentos] = useState<DocumentoDFe[]>([]);
  const [statusSincronizacao, setStatusSincronizacao] = useState<string | null>(null);

  const orgAtual = organizacoes.find((o) => o.id === orgSelecionadaId);

  async function handleSalvarCertificado(e: React.FormEvent) {
    e.preventDefault();
    if (!arquivoCertificado || !senhaCertificado || !orgSelecionadaId) {
      setMensagemCertificado({
        tipo: "erro",
        texto: "Selecione o arquivo .pfx e informe a senha do certificado.",
      });
      return;
    }

    setSalvandoCertificado(true);
    setMensagemCertificado(null);

    try {
      const formData = new FormData();
      formData.append("arquivo", arquivoCertificado);
      formData.append("senha", senhaCertificado);

      const res = await fetch(
        `/api/organizations/${orgSelecionadaId}/fiscal/certificado`,
        {
          method: "POST",
          body: formData,
        }
      );

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Falha ao validar certificado.");
      }

      setMensagemCertificado({
        tipo: "sucesso",
        texto: "Certificado Digital A1 validado e salvo com sucesso no cofre seguro!",
      });

      // Atualiza o estado da organização
      setOrganizacoes((prev) =>
        prev.map((o) =>
          o.id === orgSelecionadaId
            ? { ...o, certificadoInfo: json.info }
            : o
        )
      );

      setArquivoCertificado(null);
      setSenhaCertificado("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar certificado.";
      setMensagemCertificado({ tipo: "erro", texto: msg });
    } finally {
      setSalvandoCertificado(false);
    }
  }

  async function handleSincronizarSefaz() {
    if (!orgSelecionadaId) return;

    setSincronizando(true);
    setStatusSincronizacao("Conectando ao WebService da SEFAZ Nacional via mTLS...");

    try {
      const res = await fetch(
        `/api/organizations/${orgSelecionadaId}/fiscal/sincronizar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ambiente: "PRODUCAO", limiteIteracoes: 3 }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao sincronizar com SEFAZ.");
      }

      setStatusSincronizacao(data.mensagem);
      if (data.documentos && Array.isArray(data.documentos)) {
        setDocumentos(data.documentos);
      }

      // Atualiza ponteiros de NSU da organização
      setOrganizacoes((prev) =>
        prev.map((o) =>
          o.id === orgSelecionadaId
            ? {
                ...o,
                ultNSU: data.ultNSUFinal,
                maxNSU: data.maxNSU,
                ultimaSincronizacaoEm: new Date().toISOString(),
                bloqueadoAte: data.bloqueioConsumoIndevido ? "bloqueado" : null,
              }
            : o
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro na sincronização.";
      setStatusSincronizacao(`Falha: ${msg}`);
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Seletor de Organização */}
      <div className="p-4 bg-[color:var(--superficie)] border border-[color:var(--separador)] rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <label
            htmlFor="fiscal-organizacao"
            className="text-xs uppercase font-semibold text-[color:var(--texto-secundario)] tracking-wider"
          >
            Empresa / CNPJ Titular
          </label>
          <select
            id="fiscal-organizacao"
            value={orgSelecionadaId}
            onChange={(e) => {
              setOrgSelecionadaId(e.target.value);
              setDocumentos([]);
              setStatusSincronizacao(null);
            }}
            className="mt-1 block w-full md:w-80 bg-[color:var(--superficie-suave)] border border-[color:var(--separador)] text-[color:var(--texto)] rounded-lg p-2.5 text-sm focus:ring-[color:var(--marca-azul)] focus:border-[color:var(--marca-azul)]"
          >
            {organizacoes.map((org) => (
              <option key={org.id} value={org.id}>
                {nomeProprio(org.name)} {org.document ? `(${org.document})` : ""}
              </option>
            ))}
          </select>
        </div>

        {orgAtual && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSincronizarSefaz}
              disabled={sincronizando || !orgAtual.certificadoInfo || orgAtual.certificadoInfo.expirado}
              className="px-5 py-2.5 bg-[color:var(--marca-azul)] hover:opacity-90 disabled:opacity-50 text-[color:var(--texto)] font-medium rounded-lg text-sm transition-all flex items-center gap-2 shadow-lg shadow-emerald-950 cursor-pointer"
            >
              {sincronizando ? (
                <>
                  <span className="inline-block animate-spin">⟳</span>
                  Sincronizando SEFAZ...
                </>
              ) : (
                <>
                  <span>⚡</span>
                  Sincronizar Notas SEFAZ
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Grid de Informações e Upload */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card de Status do Certificado A1 */}
        <div className="p-5 bg-[color:var(--superficie)] border border-[color:var(--separador)] rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[color:var(--texto)] flex items-center gap-2">
              <span>🔐</span> Certificado Digital A1
            </h2>
            {orgAtual?.certificadoInfo ? (
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  orgAtual.certificadoInfo.status === "ATIVO"
                    ? "bg-[color:var(--superficie-suave)] text-[color:var(--green)] border border-[color:var(--green-line)]"
                    : orgAtual.certificadoInfo.status === "EXPIRANDO"
                    ? "bg-amber-950 text-amber-400 border border-amber-800"
                    : "bg-rose-950 text-rose-400 border border-rose-800"
                }`}
              >
                {orgAtual.certificadoInfo.status}
              </span>
            ) : (
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-[color:var(--superficie-suave)] text-[color:var(--texto-secundario)] border border-[color:var(--separador)]">
                NÃO CONFIGURADO
              </span>
            )}
          </div>

          {orgAtual?.certificadoInfo ? (
            <div className="space-y-3 text-sm text-[color:var(--texto-secundario)]">
              <div className="p-3 bg-[color:var(--superficie-suave)] rounded-lg border border-[color:var(--separador)] space-y-1.5">
                <div className="text-xs text-[color:var(--texto-secundario)]">Titular / Razão Social</div>
                <div className="font-medium text-[color:var(--texto)] truncate">
                  {orgAtual.certificadoInfo.razaoSocial}
                </div>
                <div className="text-xs text-[color:var(--texto-secundario)] mt-2">Documento</div>
                <div className="font-mono text-[color:var(--green)]">
                  {orgAtual.certificadoInfo.cnpj || orgAtual.certificadoInfo.cpf || "-"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-[color:var(--superficie-suave)] rounded-lg border border-[color:var(--separador)]">
                  <div className="text-[color:var(--texto-secundario)]">Vencimento</div>
                  <div className="font-medium text-[color:var(--texto)] mt-1">
                    {new Date(orgAtual.certificadoInfo.validoAte).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div className="p-2.5 bg-[color:var(--superficie-suave)] rounded-lg border border-[color:var(--separador)]">
                  <div className="text-[color:var(--texto-secundario)]">Dias Restantes</div>
                  <div
                    className={`font-medium mt-1 ${
                      orgAtual.certificadoInfo.diasParaVencer <= 30
                        ? "text-amber-400 font-bold"
                        : "text-[color:var(--green)]"
                    }`}
                  >
                    {orgAtual.certificadoInfo.diasParaVencer} dias
                  </div>
                </div>
              </div>

              <div className="text-xs text-[color:var(--texto-secundario)] pt-2 border-t border-[color:var(--separador)] flex justify-between">
                <span>Último NSU SEFAZ: <strong className="text-[color:var(--texto)] font-mono">{orgAtual.ultNSU}</strong></span>
                <span>Máx NSU: <strong className="text-[color:var(--texto)] font-mono">{orgAtual.maxNSU}</strong></span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[color:var(--texto-secundario)]">
              Nenhum certificado A1 vinculado. Faça o upload do arquivo .pfx para habilitar a busca automática de NF-e na SEFAZ.
            </p>
          )}
        </div>

        {/* Formulário de Upload / Troca de Certificado */}
        <div className="lg:col-span-2 p-5 bg-[color:var(--superficie)] border border-[color:var(--separador)] rounded-xl">
          <h2 className="text-base font-semibold text-[color:var(--texto)] flex items-center gap-2 mb-4">
            <span>📤</span> {orgAtual?.certificadoInfo ? "Atualizar / Renovar Certificado A1" : "Vincular Certificado A1 (.pfx)"}
          </h2>

          <form onSubmit={handleSalvarCertificado} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="fiscal-arquivo-certificado"
                  className="block text-xs font-semibold text-[color:var(--texto-secundario)] mb-1.5"
                >
                  Arquivo do Certificado (.pfx ou .p12)
                </label>
                <input
                  id="fiscal-arquivo-certificado"
                  type="file"
                  accept=".pfx,.p12"
                  onChange={(e) => setArquivoCertificado(e.target.files?.[0] || null)}
                  className="w-full text-sm text-[color:var(--texto-secundario)] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[color:var(--superficie-suave)] file:text-[color:var(--green)] hover:file:bg-[color:var(--hover-bg)] cursor-pointer bg-[color:var(--superficie-suave)] border border-[color:var(--separador)] rounded-lg p-1.5"
                />
              </div>

              <div>
                <label
                  htmlFor="fiscal-senha-certificado"
                  className="block text-xs font-semibold text-[color:var(--texto-secundario)] mb-1.5"
                >
                  Senha do Certificado Digital
                </label>
                <input
                  id="fiscal-senha-certificado"
                  type="password"
                  value={senhaCertificado}
                  onChange={(e) => setSenhaCertificado(e.target.value)}
                  placeholder="Digite a senha..."
                  className="w-full bg-[color:var(--superficie-suave)] border border-[color:var(--separador)] text-[color:var(--texto)] rounded-lg p-2.5 text-sm focus:ring-[color:var(--marca-azul)] focus:border-[color:var(--marca-azul)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-[color:var(--texto-secundario)]">
                🔒 O arquivo e a senha são criptografados com <strong>AES-256-GCM</strong> e nunca ficam expostos.
              </p>
              <button
                type="submit"
                disabled={salvandoCertificado}
                className="px-5 py-2 bg-[color:var(--superficie-suave)] hover:bg-[color:var(--hover-bg)] text-[color:var(--texto)] font-medium rounded-lg text-sm border border-[color:var(--separador)] transition-all cursor-pointer"
              >
                {salvandoCertificado ? "Criptografando & Validando..." : "Salvar no Cofre"}
              </button>
            </div>

            {mensagemCertificado && (
              <div
                className={`p-3 rounded-lg text-sm font-medium border ${
                  mensagemCertificado.tipo === "sucesso"
                    ? "bg-[color:var(--superficie-suave)]/60 border-[color:var(--green-line)] text-[color:var(--green)]"
                    : "bg-rose-950/60 border-rose-800 text-rose-300"
                }`}
              >
                {mensagemCertificado.texto}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Seção de Status e Documentos Sincronizados */}
      <div className="p-5 bg-[color:var(--superficie)] border border-[color:var(--separador)] rounded-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-[color:var(--separador)] pb-4">
          <div>
            <h2 className="text-base font-semibold text-[color:var(--texto)] flex items-center gap-2">
              <span>📋</span> Notas Fiscais Recebidas (SEFAZ DF-e)
            </h2>
            <p className="text-xs text-[color:var(--texto-secundario)] mt-0.5">
              Documentos emitidos contra o CNPJ sincronizados em tempo real via WebService Nacional.
            </p>
          </div>
          {statusSincronizacao && (
            <div className="text-xs px-3 py-1.5 bg-[color:var(--superficie-suave)] border border-[color:var(--separador)] rounded-lg text-[color:var(--texto-secundario)] font-mono">
              {statusSincronizacao}
            </div>
          )}
        </div>

        {documentos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[color:var(--texto-secundario)]">
              <thead className="bg-[color:var(--superficie-suave)] text-xs uppercase text-[color:var(--texto-secundario)] border-b border-[color:var(--separador)]">
                <tr>
                  <th className="px-4 py-3">NSU</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Emitente / Fornecedor</th>
                  <th className="px-4 py-3">Emissão</th>
                  <th className="px-4 py-3 text-right">Valor Total</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--separador)]">
                {documentos.map((doc, idx) => {
                  const isCompleta = doc.tipo === "COMPLETA";
                  const razaoSocial = isCompleta
                    ? doc.emitente.razaoSocial
                    : doc.razaoSocialEmitente;
                  const cnpj = isCompleta ? doc.emitente.cnpj : doc.cnpjEmitente;
                  const valor = doc.valorTotal;

                  return (
                    <tr key={idx} className="hover:bg-[color:var(--superficie-suave)]/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-[color:var(--texto-secundario)]">
                        {doc.nsu}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${
                            isCompleta
                              ? "bg-[color:var(--superficie-suave)] text-[color:var(--green)] border border-[color:var(--green-line)]"
                              : "bg-blue-950 text-blue-400 border border-blue-800"
                          }`}
                        >
                          {isCompleta ? "XML Completo" : "Resumo (resNFe)"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[color:var(--texto)] truncate max-w-xs">
                          {razaoSocial}
                        </div>
                        <div className="text-xs text-[color:var(--texto-secundario)] font-mono">{cnpj}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[color:var(--texto-secundario)]">
                        {doc.dataEmissao
                          ? new Date(doc.dataEmissao).toLocaleDateString("pt-BR")
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-[color:var(--texto)]">
                        {valor.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-[color:var(--texto-secundario)]">
                          {isCompleta
                            ? `${doc.itens.length} produto(s)`
                            : "Ciência Enviada"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() =>
                            navigator.clipboard.writeText(doc.chaveAcesso)
                          }
                          className="text-xs px-2.5 py-1 bg-[color:var(--superficie-suave)] hover:bg-[color:var(--hover-bg)] text-[color:var(--texto)] rounded border border-[color:var(--separador)] cursor-pointer"
                          title={`Chave: ${doc.chaveAcesso}`}
                        >
                          Copiar Chave
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-[color:var(--texto-secundario)] space-y-2">
            <div className="text-3xl">📡</div>
            <div className="text-sm font-medium text-[color:var(--texto-secundario)]">
              Nenhuma nota fiscal listada na sessão atual
            </div>
            <p className="text-xs text-[color:var(--texto-terciario)] max-w-md mx-auto">
              Clique em <strong>Sincronizar Notas SEFAZ</strong> acima para consultar novas notas emitidas contra o CNPJ selecionado.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
