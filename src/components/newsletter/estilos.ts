/**
 * Medidas da casa (docs/auditoria-mobile-ios.md §1.6) aplicadas aos
 * primitivos do shadcn: campo de 48px e fonte de 16px abaixo de 821px (senão
 * o Safari dá zoom), botão primário de 50px em largura total no celular.
 */

export const CAMPO = "h-12 text-[16px] md:text-[16px] min-[821px]:h-9 min-[821px]:text-sm";

export const AREA_TEXTO = "text-[16px] md:text-[16px] min-[821px]:text-sm";

export const BOTAO_CELULAR = "min-h-[50px] w-full text-[15px] min-[821px]:min-h-9 min-[821px]:w-auto min-[821px]:text-sm";

export const ROTULO = "text-[15px] min-[821px]:text-sm";

export const AJUDA = "text-[13px] leading-5 text-muted-foreground";

export const CHIP =
  "inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[14px] font-medium whitespace-nowrap transition-transform duration-[60ms] active:scale-[0.985] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export const CHIP_ATIVO = "bg-primary text-primary-foreground";

export const CHIP_INATIVO = "bg-muted text-foreground hover:bg-accent";
