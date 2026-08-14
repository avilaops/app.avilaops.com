"use client";

import { useState } from "react";

export default function BalanceCard({
  formattedBalance,
  capturedAtLabel,
}: {
  formattedBalance: string;
  capturedAtLabel: string;
}) {
  const [visible, setVisible] = useState(true);

  return (
    <article className="metric metric-primary balance-card">
      <div className="balance-card-head">
        <span>Saldo disponível</span>
        <button
          type="button"
          className="row-action balance-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Ocultar saldo" : "Mostrar saldo"}
          aria-pressed={!visible}
        >
          {visible ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.36 5.6C10.2 5.36 11.08 5.24 12 5.24c7 0 11 7 11 7-.72 1.24-1.63 2.53-2.77 3.68M6.6 6.98C4.24 8.42 2.5 10.5 1 12c0 0 4 7 11 7 1.34 0 2.58-.24 3.7-.66"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>
      <strong>{visible ? formattedBalance : "••••••"}</strong>
      <small>{capturedAtLabel}</small>
    </article>
  );
}
