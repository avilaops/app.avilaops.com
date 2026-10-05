import { daApresentacao } from "@/lib/dominios/dns/conteudo";
import type { EntradaProvedor } from "@/lib/dominios/capacidades";
import {
  achatar,
  comPontoFinal,
  idDoRegistro,
  lerIdDoRegistro,
  montarConteudo,
  mudancaParaCriar,
  mudancasParaAlterar,
  mudancasParaRemover,
  separarPrioridade,
  type Mudanca,
  type RRset,
} from "@/lib/dominios/dns/rrset";
import type { DnsProvider, EntradaRegistroDns, RegistroDns } from "@/lib/dominios/dns/tipos";

/**
 * Avila DNS: o DNS autoritativo da casa.
 *
 * O motor é um servidor autoritativo maduro (PowerDNS), falado pela API HTTP
 * dele. **Escrever um servidor DNS não é o produto**; o produto é o plano de
 * controle: o cadastro, a API, o painel, a auditoria e a operação. É a mesma
 * relação que já existe com o Postgres.
 *
 * Este adaptador implementa o mesmo contrato do serviço externo, então migrar
 * um domínio é trocar uma coluna, não reescrever tela.
 *
 * **Estado:** ligado só quando `AVILA_DNS_API_URL` e `AVILA_DNS_API_KEY`
 * existirem. Sem isso ele se declara não configurado e recusa leitura e
 * escrita, em vez de devolver zona vazia — zona vazia parece um domínio sem
 * registros, e alguém recriaria à mão o que já existe.
 *
 * O que ainda falta fora daqui, e não dá para fingir em código: os dois
 * servidores autoritativos em redes independentes, DNSSEC e o monitoramento
 * externo dos dois. Enquanto não existirem, nenhum domínio deve ter
 * `dns_provider = AVILA`.
 */

const TEMPO_LIMITE_MS = 10_000;

function base(): string | null {
  const url = process.env.AVILA_DNS_API_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

function chave(): string | null {
  return process.env.AVILA_DNS_API_KEY?.trim() || null;
}

function servidor(): string {
  return process.env.AVILA_DNS_SERVER_ID?.trim() || "localhost";
}

type RespostaZona = { rrsets?: RRset[] };

export class ProvedorAvilaDns implements DnsProvider {
  readonly adaptador = "avila-dns";

  configurado(): boolean {
    return Boolean(base() && chave());
  }

  podeEditar(): boolean {
    return this.configurado();
  }

  private async chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
    const raiz = base();
    const segredo = chave();
    if (!raiz || !segredo) throw new Error("O DNS da casa ainda não está configurado.");

    const controlador = new AbortController();
    const relogio = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS);
    try {
      const resposta = await fetch(`${raiz}/api/v1/servers/${servidor()}${caminho}`, {
        ...init,
        signal: controlador.signal,
        cache: "no-store",
        headers: {
          "X-API-Key": segredo,
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
        },
      });

      if (resposta.status === 204) return undefined as T;
      if (!resposta.ok) {
        // O corpo de erro pode trazer o endereço interno do servidor. Só o
        // código sobe; o resto fica no log de quem chamou.
        throw new Error(`O serviço de DNS respondeu ${resposta.status}.`);
      }
      const texto = await resposta.text();
      return (texto ? JSON.parse(texto) : undefined) as T;
    } finally {
      clearTimeout(relogio);
    }
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

    try {
      await this.chamar("/zones?zone=__verificacao__.invalid.");
      return {
        adaptador: this.adaptador,
        configurado: true,
        operacional: true,
        ambiente: "producao",
        verificadoEm,
        erro: null,
      };
    } catch (e) {
      return {
        adaptador: this.adaptador,
        configurado: true,
        operacional: false,
        ambiente: "producao",
        verificadoEm,
        erro: e instanceof Error ? e.message : "O serviço de DNS não respondeu.",
      };
    }
  }

  private async zona(zonaId: string): Promise<RRset[]> {
    const dados = await this.chamar<RespostaZona>(`/zones/${encodeURIComponent(comPontoFinal(zonaId))}`);
    return dados?.rrsets ?? [];
  }

  private async aplicar(zonaId: string, mudancas: Mudanca[]): Promise<void> {
    if (mudancas.length === 0) return;
    await this.chamar(`/zones/${encodeURIComponent(comPontoFinal(zonaId))}`, {
      method: "PATCH",
      body: JSON.stringify({ rrsets: mudancas }),
    });
  }

  async listar(zonaId: string): Promise<RegistroDns[]> {
    return achatar(await this.zona(zonaId));
  }

  async criar(zonaId: string, entrada: EntradaRegistroDns): Promise<RegistroDns> {
    const rrsets = await this.zona(zonaId);
    await this.aplicar(zonaId, [mudancaParaCriar(rrsets, entrada)]);
    return this.montarResposta(entrada);
  }

  async atualizar(zonaId: string, registroId: string, entrada: EntradaRegistroDns): Promise<RegistroDns> {
    const alvo = lerIdDoRegistro(registroId);
    if (!alvo) throw new Error("Registro não identificado.");

    const rrsets = await this.zona(zonaId);
    await this.aplicar(zonaId, mudancasParaAlterar(rrsets, alvo, entrada));
    return this.montarResposta(entrada);
  }

  async remover(zonaId: string, registroId: string): Promise<void> {
    const alvo = lerIdDoRegistro(registroId);
    if (!alvo) throw new Error("Registro não identificado.");

    const rrsets = await this.zona(zonaId);
    await this.aplicar(zonaId, mudancasParaRemover(rrsets, alvo));
  }

  private montarResposta(entrada: EntradaRegistroDns): RegistroDns {
    const tipo = entrada.tipo.toUpperCase();
    const conteudoCru = montarConteudo(entrada);
    const separado = separarPrioridade(tipo, conteudoCru);
    const conteudo = daApresentacao(tipo, separado.conteudo);
    const prioridade = separado.prioridade;
    return {
      id: idDoRegistro(entrada.nome, tipo, conteudoCru),
      tipo,
      nome: entrada.nome,
      conteudo,
      ttl: entrada.ttl ?? 3600,
      proxy: false,
      prioridade,
    };
  }
}
