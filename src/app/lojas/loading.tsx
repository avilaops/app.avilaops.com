import EsqueletoTela from "@/components/sistema/Esqueleto";

/**
 * A área lê a plataforma de lojas por HTTP, com até 20 s de espera. Sem isto o
 * toque em "Lojas" deixava a tela anterior congelada até a resposta chegar —
 * e tela que não responde ao toque é o que separa um site de um app.
 */
export default function Carregando() {
  return <EsqueletoTela />;
}
