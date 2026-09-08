"use client";

import { useState } from "react";
import type { CertificadoA1Info, DocumentoDFe } from "@/lib/fiscal/types";

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
      <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <label className="text-xs uppercase font-semibold text-gray-400 tracking-wider">
            Empresa / CNPJ Titular
          </label>
          <select
            value={orgSelecionadaId}
            onChange={(e) => {
              setOrgSelecionadaId(e.target.value);
              setDocumentos([]);
              setStatusSincronizacao(null);
            }}
            className="mt-1 block w-full md:w-80 bg-gray-950 border border-gray-700 text-white rounded-lg p-2.5 text-sm focus:ring-emerald-500 focus:border-emerald-500"
          >
            {organizacoes.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} {org.document ? `(${org.document})` : ""}
              </option>
            ))}
          </select>
        </div>

        {orgAtual && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSincronizarSefaz}
              disabled={sincronizando || !orgAtual.certificadoInfo || orgAtual.certificadoInfo.expirado}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-all flex items-center gap-2 shadow-lg shadow-emerald-950 cursor-pointer"
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
        <div className="p-5 bg-gray-900 border border-gray-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <span>🔐</span> Certificado Digital A1
            </h2>
            {orgAtual?.certificadoInfo ? (
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  orgAtual.certificadoInfo.status === "ATIVO"
                    ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                    : orgAtual.certificadoInfo.status === "EXPIRANDO"
                    ? "bg-amber-950 text-amber-400 border border-amber-800"
                    : "bg-rose-950 text-rose-400 border border-rose-800"
                }`}
              >
                {orgAtual.certificadoInfo.status}
              </span>
            ) : (
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-gray-800 text-gray-400 border border-gray-700">
                NÃO CONFIGURADO
              </span>
            )}
          </div>

          {orgAtual?.certificadoInfo ? (
            <div className="space-y-3 text-sm text-gray-300">
              <div className="p-3 bg-gray-950 rounded-lg border border-gray-800 space-y-1.5">
                <div className="text-xs text-gray-400">Titular / Razão Social</div>
                <div className="font-medium text-white truncate">
                  {orgAtual.certificadoInfo.razaoSocial}
                </div>
                <div className="text-xs text-gray-400 mt-2">Documento</div>
                <div className="font-mono text-emerald-400">
                  {orgAtual.certificadoInfo.cnpj || orgAtual.certificadoInfo.cpf || "—"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-gray-950 rounded-lg border border-gray-800">
                  <div className="text-gray-400">Vencimento</div>
                  <div className="font-medium text-white mt-1">
                    {new Date(orgAtual.certificadoInfo.validoAte).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div className="p-2.5 bg-gray-950 rounded-lg border border-gray-800">
                  <div className="text-gray-400">Dias Restantes</div>
                  <div
                    className={`font-medium mt-1 ${
                      orgAtual.certificadoInfo.diasParaVencer <= 30
                        ? "text-amber-400 font-bold"
                        : "text-emerald-400"
                    }`}
                  >
                    {orgAtual.certificadoInfo.diasParaVencer} dias
                  </div>
                </div>
              </div>

              <div className="text-xs text-gray-400 pt-2 border-t border-gray-800 flex justify-between">
                <span>Último NSU SEFAZ: <strong className="text-gray-200 font-mono">{orgAtual.ultNSU}</strong></span>
                <span>Máx NSU: <strong className="text-gray-200 font-mono">{orgAtual.maxNSU}</strong></span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              Nenhum certificado A1 vinculado. Faça o upload do arquivo .pfx para habilitar a busca automática de NF-e na SEFAZ.
            </p>
          )}
        </div>

        {/* Formulário de Upload / Troca de Certificado */}
        <div className="lg:col-span-2 p-5 bg-gray-900 border border-gray-800 rounded-xl">
          <h2 className="text-base font-semibold text-white flex items-center gap-2 mb-4">
            <span>📤</span> {orgAtual?.certificadoInfo ? "Atualizar / Renovar Certificado A1" : "Vincular Certificado A1 (.pfx)"}
          </h2>

          <form onSubmit={handleSalvarCertificado} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Arquivo do Certificado (.pfx ou .p12)
                </label>
                <input
                  type="file"
                  accept=".pfx,.p12"
                  onChange={(e) => setArquivoCertificado(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-800 file:text-emerald-400 hover:file:bg-gray-700 cursor-pointer bg-gray-950 border border-gray-800 rounded-lg p-1.5"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Senha do Certificado Digital
                </label>
                <input
                  type="password"
                  value={senhaCertificado}
                  onChange={(e) => setSenhaCertificado(e.target.value)}
                  placeholder="Digite a senha..."
                  className="w-full bg-gray-950 border border-gray-800 text-white rounded-lg p-2.5 text-sm focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-400">
                🔒 O arquivo e a senha são criptografados com <strong>AES-256-GCM</strong> e nunca ficam expostos.
              </p>
              <button
                type="submit"
                disabled={salvandoCertificado}
                className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg text-sm border border-gray-700 transition-all cursor-pointer"
              >
                {salvandoCertificado ? "Criptografando & Validando..." : "Salvar no Cofre"}
              </button>
            </div>

            {mensagemCertificado && (
              <div
                className={`p-3 rounded-lg text-sm font-medium border ${
                  mensagemCertificado.tipo === "sucesso"
                    ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
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
      <div className="p-5 bg-gray-900 border border-gray-800 rounded-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-gray-800 pb-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <span>📋</span> Notas Fiscais Recebidas (SEFAZ DF-e)
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Documentos emitidos contra o CNPJ sincronizados em tempo real via WebService Nacional.
            </p>
          </div>
          {statusSincronizacao && (
            <div className="text-xs px-3 py-1.5 bg-gray-950 border border-gray-800 rounded-lg text-gray-300 font-mono">
              {statusSincronizacao}
            </div>
          )}
        </div>

        {documentos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-950 text-xs uppercase text-gray-400 border-b border-gray-800">
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
              <tbody className="divide-y divide-gray-800">
                {documentos.map((doc, idx) => {
                  const isCompleta = doc.tipo === "COMPLETA";
                  const razaoSocial = isCompleta
                    ? doc.emitente.razaoSocial
                    : doc.razaoSocialEmitente;
                  const cnpj = isCompleta ? doc.emitente.cnpj : doc.cnpjEmitente;
                  const valor = doc.valorTotal;

                  return (
                    <tr key={idx} className="hover:bg-gray-950/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">
                        {doc.nsu}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${
                            isCompleta
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : "bg-blue-950 text-blue-400 border border-blue-800"
                          }`}
                        >
                          {isCompleta ? "XML Completo" : "Resumo (resNFe)"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white truncate max-w-xs">
                          {razaoSocial}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">{cnpj}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {doc.dataEmissao
                          ? new Date(doc.dataEmissao).toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-white">
                        {valor.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-gray-300">
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
                          className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded border border-gray-700 cursor-pointer"
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
          <div className="text-center py-12 text-gray-400 space-y-2">
            <div className="text-3xl">📡</div>
            <div className="text-sm font-medium text-gray-300">
              Nenhuma nota fiscal listada na sessão atual
            </div>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Clique em <strong>Sincronizar Notas SEFAZ</strong> acima para consultar novas notas emitidas contra o CNPJ selecionado.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
