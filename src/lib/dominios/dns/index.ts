import {
  createDnsRecord,
  credencialConfigurada,
  deleteDnsRecord,
  listDnsRecords,
  updateDnsRecord,
  type EntradaDnsRecord,
} from "@/lib/cloudflare";
import type { EntradaProvedor } from "@/lib/dominios/capacidades";

/**
 * Contrato do provedor de DNS e o adaptador que a casa usa hoje.
 *
 * A central fala de "DNS", não do nome de quem hospeda a zona. Este arquivo é
 * a única fronteira onde o fornecedor aparece: a partir daqui para cima, tudo
 * é `zonaId` e `RegistroDns`.
 *
 * A leitura já existia e é usada pela sincronização; a escrita entra agora,
 * porque a tela de um domínio precisa criar, editar e apagar registro. Toda
 * escrita passa por rota autenticada, com confirmação humana e evento de
 * auditoria — o adaptador só executa.
 */

export type RegistroDns = {
  id: string;
  tipo: string;
  nome: string;
  conteudo: string;
  ttl: number;
  proxy: boolean;
  prioridade: number | null;
};

export type EntradaRegistroDns = {
  tipo: string;
  nome: string;
  conteudo: string;
  ttl?: number;
  proxy?: boolean;
  prioridade?: number;
};

export interface DnsProvider {
  readonly adaptador: string;
  configurado(): boolean;
  podeEditar(): boolean;
  verificar(): Promise<EntradaProvedor>;
  listar(zonaId: string): Promise<RegistroDns[]>;
  criar(zonaId: string, entrada: EntradaRegistroDns): Promise<RegistroDns>;
  atualizar(zonaId: string, registroId: string, entrada: EntradaRegistroDns): Promise<RegistroDns>;
  remover(zonaId: string, registroId: string): Promise<void>;
}

/** Tipos que a tela oferece. Fora desta lista, a rota recusa. */
export const TIPOS_DNS = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"] as const;
export type TipoDns = (typeof TIPOS_DNS)[number];

export function tipoDnsValido(valor: string): valor is TipoDns {
  return (TIPOS_DNS as readonly string[]).includes(valor.toUpperCase());
}

function paraEntradaExterna(entrada: EntradaRegistroDns): EntradaDnsRecord {
  return {
    type: entrada.tipo.toUpperCase(),
    name: entrada.nome,
    content: entrada.conteudo,
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
    conteudo: bruto.content,
    ttl: bruto.ttl,
    proxy: bruto.proxied,
    prioridade: bruto.priority ?? null,
  };
}

class ProvedorDnsCloudflare implements DnsProvider {
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

export function provedorDeDns(): DnsProvider {
  return new ProvedorDnsCloudflare();
}
