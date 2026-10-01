import Link from "next/link";

/**
 * As duas abas da configuração da casa. Cada uma é um endereço próprio — o
 * link de "Credenciais" pode ir para favorito sem depender de estado da tela.
 *
 * Credenciais fica em segundo lugar e sem destaque: é onde mora segredo, e o
 * que se abre no dia a dia é o cadastro.
 */
export default function AbasDaEmpresa({ ativa }: { ativa: "dados" | "credenciais" }) {
  const abas = [
    { chave: "dados", href: "/empresa", rotulo: "Dados da empresa" },
    { chave: "credenciais", href: "/empresa/credenciais", rotulo: "Credenciais" },
  ] as const;

  return (
    <nav aria-label="Configuração da empresa">
      <ul className="abas-hub abas-empresa">
        {abas.map((aba) => (
          <li key={aba.chave}>
            <Link
              href={aba.href}
              className="aba-hub"
              aria-current={aba.chave === ativa ? "page" : undefined}
            >
              {aba.rotulo}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
