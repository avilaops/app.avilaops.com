/**
 * E-mail de recuperação: o endereço pessoal de quem usa a conta.
 *
 * A recuperação de senha manda um link para o e-mail da conta. Quando esse
 * e-mail é a caixa profissional que a casa hospeda, quem perde a senha fica
 * trancado: o link para voltar a entrar chega justamente na caixa que a
 * pessoa não consegue abrir. Em 02/09/2026 as três contas ativas estavam
 * assim, a do dono inclusive.
 *
 * O endereço secundário agora é opcional. Quando informado, precisa estar
 * fora dos domínios hospedados para evitar recuperação circular.
 */
import { prisma } from "@/lib/prisma";

export class EmailRecuperacaoInvalido extends Error {}

const FORMATO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Domínios da casa que nunca servem como recuperação, mesmo sem caixa ainda. */
const DOMINIOS_DA_CASA = ["avilaops.com", "avila.inc"];

function dominioDe(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

/**
 * Domínios cujo e-mail a casa entrega. Vem do banco do mail para não ficar
 * desatualizado: cada cliente novo traz um domínio, e uma lista escrita à mão
 * envelheceria em uma semana.
 *
 * Falha de leitura não libera o cadastro: os domínios fixos acima continuam
 * barrados e o chamador decide. Melhor recusar um endereço válido do que
 * aceitar um que trancaria a conta.
 */
export async function dominiosHospedados(): Promise<string[]> {
  const linhas = await prisma.$queryRaw<{ fqdn: string }[]>`
    select fqdn from operations.domains where status <> 'ARCHIVED'
  `;
  return [...new Set([...DOMINIOS_DA_CASA, ...linhas.map((l) => l.fqdn.toLowerCase())])];
}

/**
 * Valida e normaliza o e-mail de recuperação.
 *
 * Retorna null para campo omitido; endereços informados são validados.
 * Lança `EmailRecuperacaoInvalido` para endereços inválidos.
 */
export async function validarEmailRecuperacao(
  valor: unknown,
  emailDeLogin: string,
): Promise<string | null> {
  const email = typeof valor === "string" ? valor.trim().toLowerCase() : "";
  if (!email && (valor == null || typeof valor === "string")) return null;
  if (!FORMATO.test(email)) {
    throw new EmailRecuperacaoInvalido("E-mail de recuperação inválido.");
  }
  if (email === emailDeLogin.trim().toLowerCase()) {
    throw new EmailRecuperacaoInvalido(
      "O e-mail de recuperação precisa ser diferente do e-mail de acesso.",
    );
  }

  const dominio = dominioDe(email);
  const hospedados = await dominiosHospedados();
  if (hospedados.includes(dominio)) {
    throw new EmailRecuperacaoInvalido(
      `Use um e-mail pessoal, fora de ${dominio}. A recuperação precisa chegar numa caixa que não depende de nós.`,
    );
  }

  return email;
}
