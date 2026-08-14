import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";

export function generateAccessToken(): string {
  return randomBytes(24).toString("hex");
}

export async function getDeliverableByToken(token: string) {
  return prisma.deliverable.findUnique({
    where: { accessToken: token },
    include: {
      organization: { select: { name: true } },
      charges: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function getDeliverablesForProject(projectId: string) {
  return prisma.deliverable.findMany({
    where: { projectId },
    include: { charges: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });
}

function notifyPaymentWebhook(deliverable: {
  id: string;
  title: string;
  amount: unknown;
  recipientName: string | null;
  recipientEmail: string | null;
}) {
  const webhookUrl = process.env.N8N_PAYMENT_WEBHOOK_URL?.trim();
  const webhookToken = process.env.N8N_PAYMENT_WEBHOOK_TOKEN?.trim();
  if (!webhookUrl || !webhookToken) return;

  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-n8n-webhook-token": webhookToken },
    body: JSON.stringify({
      deliverableId: deliverable.id,
      title: deliverable.title,
      amount: deliverable.amount,
      recipientName: deliverable.recipientName,
      recipientEmail: deliverable.recipientEmail,
    }),
  }).catch((error) => {
    console.error("Falha ao notificar webhook de pagamento (n8n)", error);
  });
}

export async function markDeliverablePaidAndNotify(deliverableId: string) {
  const deliverable = await prisma.deliverable.findUnique({ where: { id: deliverableId } });
  if (!deliverable || deliverable.status === "PAID") return;

  await prisma.deliverable.update({
    where: { id: deliverableId },
    data: { status: "PAID", paidAt: new Date() },
  });

  notifyPaymentWebhook(deliverable);

  if (!deliverable.recipientEmail) return;

  const baseUrl = process.env.APP_BASE_URL?.trim() || "https://app.avilaops.com";
  const downloadPageUrl = `${baseUrl}/entrega/${deliverable.accessToken}`;

  try {
    await sendEmail({
      to: deliverable.recipientEmail,
      subject: `Pagamento confirmado: ${deliverable.title}`,
      html: `
        <p>Olá${deliverable.recipientName ? `, ${deliverable.recipientName}` : ""}!</p>
        <p>Recebemos a confirmação do pagamento de <strong>${deliverable.title}</strong>.</p>
        <p><a href="${downloadPageUrl}">Clique aqui para baixar o arquivo completo</a>.</p>
        <p>Ávila Ops</p>
      `,
    });
  } catch (error) {
    console.error("Falha ao enviar e-mail de confirmação do entregável", error);
  }
}
