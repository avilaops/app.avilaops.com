"use client";

import { useEffect, useRef, useState } from "react";

type ChargeResult = {
  method: "PIX" | "BOLETO" | "CARD";
  status: string;
  pixCopyPaste?: string;
  pixQrBase64?: string;
  boletoUrl?: string;
  boletoBarcode?: string;
};

export default function PaymentPanel({
  token,
  amount,
  recipientName,
  recipientEmail,
}: {
  token: string;
  amount: number;
  recipientName: string | null;
  recipientEmail: string | null;
}) {
  const [loadingMethod, setLoadingMethod] = useState<string | null>(null);
  const [charge, setCharge] = useState<ChargeResult | null>(null);
  const [error, setError] = useState("");
  const [paid, setPaid] = useState(false);
  const [showBoletoForm, setShowBoletoForm] = useState(false);
  const [payerName, setPayerName] = useState(recipientName ?? "");
  const [payerEmail, setPayerEmail] = useState(recipientEmail ?? "");
  const [payerCpf, setPayerCpf] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function createCharge(method: "PIX" | "BOLETO", payer?: { name: string; cpf: string; email: string }) {
    setLoadingMethod(method);
    setError("");
    setCharge(null);

    try {
      const response = await fetch(`/api/entregaveis/${token}/charges`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method, payer }),
      });
      const result = (await response.json()) as ChargeResult & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível gerar a cobrança.");

      setCharge(result);
      setShowBoletoForm(false);

      if (method === "PIX") {
        pollRef.current = setInterval(async () => {
          const check = await fetch(`/api/entregaveis/${token}/status`);
          const status = (await check.json()) as { paid?: boolean };
          if (status.paid) {
            setPaid(true);
            if (pollRef.current) clearInterval(pollRef.current);
            window.location.reload();
          }
        }, 4000);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível gerar a cobrança.");
    } finally {
      setLoadingMethod(null);
    }
  }

  function submitBoletoForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payerName.trim() || !payerEmail.trim() || payerCpf.replace(/\D/g, "").length !== 11) {
      setError("Informe nome, e-mail e um CPF válido para gerar o boleto.");
      return;
    }
    void createCharge("BOLETO", { name: payerName.trim(), email: payerEmail.trim(), cpf: payerCpf });
  }

  return (
    <div className="payment-panel">
      {!charge && !showBoletoForm ? (
        <div className="payment-methods">
          <button
            type="button"
            className="primary-button"
            onClick={() => void createCharge("PIX")}
            disabled={loadingMethod !== null}
          >
            {loadingMethod === "PIX" ? "Gerando…" : "Pagar com PIX"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowBoletoForm(true)}
            disabled={loadingMethod !== null}
          >
            Pagar com boleto
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setError("Pagamento por cartão ainda está sendo configurado. Por enquanto, use PIX ou boleto.")
            }
            disabled={loadingMethod !== null}
          >
            Pagar com cartão
          </button>
        </div>
      ) : null}

      {showBoletoForm && !charge ? (
        <form className="boleto-form" onSubmit={submitBoletoForm}>
          <label>
            Nome completo
            <input value={payerName} onChange={(event) => setPayerName(event.target.value)} required />
          </label>
          <label>
            E-mail
            <input
              type="email"
              value={payerEmail}
              onChange={(event) => setPayerEmail(event.target.value)}
              required
            />
          </label>
          <label>
            CPF
            <input
              value={payerCpf}
              onChange={(event) => setPayerCpf(event.target.value)}
              placeholder="Somente números"
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={loadingMethod !== null}>
            {loadingMethod === "BOLETO" ? "Gerando…" : "Gerar boleto"}
          </button>
        </form>
      ) : null}

      {charge?.method === "PIX" && charge.pixQrBase64 ? (
        <div className="pix-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={charge.pixQrBase64} alt="QR Code PIX" />
          <label>
            Pix copia e cola
            <textarea readOnly rows={3} value={charge.pixCopyPaste} />
          </label>
          <p>{paid ? "Pagamento confirmado!" : "Aguardando confirmação do pagamento…"}</p>
        </div>
      ) : null}

      {charge?.method === "BOLETO" && charge.boletoUrl ? (
        <div className="boleto-panel">
          <a className="primary-button" href={charge.boletoUrl} target="_blank" rel="noopener noreferrer">
            Abrir boleto
          </a>
          <p>Código de barras: {charge.boletoBarcode}</p>
        </div>
      ) : null}

      {error ? <p className="inline-feedback feedback-error">{error}</p> : null}
      <p className="payment-footnote">
        Valor de{" "}
        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount)}{" "}
        processado com segurança pelo Efí.
      </p>
    </div>
  );
}
