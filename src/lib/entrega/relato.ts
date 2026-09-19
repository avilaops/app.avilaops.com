/**
 * Transforma o resultado de uma publicação em uma frase para a tela.
 *
 * Existe como função pura, e única, porque três telas mostram o resultado do
 * mesmo botão (auditoria do domínio, painel OSB e o Digital Advisor). Enquanto
 * cada uma escrevia a própria mensagem, todas diziam "aplicado com sucesso"
 * sem olhar o que tinha acontecido — inclusive quando nada tinha sido
 * publicado. Aqui a frase sai do dado, e `ok` diz se o botão pode se dar por
 * satisfeito.
 */
import type { SituacaoDominio } from "./tipos";

export type Relato = {
  texto: string;
  /** true só quando tudo que precisava ir ao ar está no ar. */
  ok: boolean;
};

export function relatoDaEntrega(situacao: SituacaoDominio): Relato {
  const { fqdn } = situacao;

  if (situacao.erro) {
    return { texto: `${fqdn}: ${situacao.erro}`, ok: false };
  }

  if (situacao.foraDeAlcance === "sem-zona") {
    return {
      texto: `${fqdn} não está na conta Cloudflare da casa, então não há borda onde publicar. Os arquivos precisam ir pela hospedagem do site.`,
      ok: false,
    };
  }

  if (situacao.foraDeAlcance === "sem-proxy") {
    return {
      texto: `${fqdn} está na Cloudflare mas sem proxy (nuvem cinza): o tráfego não passa pela borda. Ligue o proxy no registro da raiz e publique de novo.`,
      ok: false,
    };
  }

  const semConfirmar = situacao.publicados.filter(
    (caminho) => !situacao.confirmados.includes(caminho),
  );

  if (!situacao.publicados.length) {
    return {
      texto: situacao.jaServidos.length
        ? `${fqdn} já servia ${listar(situacao.jaServidos)}; nada precisou ser publicado.`
        : `${fqdn}: nada foi publicado e nada foi conferido.`,
      ok: situacao.jaServidos.length > 0,
    };
  }

  const partes: string[] = [];
  if (situacao.confirmados.length) partes.push(`no ar: ${listar(situacao.confirmados)}`);
  if (semConfirmar.length) {
    partes.push(`publicado mas ainda sem resposta pela borda: ${listar(semConfirmar)}`);
  }
  if (situacao.jaServidos.length) partes.push(`já vinha do site: ${listar(situacao.jaServidos)}`);

  return { texto: `${fqdn} — ${partes.join(" · ")}.`, ok: semConfirmar.length === 0 };
}

function listar(caminhos: string[]): string {
  return caminhos.join(", ");
}
