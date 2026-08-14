import { notFound } from "next/navigation";
import { getDeliverableByToken } from "@/lib/deliverables";
import { formatCurrency } from "@/lib/format";
import PaymentPanel from "@/components/PaymentPanel";

export default async function DeliverablePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const deliverable = await getDeliverableByToken(token);
  if (!deliverable || deliverable.status === "CANCELLED") notFound();

  const isPaid = deliverable.status === "PAID";

  return (
    <main className="deliverable-page">
      <div className="deliverable-card">
        <span className="eyebrow">Ávila Ops · Entrega</span>
        <h1>{deliverable.title}</h1>
        {deliverable.description ? <p>{deliverable.description}</p> : null}

        {deliverable.previewFileName ? (
          <div className="deliverable-preview">
            {deliverable.previewMimeType?.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/entregaveis/${token}/preview`} alt="Prévia do entregável" />
            ) : (
              <iframe src={`/api/entregaveis/${token}/preview`} title="Prévia do entregável" />
            )}
          </div>
        ) : null}

        <div className="deliverable-price">
          <span>Valor</span>
          <strong>{formatCurrency(deliverable.amount.toString())}</strong>
        </div>

        {isPaid ? (
          <a className="primary-button" href={`/api/entregaveis/${token}/download`}>
            Baixar arquivo completo
          </a>
        ) : (
          <PaymentPanel
            token={token}
            amount={Number(deliverable.amount)}
            recipientName={deliverable.recipientName}
            recipientEmail={deliverable.recipientEmail}
          />
        )}
      </div>
    </main>
  );
}
