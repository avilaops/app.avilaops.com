import Link from "next/link";

/**
 * A marca no topo: o quadrado com o ícone (ou a inicial) e o nome.
 *
 * Um componente só para os dois lugares que a desenham — a coluna do desktop
 * (`AppShell`) e a barra do celular (`MobileNav`). Eram duas cópias do mesmo
 * markup, e a prova de que isso não se sustenta é este pedido: trocar a letra
 * fixa por um ícone configurável exigiria lembrar de mexer nas duas.
 *
 * Sem ícone guardado, cai no `brand-mark` de sempre — que o CSS desenha com
 * `/marca/simbolo-64.png`, o símbolo padrão da casa. A letra no HTML é só a
 * reserva de quando a imagem não carrega.
 *
 * Sem hooks e sem estado, então serve igual dentro de um componente de servidor
 * e de um `"use client"`.
 */
export default function MarcaDaCasa({
  nome,
  inicial,
  iconeUrl,
  href,
}: {
  nome: string;
  inicial: string;
  iconeUrl: string | null;
  /** Para onde o toque leva. O dono vai para a configuração da empresa; a equipe, para a operação. */
  href: string;
}) {
  return (
    <Link href={href} className="brand-lockup" aria-label={nome}>
      {iconeUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconeUrl} alt="" className="brand-icone" width={32} height={32} />
      ) : (
        <span className="brand-mark" aria-hidden="true">
          {inicial}
        </span>
      )}
      <strong>{nome}</strong>
    </Link>
  );
}
