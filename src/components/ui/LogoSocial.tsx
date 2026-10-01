/**
 * Logotipo de rede ou provedor.
 *
 * Marca de terceiro é desenho registrado: não se redesenha à mão como os
 * ícones de `Icones.tsx`. Os arquivos vêm do Wikimedia Commons e ficam em
 * `public/marca/social/` com a procedência de cada um em `CREDITOS.md`.
 *
 * O uso permitido aqui é identificar o provedor de uma integração ou de uma
 * chave no cofre. Não serve de selo de parceria nem de endosso, e por isso a
 * marca nunca aparece sozinha: sempre ao lado do nome que a tela já dá.
 */

export type MarcaSocial =
  | "apple"
  | "discord"
  | "facebook"
  | "github"
  | "google"
  | "instagram"
  | "linkedin"
  | "microsoft"
  | "pinterest"
  | "reddit"
  | "telegram"
  | "threads"
  | "tiktok"
  | "twitch"
  | "whatsapp"
  | "x"
  | "youtube";

/**
 * Marcas cujo desenho oficial é um traço preto sobre fundo transparente. Num
 * tema escuro elas somem, então o CSS as inverte para branco.
 *
 * Três grupos ficam de fora, cada um por um motivo:
 *
 * - as coloridas (Instagram, Google, WhatsApp…), porque inverter destruiria a
 *   cor da marca, que é metade do reconhecimento;
 * - `x` e `tiktok`, que já vêm como emblema fechado — fundo preto com o
 *   símbolo claro recortado. Sobre superfície escura o fundo se confunde e
 *   sobra o símbolo claro, que é justamente a versão oficial para tema escuro.
 *   Inverter transformaria os dois num disco branco, mais pesado do que todo o
 *   resto da linha.
 */
const MONOCROMATICAS = new Set<MarcaSocial>(["apple", "github", "threads"]);

/**
 * Nome como a marca se escreve. Serve de texto alternativo quando o logotipo
 * é a única informação na linha.
 */
export const NOME_DA_MARCA: Record<MarcaSocial, string> = {
  apple: "Apple",
  discord: "Discord",
  facebook: "Facebook",
  github: "GitHub",
  google: "Google",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  microsoft: "Microsoft",
  pinterest: "Pinterest",
  reddit: "Reddit",
  telegram: "Telegram",
  threads: "Threads",
  tiktok: "TikTok",
  twitch: "Twitch",
  whatsapp: "WhatsApp",
  x: "X",
  youtube: "YouTube",
};

export function LogoSocial({
  marca,
  tamanho = 20,
  rotulo,
  className,
}: {
  marca: MarcaSocial;
  tamanho?: number;
  /**
   * Texto alternativo. Deixe de fora quando o nome da marca já está escrito ao
   * lado: aí o logotipo é decorativo e repeti-lo só faz o leitor de tela dizer
   * "Instagram Instagram".
   */
  rotulo?: string;
  className?: string;
}) {
  const classes = ["logo-social"];
  if (MONOCROMATICAS.has(marca)) classes.push("logo-social--mono");
  if (className) classes.push(className);

  return (
    /*
     * SVG estático de 1 KB servido do próprio domínio. Passar pelo otimizador
     * do `next/image` só adicionaria uma volta no servidor para devolver o
     * mesmo arquivo, e vetor não tem o que otimizar por densidade de tela.
     */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/marca/social/${marca}.svg`}
      width={tamanho}
      height={tamanho}
      alt={rotulo ?? ""}
      {...(rotulo ? {} : { "aria-hidden": true })}
      className={classes.join(" ")}
      loading="lazy"
      decoding="async"
    />
  );
}
