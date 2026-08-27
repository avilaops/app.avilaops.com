import { cleanText } from "@/lib/http";

const FORMATS = new Set(["HTML", "TEXT", "IMAGE"]);

export type CampaignPayload = ReturnType<typeof readCampaignPayload>;

/** Leitura única do corpo de campanha, usada tanto na criação quanto na edição. */
export function readCampaignPayload(body: Record<string, unknown> | null) {
  const format = cleanText(body?.format, 10).toUpperCase() || "HTML";
  return {
    name: cleanText(body?.name, 160),
    subject: cleanText(body?.subject, 200),
    previewText: cleanText(body?.previewText, 300) || null,
    format: FORMATS.has(format) ? format : "HTML",
    html: cleanText(body?.html, 400_000) || null,
    text: cleanText(body?.text, 100_000) || null,
    imageUrl: cleanText(body?.imageUrl, 500) || null,
    imageAlt: cleanText(body?.imageAlt, 300) || null,
    imageLinkUrl: cleanText(body?.imageLinkUrl, 500) || null,
    audienceTags: cleanText(body?.audienceTags, 300)
      .split(/[,;]+/)
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 10),
  };
}
