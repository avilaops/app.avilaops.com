import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
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
          <h2>Esqueci minha senha</h2>
          <p>Informe o e-mail administrativo já cadastrado.</p>
        </div>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
