import { z } from "zod";

export const canais = ["instagram", "facebook", "reddit", "tiktok", "whatsapp"] as const;
export type Canal = typeof canais[number];
const urlPublica = z.string().url().refine((s) => {
  const u = new URL(s);
  return u.protocol === "https:" && !u.username && !u.password && !u.hash;
}, "Use HTTPS sem credenciais ou fragmento.");
export const perfilSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  organizationId: z.string().min(1).max(60),
});
export const publicacaoSchema = z.object({
  perfilId: z.string().uuid(),
  titulo: z.string().trim().min(1).max(250),
  texto: z.string().trim().min(1).max(10000),
  tipo: z.enum(["text", "link", "image", "video"]),
  midiaUrl: urlPublica.nullable().default(null),
  renderId: z.string().regex(/^[a-z0-9]+$/).max(80).nullable().optional(),
  canais: z.array(z.enum(canais)).min(1).max(5).refine(c => new Set(c).size === c.length, "Canal repetido."),
  opcionais: z.array(z.enum(canais)).default([]),
  agendadoEm: z.iso.datetime({ offset: true }),
  chave: z.string().uuid(),
}).superRefine((p, ctx) => {
  if (p.tipo !== "text" && !p.midiaUrl && !p.renderId) ctx.addIssue({ code: "custom", path: ["midiaUrl"], message: "Informe a mídia ou selecione um resultado do Estúdio." });
  if(p.midiaUrl && p.renderId) ctx.addIssue({code:"custom",path:["renderId"],message:"Escolha uma mídia do Estúdio ou um endereço externo."});
  if(p.renderId && !["image","video"].includes(p.tipo)) ctx.addIssue({code:"custom",path:["renderId"],message:"Resultado do Estúdio exige formato imagem ou vídeo."});
  if (p.opcionais.some(c => !p.canais.includes(c)) || p.canais.every(c => p.opcionais.includes(c))) {
    ctx.addIssue({ code: "custom", path: ["opcionais"], message: "Mantenha pelo menos um canal obrigatório." });
  }
});
export type NovaPublicacao = z.infer<typeof publicacaoSchema>;

export const destinoSchema = z.object({
  perfilId: z.string().uuid(),
  canal: z.enum(canais),
  identificador: z.string().trim().min(1).max(200),
  credencial: z.string().regex(/^(SOCIAL_[A-Z0-9_]+_TOKEN|META_EMPRESA)$/),
  ativo: z.boolean().default(false),
});

export function classificarFalha(ambigua: boolean, transitoria: boolean, tentativa: number) {
  return ambigua ? "RECONCILIAR" : transitoria && tentativa < 5 ? "REPETIR" : "QUARENTENA";
}

export function impedimentoDoCanal(canal: Canal, tipo: NovaPublicacao["tipo"]): string | null {
  if(canal==="tiktok") return "TikTok depende de integração aprovada para este uso.";
  if(canal==="whatsapp") return "WhatsApp depende de um destino suportado, com remetente e destinatário validados.";
  if(canal==="reddit" && ["image","video"].includes(tipo)) return "Upload nativo de imagem e vídeo no Reddit ainda não está disponível.";
  if(canal==="facebook" && tipo==="video") return "Publicação de vídeo no Facebook ainda não está disponível.";
  if(canal==="instagram" && !["image","video"].includes(tipo)) return "Instagram exige imagem ou vídeo.";
  return null;
}
