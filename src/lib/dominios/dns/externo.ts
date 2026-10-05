import {
  createDnsRecord,
  credencialConfigurada,
  deleteDnsRecord,
  listDnsRecords,
  updateDnsRecord,
  type EntradaDnsRecord,
} from "@/lib/cloudflare";
import type { EntradaProvedor } from "@/lib/dominios/capacidades";
import { deTextoPuro, paraTextoPuro } from "@/lib/dominios/dns/conteudo";
import type { DnsProvider, EntradaRegistroDns, RegistroDns } from "@/lib/dominios/dns/tipos";

/**
 * O serviço de DNS de fora, que hoje serve a maior parte da carteira.
 *
 * Continua existindo durante a migração para o DNS da casa: os dois
 * implementam o mesmo contrato, então um domínio muda de lado trocando
 * `domains.dns_provider`, sem tela nem rota saberem.
 *
 * Toda escrita passa por rota autenticada, com confirmação humana e evento de
 * auditoria. O adaptador só executa.
 */

function paraEntradaExterna(entrada: EntradaRegistroDns): EntradaDnsRecord {
  return {
    type: entrada.tipo.toUpperCase(),
    name: entrada.nome,
    // A API fala texto puro; por dentro o conteúdo é canônico (conteudo.ts).
    content: paraTextoPuro(entrada.tipo, entrada.conteudo),
    ttl: entrada.ttl ?? 1,
    proxied: entrada.proxy ?? false,
    ...(entrada.prioridade !== undefined ? { priority: entrada.prioridade } : {}),
  };
}

function paraRegistro(bruto: {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority?: number;
}): RegistroDns {
  return {
    id: bruto.id,
    tipo: bruto.type,
    nome: bruto.name,
    conteudo: deTextoPuro(bruto.type, bruto.content),
    ttl: bruto.ttl,
    proxy: bruto.proxied,
    prioridade: bruto.priority ?? null,
  };
}

export class ProvedorDnsExterno implements DnsProvider {
  readonly adaptador = "cloudflare";

  configurado(): boolean {
    return credencialConfigurada();
  }

  podeEditar(): boolean {
    return this.configurado();
  }

  async verificar(): Promise<EntradaProvedor> {
    const verificadoEm = new Date().toISOString();
    if (!this.configurado()) {
      return {
        adaptador: this.adaptador,
        configurado: false,
        operacional: false,
        ambiente: null,
        verificadoEm,
        erro: null,
      };
    }

    // Sem chamada de rede aqui de propósito: a luz do DNS é derivada do que a
    // sincronização já gravou. Fazer uma chamada por carregamento de tela
    // gastaria cota da API para repetir o que o banco já sabe.
    return {
      adaptador: this.adaptador,
      configurado: true,
      operacional: true,
      ambiente: "producao",
      verificadoEm,
      erro: null,
    };
  }

  async listar(zonaId: string): Promise<RegistroDns[]> {
    const registros = await listDnsRecords(zonaId);
    return registros.map(paraRegistro);
  }

  async criar(zonaId: string, entrada: EntradaRegistroDns): Promise<RegistroDns> {
    return paraRegistro(await createDnsRecord(zonaId, paraEntradaExterna(entrada)));
  }

  async atualizar(zonaId: string, registroId: string, entrada: EntradaRegistroDns): Promise<RegistroDns> {
    return paraRegistro(await updateDnsRecord(zonaId, registroId, paraEntradaExterna(entrada)));
  }

  async remover(zonaId: string, registroId: string): Promise<void> {
    await deleteDnsRecord(zonaId, registroId);
  }
}
