/**
 * O código que roda na borda do Cloudflare servindo os arquivos da entrega.
 *
 * Isto é a única parte do sistema que fica na frente do site de cliente, então
 * o desenho inteiro é para errar pouco e errar para o lado seguro:
 *
 * 1. **Rota por caminho, não por domínio.** A publicação cria rotas exatas
 *    (`cliente.com/robots.txt`), nunca `cliente.com/*`. O Worker só é
 *    acionado nesses endereços — não há como ele atrapalhar o resto do site,
 *    mesmo se tiver um defeito.
 * 2. **Qualquer imprevisto cai para o origin.** Hostname que não está no mapa,
 *    caminho que não está no mapa, exceção de qualquer natureza: `fetch(request)`
 *    e o site responde como sempre respondeu.
 * 3. **Só o que falta é publicado.** Quem decide é `publicar.ts`, a partir da
 *    auditoria: arquivo que o site já serve não ganha rota, então a borda
 *    nunca sombreia conteúdo que o cliente escreveu.
 *
 * O mapa é embutido no código em vez de vir de KV porque o conteúdo é de
 * poucos KB por domínio e muda quando alguém publica, não a cada requisição:
 * uma ida a mais ao KV em toda visita seria custo sem retorno.
 */
import type { ArquivoEntrega } from "./conteudo";

export type MapaEntrega = Record<string, ArquivoEntrega[]>;

/** Nome do script na conta. Um só para todos os domínios. */
export const NOME_WORKER = "avila-entrega";

/**
 * Monta o código do Worker com o mapa embutido.
 *
 * `JSON.stringify` do mapa é o que impede injeção: o conteúdo dos arquivos
 * entra como dado, nunca concatenado no meio do código.
 */
export function fonteDoWorker(mapa: MapaEntrega): string {
  const porHost: Record<string, Record<string, { tipo: string; corpo: string }>> = {};
  for (const [host, arquivos] of Object.entries(mapa)) {
    const doHost: Record<string, { tipo: string; corpo: string }> = {};
    for (const arquivo of arquivos) {
      doHost[arquivo.caminho] = { tipo: arquivo.tipo, corpo: arquivo.corpo };
    }
    porHost[host.toLowerCase()] = doHost;
  }

  return `// Gerado pela Ávila Ops — não editar no painel da Cloudflare.
// A fonte é src/lib/entrega/worker-fonte.ts; publicar de novo sobrescreve.
const ARQUIVOS = ${JSON.stringify(porHost, null, 2)};

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const doHost = ARQUIVOS[url.hostname.toLowerCase()];
      const arquivo = doHost && doHost[url.pathname];
      if (!arquivo) return fetch(request);
      return new Response(arquivo.corpo, {
        status: 200,
        headers: {
          "content-type": arquivo.tipo,
          "cache-control": "public, max-age=300",
          "x-avila-entrega": "1",
        },
      });
    } catch (erro) {
      // Nunca derrubar o site do cliente por causa desta camada.
      return fetch(request);
    }
  },
};
`;
}

/** As rotas exatas que um domínio precisa para os arquivos que vão ser servidos. */
export function rotasDoDominio(fqdn: string, arquivos: ArquivoEntrega[]): string[] {
  return arquivos.map((arquivo) => `${fqdn.toLowerCase()}${arquivo.caminho}`);
}
