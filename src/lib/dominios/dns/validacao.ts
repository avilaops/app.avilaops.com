import { isIPv4, isIPv6 } from "node:net";
import type { EntradaRegistroDns, RegistroDns } from "@/lib/dominios/dns/tipos";

/**
 * O que barra um registro de DNS antes de ele sair para o servidor.
 *
 * Desde que o cliente edita a própria zona pelo portal, o erro deixou de ser
 * só da equipe, que sabe o que é um CNAME. As regras aqui são as que derrubam
 * site ou e-mail sem aviso nenhum do servidor: um segundo SPF invalida os dois
 * (RFC 7208 §3.2), CNAME dividindo nome com outro registro é proibido
 * (RFC 1034 §3.6.2) e MX apontando para IP não entrega (RFC 5321 §5.1).
 *
 * Função pura: entra a zona como está e o que se quer gravar, sai a lista de
 * problemas. Nada aqui lê banco ou rede, e é isso que deixa cada regra com
 * teste próprio (`tests/unit/dns-validacao.test.ts`).
 */

export type ProblemaDns = { campo: "tipo" | "nome" | "conteudo" | "ttl" | "prioridade"; mensagem: string };

export type ContextoValidacao = {
  /** O domínio dono da zona, sem ponto final. */
  zona: string;
  /** Os registros da zona agora, lidos do servidor. */
  existentes: RegistroDns[];
  /** Na alteração, o registro que está sendo trocado: ele não conta como vizinho. */
  substituindoId?: string | null;
  /**
   * CNAME no próprio domínio é proibido pela RFC, mas o serviço externo achata
   * o CNAME do apex em A/AAAA na resposta (é como vários clientes apontam o
   * domínio para plataforma de site). No DNS da casa não há achatamento, então
   * lá o apex recusa CNAME.
   */
  permiteCnameNoApex: boolean;
};

const TTL_AUTOMATICO = 1;
const TTL_MINIMO = 60;
const TTL_MAXIMO = 86_400;

/**
 * Nome completo do registro, sem ponto final e em minúsculas.
 *
 * "@" e vazio são o próprio domínio; um nome que não termina na zona é
 * relativo a ela ("www" vira "www.empresa.com.br"), que é como o servidor
 * interpreta.
 */
export function nomeCompleto(nome: string, zona: string): string {
  const limpo = nome.trim().toLowerCase().replace(/\.$/, "");
  const raiz = zona.trim().toLowerCase().replace(/\.$/, "");
  if (!limpo || limpo === "@") return raiz;
  if (limpo === raiz || limpo.endsWith(`.${raiz}`)) return limpo;
  return `${limpo}.${raiz}`;
}

const ROTULO = /^(?!-)[a-z0-9_-]{1,63}(?<!-)$/i;

function ehNomeDeHost(valor: string): boolean {
  const limpo = valor.trim().replace(/\.$/, "");
  if (!limpo || limpo.length > 253) return false;
  if (isIPv4(limpo) || isIPv6(limpo)) return false;
  return limpo.split(".").every((rotulo) => ROTULO.test(rotulo));
}

function ehSpf(conteudo: string): boolean {
  return /^"?v=spf1(\s|"|$)/i.test(conteudo.trim());
}

export function validarRegistroDns(entrada: EntradaRegistroDns, contexto: ContextoValidacao): ProblemaDns[] {
  const problemas: ProblemaDns[] = [];
  const tipo = entrada.tipo.toUpperCase();
  const conteudo = entrada.conteudo.trim();
  const nome = nomeCompleto(entrada.nome, contexto.zona);
  const raiz = nomeCompleto("@", contexto.zona);
  const noApex = nome === raiz;

  const vizinhos = contexto.existentes.filter(
    (registro) =>
      registro.id !== contexto.substituindoId && nomeCompleto(registro.nome, contexto.zona) === nome,
  );

  if (nome.split(".").some((rotulo) => !ROTULO.test(rotulo) && rotulo !== "*")) {
    problemas.push({ campo: "nome", mensagem: "O nome tem caractere que o DNS não aceita." });
  }

  const ttl = entrada.ttl ?? TTL_AUTOMATICO;
  if (ttl !== TTL_AUTOMATICO && (ttl < TTL_MINIMO || ttl > TTL_MAXIMO)) {
    problemas.push({
      campo: "ttl",
      mensagem: `TTL fora do intervalo: use 1 (automático) ou entre ${TTL_MINIMO} e ${TTL_MAXIMO} segundos.`,
    });
  }

  if (tipo === "A" && !isIPv4(conteudo)) {
    problemas.push({ campo: "conteudo", mensagem: "Registro A recebe um endereço IPv4, como 203.0.113.10." });
  }

  if (tipo === "AAAA" && !isIPv6(conteudo)) {
    problemas.push({ campo: "conteudo", mensagem: "Registro AAAA recebe um endereço IPv6, como 2001:db8::1." });
  }

  if (tipo === "CNAME") {
    if (!ehNomeDeHost(conteudo)) {
      problemas.push({
        campo: "conteudo",
        mensagem: "CNAME aponta para um nome, não para um IP. Para IP, use um registro A.",
      });
    }
    if (noApex && !contexto.permiteCnameNoApex) {
      problemas.push({
        campo: "nome",
        mensagem: "O próprio domínio não pode ser CNAME: ele precisa de SOA e NS. Use um registro A.",
      });
    }
    if (vizinhos.length > 0) {
      problemas.push({
        campo: "nome",
        mensagem: `Já existe ${vizinhos[0].tipo} em ${nome}. Um CNAME não divide o nome com nenhum outro registro.`,
      });
    }
  } else if (vizinhos.some((registro) => registro.tipo.toUpperCase() === "CNAME")) {
    problemas.push({
      campo: "nome",
      mensagem: `${nome} já é um CNAME. Apague o CNAME antes de criar outro registro nesse nome.`,
    });
  }

  if (tipo === "MX") {
    if (!ehNomeDeHost(conteudo)) {
      problemas.push({
        campo: "conteudo",
        mensagem: "MX aponta para o nome do servidor de e-mail, nunca para um IP.",
      });
    }
    if (entrada.prioridade === undefined || entrada.prioridade < 0 || entrada.prioridade > 65_535) {
      problemas.push({ campo: "prioridade", mensagem: "MX precisa de prioridade entre 0 e 65535." });
    }
  }

  if (tipo === "SRV" && (entrada.prioridade === undefined || entrada.prioridade < 0 || entrada.prioridade > 65_535)) {
    problemas.push({ campo: "prioridade", mensagem: "SRV precisa de prioridade entre 0 e 65535." });
  }

  if (tipo === "TXT" && ehSpf(conteudo)) {
    const outroSpf = vizinhos.find((registro) => registro.tipo.toUpperCase() === "TXT" && ehSpf(registro.conteudo));
    if (outroSpf) {
      problemas.push({
        campo: "conteudo",
        mensagem:
          "Já existe um SPF neste nome. Dois SPF invalidam os dois e o e-mail passa a cair no spam: junte os dois num só.",
      });
    }
  }

  if (tipo === "NS" && noApex) {
    problemas.push({
      campo: "nome",
      mensagem: "Os servidores DNS do próprio domínio são definidos no registro do domínio, não na zona.",
    });
  }

  return problemas;
}
