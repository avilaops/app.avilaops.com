import type {
  CapacidadesRegistry,
  DiagnosticoRegistry,
  PedidoRegistro,
  RegistryProvider,
  ResultadoOperacao,
} from "@/lib/dominios/registry/tipos";

/**
 * Adaptador de registro por EPP.
 *
 * **Estado hoje: não configurado, e isso é a resposta honesta.** Operar
 * registro de `.br` por EPP exige ser provedor credenciado junto ao registro:
 * CNPJ, homologação e IPs fixos autorizados. Enquanto a casa não estiver
 * habilitada, este adaptador diz que não está e recusa qualquer escrita.
 *
 * Ele existe agora, e não depois, por dois motivos:
 *
 * 1. a tela precisa de uma fonte de verdade para acender a luz cinza de
 *    "não configurada" em vez de esconder a função ou, pior, fingir que
 *    funciona;
 * 2. quando a credencial chegar, o que muda é só este arquivo.
 *
 * O que **não** é aceitável colocar aqui, e por isso está escrito: inventar
 * endpoint, raspar página do registrador, automatizar navegador fingindo ser
 * API, ou devolver sucesso simulado. Uma resposta falsa de registro vira
 * cobrança que não existe e domínio que o cliente acha que tem.
 *
 * Quando as credenciais existirem, o cliente EPP mora no servidor e precisa
 * de: TLS com certificado de cliente, segredo só em variável de ambiente,
 * timeout, reconexão controlada, id de transação por comando, XML validado,
 * tratamento explícito dos códigos de retorno, log estruturado sem segredo e
 * separação entre homologação e produção. O contrato em `tipos.ts` já pede
 * `confirmadoPor` e `idempotencia` por causa disso.
 */

/** Variáveis que precisam existir para o adaptador se considerar configurado. */
const VARIAVEIS = ["EPP_HOST", "EPP_USUARIO", "EPP_SENHA", "EPP_CERTIFICADO"] as const;

function faltando(): string[] {
  return VARIAVEIS.filter((nome) => !process.env[nome]?.trim());
}

export function ambienteEpp(): "producao" | "homologacao" | null {
  const valor = process.env.EPP_AMBIENTE?.trim().toLowerCase();
  if (valor === "producao" || valor === "production") return "producao";
  if (valor === "homologacao" || valor === "homolog" || valor === "sandbox") return "homologacao";
  return null;
}

const NAO_HABILITADO: ResultadoOperacao = {
  ok: false,
  codigo: "REGISTRO_NAO_HABILITADO",
  mensagem:
    "A operação de registro ainda não está habilitada nesta conta. Nenhuma chamada foi feita e nada foi cobrado.",
};

export class ProvedorRegistroEpp implements RegistryProvider {
  readonly adaptador = "epp";

  configurado(): boolean {
    return faltando().length === 0;
  }

  capacidades(): CapacidadesRegistry {
    // Sem credencial não há operação liberada. Não existe meio-termo aqui:
    // oferecer o botão e falhar na hora do clique é pior do que não oferecer.
    const pronto = this.configurado();
    return { registrar: pronto, renovar: pronto, transferir: pronto };
  }

  async verificar(): Promise<DiagnosticoRegistry> {
    const ausentes = faltando();
    if (ausentes.length > 0) {
      return {
        adaptador: this.adaptador,
        configurado: false,
        operacional: false,
        ambiente: ambienteEpp(),
        verificadoEm: new Date().toISOString(),
        erro: null,
      };
    }

    // Configurado de verdade: a checagem de sessão entra aqui junto com o
    // cliente EPP. Até lá, não afirmamos que está operacional.
    return {
      adaptador: this.adaptador,
      configurado: true,
      operacional: false,
      ambiente: ambienteEpp(),
      verificadoEm: new Date().toISOString(),
      erro: "Credenciais presentes, mas o cliente de registro ainda não foi homologado.",
    };
  }

  // O pedido é recebido e descartado de propósito: enquanto não há
  // habilitação, nenhuma chamada sai daqui, e aceitar o argumento mantém o
  // contrato pronto para quando houver.
  async registrar(pedido: PedidoRegistro): Promise<ResultadoOperacao> {
    void pedido;
    return NAO_HABILITADO;
  }

  async renovar(pedido: Omit<PedidoRegistro, "nameservers">): Promise<ResultadoOperacao> {
    void pedido;
    return NAO_HABILITADO;
  }
}
