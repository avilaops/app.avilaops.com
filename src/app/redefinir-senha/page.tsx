import ResetPasswordForm from "@/components/ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

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
          <h2>Definir nova senha</h2>
          <p>Escolha uma nova senha para continuar.</p>
        </div>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="form-error">
            Link inválido. Solicite uma nova redefinição na tela de login.
          </p>
        )}
      </section>
    </main>
  );
}
