import { verifyUnsubscribeToken } from "@/lib/newsletter";

export const dynamic = "force-dynamic";

/**
 * Descadastro público, sem login.
 *
 * O GET apenas confirma. Filtro de spam e pré-visualização de cliente de
 * e-mail abrem links sozinhos — se o GET já removesse, gente que nunca clicou
 * sairia da lista. Quem descadastra de fato é o POST do botão.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; ok?: string }>;
}) {
  const { token, ok } = await searchParams;
  const email = verifyUnsubscribeToken(token);

  return (
    <main className="unsubscribe-page">
      <section className="unsubscribe-card">
        <span className="eyebrow">Ávila Ops · Newsletter</span>

        {!email ? (
          <>
            <h1>Link inválido.</h1>
            <p>
              Este link de descadastro não confere. Use o link mais recente que
              você recebeu por e-mail ou fale com a gente em{" "}
              <a href="mailto:contato@avilaops.com">contato@avilaops.com</a>.
            </p>
          </>
        ) : ok === "1" ? (
          <>
            <h1>Inscrição cancelada.</h1>
            <p>
              <strong>{email}</strong> não vai mais receber nossos e-mails.
            </p>
            <p className="unsubscribe-note">
              Se foi engano, responda a qualquer e-mail nosso que colocamos você de volta.
            </p>
          </>
        ) : (
          <>
            <h1>Cancelar inscrição?</h1>
            <p>
              Vamos parar de enviar e-mails para <strong>{email}</strong>.
            </p>
            <form method="post" action="/api/newsletter/descadastro">
              <input type="hidden" name="token" value={token ?? ""} />
              <button className="danger-button" type="submit">
                Confirmar descadastro
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
