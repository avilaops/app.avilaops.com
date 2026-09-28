import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CabecalhoTela from "@/components/sistema/CabecalhoTela";
import { contextoDaSecao } from "@/lib/navegacao";
import RegistrationRequestReview from "@/components/RegistrationRequestReview";
import { ehDono, getAdmin } from "@/lib/auth";
import { getPendingRegistrationRequests } from "@/lib/client-registration-requests";

function formatCpfCnpj(digits: string, tipo: string) {
  if (tipo === "CNPJ" && digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return digits;
}

export default async function RegistrationRequestsPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  // Dinheiro, segredo e acesso são do dono: a equipe opera o resto.
  if (!ehDono(admin.role)) redirect("/operacao");
  const requests = await getPendingRegistrationRequests();

  return (
    <AppShell adminName={admin.nome} papel={admin.role} section="client-requests">
      <CabecalhoTela
        titulo="Solicitações de cadastro"
        descricao="Revise a documentação enviada. Aprovar cria o acesso e envia a senha provisória por e-mail."
        {...contextoDaSecao("client-requests")}
      />

      <section className="operations-panel clients-panel">
        <div className="operations-panel-heading">
          <div>
            <h2>Pendentes de aprovação</h2>
          </div>
          <small>{requests.length} aguardando</small>
        </div>

        {requests.length === 0 ? (
          <div className="operations-empty clients-empty">
            <span className="empty-index">00</span>
            <strong>Nenhuma solicitação pendente.</strong>
            <p>Novos cadastros enviados pelo portal do cliente aparecem aqui.</p>
          </div>
        ) : (
          <div className="registration-requests-list">
            {requests.map((request, index) => (
              <article className="registration-request-row" key={request.id}>
                <span className="client-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="registration-request-identity">
                  <strong>{request.nome}</strong>
                  <small>{request.email}</small>
                  {request.telefone ? <small>{request.telefone}</small> : null}
                </div>
                <div className="registration-request-identity">
                  <strong>{formatCpfCnpj(request.cpfCnpj, request.tipoDocumento)}</strong>
                  <small>{request.tipoDocumento}</small>
                  {request.empresa ? <small>{request.empresa}</small> : null}
                </div>
                <div className="registration-request-documents">
                  {request.documentos.length === 0 ? (
                    <small>Sem documentos</small>
                  ) : (
                    request.documentos.map((doc) => (
                      <a
                        key={doc.key}
                        href={
                          doc.url ??
                          `/api/client-registration-requests/${request.id}/documents/${encodeURIComponent(doc.key)}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {doc.fileName}
                      </a>
                    ))
                  )}
                </div>
                <RegistrationRequestReview requestId={request.id} />
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
