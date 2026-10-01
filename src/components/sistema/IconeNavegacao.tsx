import Image from "next/image";
import { Icone, type NomeIcone } from "@/components/ui/Icones";

export const imagensNavegacao: Partial<Record<NomeIcone, string>> = {
  inicio: "inicio", clientes: "clientes", entregas: "entregas", mais: "mais",
  operacao: "operacao", casa: "casa", hub: "hub-social", infra: "infraestrutura",
  fiscal: "fiscal", financeiro: "financeiro", credito: "credito", config: "configuracoes",
  seo: "seo", dominios: "dominios", newsletter: "newsletter", estudio: "estudio",
};

/** Imagens só na navegação; controles e marcas de terceiros conservam seus desenhos. */
export default function IconeNavegacao({ nome, tamanho = 40 }: { nome: NomeIcone; tamanho?: number }) {
  const arquivo = imagensNavegacao[nome];
  return arquivo ? (
    <Image src={`/icones-3d/${arquivo}.png`} width={tamanho} height={tamanho}
      alt="" aria-hidden="true" className="icone-navegacao" unoptimized />
  ) : <Icone nome={nome} tamanho={tamanho > 24 ? 20 : tamanho} />;
}
