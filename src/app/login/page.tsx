import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { getAdmin } from "@/lib/auth";

export default async function LoginPage() {
  const admin = await getAdmin();
  if (admin) redirect("/operacao");

  return (
    <main className="login-page">
      <section className="login-intro">
        <span className="eyebrow">Ávila Ops · Operação interna</span>
        <h1>A operação inteira, sem zona cega.</h1>
        <p>
          Organize clientes, entregas, oportunidades, domínios e financeiro em
          uma visão central com responsáveis, prazos e evidências.
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
          <span className="eyebrow">Acesso seguro</span>
          <h2>Entre no painel</h2>
          <p>Use o mesmo acesso administrativo já autorizado no portal.</p>
        </div>
        <LoginForm />
        <small className="login-footnote">
          A sessão é independente do portal do cliente e expira em 8 horas.
        </small>
      </section>
    </main>
  );
}
