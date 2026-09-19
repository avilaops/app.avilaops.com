import { ProvedorAvilaDns } from "@/lib/dominios/dns/avila";
import { ProvedorDnsExterno } from "@/lib/dominios/dns/externo";
import { lerServicoDeDns, type DnsProvider, type ServicoDeDns } from "@/lib/dominios/dns/tipos";

export * from "@/lib/dominios/dns/tipos";
export { ProvedorAvilaDns } from "@/lib/dominios/dns/avila";
export { ProvedorDnsExterno } from "@/lib/dominios/dns/externo";

/**
 * Qual serviço de DNS responde por cada domínio.
 *
 * A resolução é **por domínio**, não global, e essa é a peça que permite
 * migrar a carteira aos poucos. Com uma fábrica global, passar para o DNS da
 * casa seria um interruptor só: o primeiro erro atingiria todos os clientes
 * ao mesmo tempo. Domínio a domínio, um erro atinge um domínio, e dá para
 * voltar trocando uma coluna.
 */
export function provedorDeDnsDoDominio(dominio: { dnsProvider: string | null | undefined }): DnsProvider | null {
  const servico = lerServicoDeDns(dominio.dnsProvider);
  if (servico === "AVILA") return new ProvedorAvilaDns();
  if (servico === "EXTERNO") return new ProvedorDnsExterno();
  return null;
}

export function provedorDoServico(servico: ServicoDeDns): DnsProvider | null {
  if (servico === "AVILA") return new ProvedorAvilaDns();
  if (servico === "EXTERNO") return new ProvedorDnsExterno();
  return null;
}

/** Rótulo do serviço para a tela. Sem nome de fornecedor. */
export function rotuloDoServico(servico: ServicoDeDns): string {
  if (servico === "AVILA") return "DNS da Ávila Ops";
  if (servico === "EXTERNO") return "serviço externo";
  return "sem DNS gerenciado";
}
