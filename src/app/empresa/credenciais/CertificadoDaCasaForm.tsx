"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Grupo } from "@/components/sistema/Lista";
import type { CertificadoDaCasa } from "@/lib/dados-da-casa";

const ROTULO_STATUS = {
  ATIVO: "Válido",
  EXPIRANDO: "Vence em breve",
  EXPIRADO: "Vencido",
} as const;

function formatarCnpj(digitos: string) {
  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/**
 * O certificado A1 da casa: o que assina a nota de serviço.
 *
 * O que aparece é o que foi LIDO do arquivo (titular, CNPJ, validade), nunca o
 * que alguém digitou. E se o CNPJ do certificado não for o do cadastro, a tela
 * diz — nota assinada com o certificado de outra empresa é rejeitada.
 */
export default function CertificadoDaCasaForm({
  certificado,
  cnpjCadastrado,
}: {
  certificado: CertificadoDaCasa | null;
  cnpjCadastrado: string;
}) {
  const router = useRouter();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  const cnpjDivergente =
    certificado?.cnpj && cnpjCadastrado && certificado.cnpj !== cnpjCadastrado;

  async function enviar() {
    if (!arquivo || !senha) return;
    setOcupado(true);
    setErro(null);
    setRecado(null);

    const corpo = new FormData();
    corpo.append("certificado", arquivo);
    corpo.append("senha", senha);

    try {
      const resposta = await fetch("/api/empresa/certificado", { method: "POST", body: corpo });
      const dados = (await resposta.json().catch(() => ({}))) as { erro?: string };
      if (!resposta.ok) throw new Error(dados.erro ?? "Não consegui guardar o certificado.");
      setRecado("Certificado guardado.");
      setArquivo(null);
      setSenha("");
      if (arquivoRef.current) arquivoRef.current.value = "";
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui guardar o certificado.");
    } finally {
      setOcupado(false);
    }
  }

  async function remover() {
    if (!window.confirm("Remover o certificado digital da casa? A emissão de nota para até um novo ser enviado.")) {
      return;
    }
    setOcupado(true);
    setErro(null);
    setRecado(null);
    try {
      const resposta = await fetch("/api/empresa/certificado", { method: "DELETE" });
      if (!resposta.ok) throw new Error("Não consegui remover o certificado.");
      setRecado("Certificado removido.");
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui remover o certificado.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Grupo titulo="Certificado digital">
      <div className="credenciais-form">
        {certificado ? (
          <dl className="certificado-ficha">
            <div>
              <dt>Titular</dt>
              <dd>{certificado.razaoSocial}</dd>
            </div>
            <div>
              <dt>{certificado.cnpj ? "CNPJ" : "CPF"}</dt>
              <dd>{certificado.cnpj ? formatarCnpj(certificado.cnpj) : certificado.cpf ?? "—"}</dd>
            </div>
            <div>
              <dt>Validade</dt>
              <dd>
                {new Date(certificado.validoAte).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} ·{" "}
                <span className={`certificado-status certificado-${certificado.status.toLowerCase()}`}>
                  {ROTULO_STATUS[certificado.status]}
                  {certificado.expirado ? "" : ` (${certificado.diasParaVencer} dias)`}
                </span>
              </dd>
            </div>
            <div>
              <dt>Emissor</dt>
              <dd className="certificado-emissor">{certificado.emissor.split("\n").find((l) => l.startsWith("CN="))?.slice(3) ?? certificado.emissor}</dd>
            </div>
          </dl>
        ) : (
          <p className="identidade-dica">
            Nenhum certificado guardado. É o A1 (arquivo .pfx ou .p12) que assina a nota de serviço.
          </p>
        )}

        {cnpjDivergente ? (
          <p className="aviso-erro">
            O CNPJ do certificado ({formatarCnpj(certificado!.cnpj!)}) não é o do cadastro da empresa (
            {formatarCnpj(cnpjCadastrado)}). Nota assinada assim é rejeitada pela prefeitura.
          </p>
        ) : null}

        <input
          ref={arquivoRef}
          type="file"
          accept=".pfx,.p12,application/x-pkcs12"
          className="campo-arquivo"
          aria-label="Escolher arquivo do certificado"
          disabled={ocupado}
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
        />

        <div className="identidade-acoes">
          <button
            type="button"
            className="secondary-button"
            disabled={ocupado}
            onClick={() => arquivoRef.current?.click()}
          >
            {arquivo ? arquivo.name : certificado ? "Trocar certificado" : "Escolher arquivo .pfx"}
          </button>
          {certificado ? (
            <button type="button" className="text-button" disabled={ocupado} onClick={() => void remover()}>
              Remover
            </button>
          ) : null}
        </div>

        {arquivo ? (
          <>
            <label className="credencial-campo">
              <span>Senha do certificado</span>
              <input
                type="password"
                autoComplete="off"
                value={senha}
                disabled={ocupado}
                onChange={(e) => setSenha(e.target.value)}
              />
              <small>Conferida na hora: senha errada volta como erro, não é guardada.</small>
            </label>
            <div className="credenciais-acoes">
              <button
                type="button"
                className="primary-button"
                disabled={ocupado || !senha}
                onClick={() => void enviar()}
              >
                {ocupado ? "Lendo certificado…" : "Guardar certificado"}
              </button>
              <small>Arquivo e senha são cifrados no banco. Nenhum dos dois volta para a tela.</small>
            </div>
          </>
        ) : null}

        {erro ? <p className="aviso-erro">{erro}</p> : null}
        {recado ? <p className="aviso-ok">{recado}</p> : null}
      </div>
    </Grupo>
  );
}
