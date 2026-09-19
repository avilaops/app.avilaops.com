/**
 * O vocabulário da entrega, separado de quem faz o trabalho.
 *
 * `publicar.ts` fala com o banco e com o Cloudflare; a tela precisa apenas
 * entender o resultado. Com os tipos aqui, um componente de cliente descreve
 * uma publicação sem arrastar Prisma nem as credenciais da conta para o
 * pacote do navegador.
 */

/** Por que um domínio não tem como receber os arquivos pela borda. */
export type MotivoForaDeAlcance = "sem-zona" | "sem-proxy";

export type SituacaoDominio = {
  fqdn: string;
  empresa: string;
  /** null quando o domínio está fora de alcance. */
  zoneId: string | null;
  foraDeAlcance: MotivoForaDeAlcance | null;
  /** Caminhos que o site já serve sozinho — a borda não encosta neles. */
  jaServidos: string[];
  /** Caminhos que a borda passa a servir. */
  publicados: string[];
  /** Depois de publicar: caminhos conferidos ao vivo respondendo pela borda. */
  confirmados: string[];
  erro?: string;
};

export type ResultadoEntrega = {
  executadoEm: string;
  /** false quando nada foi enviado ao Cloudflare (ensaio). */
  aplicado: boolean;
  dominios: SituacaoDominio[];
};
