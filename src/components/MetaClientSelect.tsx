import { ChevronDown } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Label } from "@/components/shadcn/label";
import { nomeProprio } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Seletor de cliente das quatro rotas da Meta. Continua sendo um formulário
 * GET com <select name="organizationId">: as páginas leem o cliente pela
 * query string, então o contrato é o do navegador, não estado de React.
 *
 * O <select> é nativo de propósito: o Select do shadcn (Radix) não emite
 * <input name> no FormData, e um GET sem o campo perderia o filtro.
 */

const classesSelect = cn(
  // mesmas classes do Input do shadcn, adaptadas a um <select>
  "h-12 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent py-1 pl-3 pr-10 text-base shadow-xs transition-[color,box-shadow] outline-none",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  "dark:bg-input/30 min-[821px]:h-10 min-[821px]:text-sm",
);

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
    <form
      method="get"
      action={action}
      className="flex w-full flex-col gap-2 min-[560px]:flex-row min-[560px]:items-end"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2 min-[560px]:max-w-[420px]">
        <Label htmlFor="meta-organization-id">Cliente</Label>
        <div className="relative">
          <select
            id="meta-organization-id"
            name="organizationId"
            defaultValue={selectedOrganizationId}
            className={classesSelect}
          >
            {organizations.map((organization) => (
              <option value={organization.id} key={organization.id}>
                {nomeProprio(organization.name)}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            size={16}
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </div>

      <Button
        type="submit"
        variant="outline"
        className="h-12 w-full shrink-0 text-[15px] min-[560px]:w-auto min-[821px]:h-10 min-[821px]:text-sm"
      >
        Carregar cliente
      </Button>
    </form>
  );
}
