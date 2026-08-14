export default function MetaClientSelect({
  organizations,
  selectedOrganizationId,
  action,
}: {
  organizations: { id: string; name: string; status: string }[];
  selectedOrganizationId: string;
  action: string;
}) {
  return (
    <form className="meta-client-picker meta-client-picker-wide" method="get" action={action}>
      <label>
        Cliente
        <select name="organizationId" defaultValue={selectedOrganizationId}>
          {organizations.map((organization) => (
            <option value={organization.id} key={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
      </label>
      <button className="secondary-button" type="submit">
        Carregar cliente
      </button>
    </form>
  );
}
