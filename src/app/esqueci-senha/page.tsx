import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
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
          <span className="eyebrow">Recuperar acesso</span>
          <h2>Esqueci minha senha</h2>
          <p>Informe o e-mail administrativo já cadastrado.</p>
        </div>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
