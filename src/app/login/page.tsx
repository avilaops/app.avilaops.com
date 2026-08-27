import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { getAdmin } from "@/lib/auth";
import { urlLoginSSO } from "@/lib/sso";

/**
 * O login da equipe é o `auth.avilaops.com`: uma tela, um cookie válido em
 * todos os `*.avilaops.com`. Este endereço só redireciona para lá.
 *
 * O formulário local por CPF/senha fica apenas para ambiente sem SSO ligado
 * (dev sem `SSO_JWT_SECRET`), para não travar quem roda o app na máquina.
 */
export default async function LoginPage() {
  const admin = await getAdmin();
  if (admin) redirect("/operacao");

  if (process.env.SSO_JWT_SECRET) redirect(urlLoginSSO());

  return (
    <main className="login-page">
      <section className="login-intro">
        <h1>Ávila OS</h1>
        <p>
          Clientes, entregas, domínios e financeiro com responsável, prazo e
          evidência.
        </p>
        <div className="security-line">
          <span className="status-dot" />
          Área restrita a administradores
        </div>
      </section>
      <section className="login-panel">
        <div className="brand-lockup">
          <span className="brand-mark">A</span>
          <span>
            <strong>Ávila OS</strong>
            <small>app.avilaops.com</small>
          </span>
        </div>
        <div>
          <h2>Entre no painel</h2>
          <p>Em produção o login é feito em auth.avilaops.com.</p>
        </div>
        <LoginForm />
        <small className="login-footnote">A sessão expira em 8 horas.</small>
      </section>
    </main>
  );
}
