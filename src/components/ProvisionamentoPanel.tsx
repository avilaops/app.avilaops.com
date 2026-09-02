"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Cartao, chamar, Pill, rotuloStatus, type Resultado } from "@/components/provisionamento/comum";
import { Icone } from "@/components/ui/Icones";
import Segmented from "@/components/ui/Segmented";
import Sheet from "@/components/ui/Sheet";

export type DominioDaFicha = {
  id: string;
  fqdn: string;
  status: string;
  cloudflareStatus: string | null;
  cloudflareZoneId: string | null;
};

export type IntegracaoDaFicha = {
  provider: string;
  publicId: string | null;
  accountName: string | null;
  url: string | null;
  status: string;
  notes: string | null;
};

type Props = {
  organizationId: string;
  nome: string;
  slug: string;
  contato: { nome: string; email: string | null; telefone: string | null } | null;
  acessoExiste: boolean;
  dominios: DominioDaFicha[];
  integracoes: IntegracaoDaFicha[];
};

/**
 * Provisionamento pela ficha: acesso, domínio, e-mail, Google e loja. Cada
 * botão chama uma rota do app que fala com um workflow do n8n e grava o
 * resultado — o operador não precisa de SSH, de Cloudflare nem de script.
 */
export default function ProvisionamentoPanel({
  organizationId,
  nome,
  slug,
  contato,
  acessoExiste,
  dominios,
  integracoes,
}: Props) {
  const router = useRouter();
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [folha, setFolha] = useState<
    "dominio" | "caixa" | "google" | "loja" | "restaurante" | null
  >(null);
  const [resultados, setResultados] = useState<Record<string, Resultado | null>>({});
  const fecharFolha = useCallback(() => setFolha(null), []);

  useEffect(() => {
    if (!aviso) return;
    const timer = window.setTimeout(() => setAviso(""), 3200);
    return () => window.clearTimeout(timer);
  }, [aviso]);

  const base = `/api/organizations/${organizationId}`;
  const dominiosAtivos = dominios.filter((d) => d.status !== "ARCHIVED");
  const caixas = integracoes.filter((i) => i.provider.startsWith("mailbox:"));
  const mailDominios = integracoes.filter((i) => i.provider.startsWith("mail_domain:"));
  const google = {
    ga4: integracoes.find((i) => i.provider === "google_analytics_4") ?? null,
    gtm: integracoes.find((i) => i.provider === "google_tag_manager") ?? null,
    sc: integracoes.find((i) => i.provider === "google_search_console") ?? null,
    onboarding: integracoes.find((i) => i.provider === "google_onboarding") ?? null,
  };
  const loja = integracoes.find((i) => i.provider === "lojas_avilaops") ?? null;
  const restaurante = integracoes.find((i) => i.provider === "comandeiro") ?? null;

  function registrar(chave: string, resultado: Resultado | null) {
    setResultados((atual) => ({ ...atual, [chave]: resultado }));
  }

  async function executar(chave: string, acao: () => Promise<Resultado>, mensagem?: string) {
    setOcupado(chave);
    registrar(chave, null);
    try {
      const resultado = await acao();
      registrar(chave, resultado);
      if (mensagem) setAviso(mensagem);
      setFolha(null);
      router.refresh();
    } catch (erro) {
      registrar(chave, { tipo: "erro", conteudo: erro instanceof Error ? erro.message : "Falhou." });
    } finally {
      setOcupado(null);
    }
  }

  /* ---------- Acesso ---------- */
  async function acesso(acao: "criar" | "reenviar") {
    await executar(
      "acesso",
      async () => {
        const r = await chamar<{ email: string; emailEnviado: boolean; senhaProvisoria: string | null; aviso: string | null; tarefa: string | null }>(
          `${base}/acesso`,
          { acao },
        );
        return {
          tipo: "ok",
          conteudo: (
            <>
              <strong>{acao === "criar" ? "Acesso criado" : "Senha nova gerada"} para {r.email}.</strong>
              <span>{r.emailEnviado ? "E-mail com a senha provisória enviado." : r.aviso ?? "E-mail não enviado."}</span>
              {r.senhaProvisoria ? (
                <span>
                  Senha provisória (aparece uma vez): <span className="prov-secret">{r.senhaProvisoria}</span>
                </span>
              ) : null}
            </>
          ),
        };
      },
      acao === "criar" ? "Acesso criado." : "Acesso reenviado.",
    );
  }

  /* ---------- Domínio ---------- */
  const [formDominio, setFormDominio] = useState({ dominio: "", site: "hetzner" as "hetzner" | "nenhum" });
  async function enviarDominio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    await executar(
      "dominio",
      async () => {
        const r = await chamar<{
          dominio: string;
          zoneStatus: string;
          nameServers: string[];
          zonaCriada: boolean;
          registrosCriados: { type: string; name: string; ok: boolean; erro: string | null }[];
          registrosExistentes: unknown[];
          mailVerificado: boolean;
        }>(`${base}/dominio`, formDominio);
        const falhas = r.registrosCriados.filter((x) => !x.ok);
        return {
          tipo: "ok",
          conteudo: (
            <>
              <strong>{r.dominio} pronto na Cloudflare ({rotuloStatus[r.zoneStatus] ?? r.zoneStatus}).</strong>
              <span>
                {r.registrosCriados.length - falhas.length} registro(s) criado(s), {r.registrosExistentes.length} já existiam.
                {r.mailVerificado ? " E-mail verificado." : " E-mail aguardando o DNS propagar."}
              </span>
              {r.zoneStatus !== "active" && r.nameServers.length ? (
                <span>
                  Aponte o domínio no registrador para:
                  <ul>
                    {r.nameServers.map((ns) => (
                      <li key={ns}>
                        <code>{ns}</code>
                      </li>
                    ))}
                  </ul>
                </span>
              ) : null}
              {falhas.length ? (
                <span>
                  Não criados:
                  <ul>
                    {falhas.map((f) => (
                      <li key={`${f.type}-${f.name}`}>
                        {f.type} {f.name} — {f.erro}
                      </li>
                    ))}
                  </ul>
                </span>
              ) : null}
            </>
          ),
        };
      },
      "Domínio configurado.",
    );
  }

  async function arquivarDominio(fqdn: string, acao: "arquivar" | "reativar") {
    if (acao === "arquivar" && !window.confirm(`Arquivar ${fqdn}? Ele sai das auditorias e da renovação; nada é apagado.`)) return;
    await executar(
      "dominio",
      async () => {
        const r = await chamar<{ fqdn: string; status: string }>(`${base}/dominio`, { fqdn, acao }, "PATCH");
        return { tipo: "ok", conteudo: <strong>{r.fqdn} {r.status === "ARCHIVED" ? "arquivado" : "reativado"}.</strong> };
      },
      acao === "arquivar" ? "Domínio arquivado." : "Domínio reativado.",
    );
  }

  /* ---------- Caixa ---------- */
  const [formCaixa, setFormCaixa] = useState({ dominio: dominiosAtivos[0]?.fqdn ?? "", usuario: "contato", nome: "", senha: "" });
  async function enviarCaixa(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    await executar(
      "caixa",
      async () => {
        const r = await chamar<{ address: string; webmail: string; senha: string | null; avisadoEm: string | null; quotaGb: number | null }>(
          `${base}/caixa`,
          formCaixa,
        );
        return {
          tipo: "ok",
          conteudo: (
            <>
              <strong>Caixa {r.address} criada{r.quotaGb ? ` (${r.quotaGb} GB)` : ""}.</strong>
              {r.senha ? (
                <span>
                  Senha inicial (aparece uma vez): <span className="prov-secret">{r.senha}</span>
                </span>
              ) : null}
              <span>
                {r.avisadoEm ? `Aviso enviado para ${r.avisadoEm}. ` : ""}Webmail: <code>{r.webmail}</code>
              </span>
            </>
          ),
        };
      },
      "Caixa criada.",
    );
  }

  /* ---------- Google ---------- */
  const [formGoogle, setFormGoogle] = useState({
    dominio: dominios[0]?.fqdn ?? "",
    donoEmail: "",
    pixelId: "",
    indexar: "sim" as "sim" | "nao",
    myBusiness: "nao" as "sim" | "nao",
  });
  async function enviarGoogle(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    await executar(
      "google",
      async () => {
        const r = await chamar<{ dominio: string }>(`${base}/google`, formGoogle);
        return {
          tipo: "ok",
          conteudo: (
            <>
              <strong>Onboarding do Google iniciado para {r.dominio}.</strong>
              <span>Leva de 1 a 3 minutos: GA4, GTM, Search Console, sitemap e indexação. Toque em “Atualizar” para ver o resultado.</span>
            </>
          ),
        };
      },
      "Google em andamento.",
    );
  }

  /* ---------- Loja ---------- */
  const [formLoja, setFormLoja] = useState({
    slug,
    nome,
    plano: "LOJA" as "SITE" | "LOJA" | "LOJA_PRO",
    dominioPrincipal: dominios[0]?.fqdn ?? "",
  });
  async function enviarLoja(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    await executar(
      "loja",
      async () => {
        const r = await chamar<{ slug: string; url: string | null; situacao: string | null }>(`${base}/loja`, formLoja);
        return {
          tipo: "ok",
          conteudo: (
            <>
              <strong>Loja {r.slug} criada{r.situacao ? ` (${r.situacao})` : ""}.</strong>
              {r.url ? (
                <span>
                  Endereço: <code>{r.url}</code>
                </span>
              ) : null}
            </>
          ),
        };
      },
      "Loja criada.",
    );
  }

  /* ---------- Restaurante (Comandeiro) ---------- */
  const [formRestaurante, setFormRestaurante] = useState({
    slug,
    nome,
    plano: "essencial" as "essencial" | "profissional" | "premium",
    donoNome: contato?.nome ?? "",
    donoEmail: contato?.email ?? "",
    cidade: "",
    uf: "",
  });

  /*
    O resultado traz segredo, e é a única ação do painel em que isso acontece
    fora do "criar acesso": a senha da empresa e as três senhas de setor
    existem em claro só neste instante. Ficam na tela até o operador fechar,
    não vão para o banco nem para a auditoria — o mesmo trato da senha
    provisória do acesso.
  */
  async function enviarRestaurante(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    await executar(
      "restaurante",
      async () => {
        const r = await chamar<{
          slug: string;
          url: string | null;
          entrada: string | null;
          situacao: string | null;
          criado: boolean;
          senhaEmpresa: string | null;
          acessos: { usuario: string; papel: string; senha: string }[];
          aviso: string | null;
        }>(`${base}/restaurante`, formRestaurante);

        if (!r.criado) {
          return {
            tipo: "ok",
            conteudo: (
              <>
                <strong>Restaurante {r.slug} já existia — nada foi criado.</strong>
                <span>{r.aviso ?? "O vínculo com a ficha foi atualizado."}</span>
              </>
            ),
          } as Resultado;
        }

        return {
          tipo: "ok",
          conteudo: (
            <>
              <strong>
                Restaurante {r.slug} criado{r.situacao ? ` (${r.situacao})` : ""}.
              </strong>
              {r.url ? (
                <span>
                  Endereço: <code>{r.url}</code>
                </span>
              ) : null}
              {r.entrada ? (
                <span>
                  Entrada da equipe: <code>{r.entrada}</code>
                </span>
              ) : null}
              {r.senhaEmpresa ? (
                <span>
                  Senha da empresa (aparece uma vez):{" "}
                  <span className="prov-secret">{r.senhaEmpresa}</span>
                </span>
              ) : null}
              {r.acessos?.length ? (
                <span>
                  Senhas de setor (aparecem uma vez):{" "}
                  {r.acessos.map((a) => (
                    <span key={a.usuario}>
                      {a.papel} <span className="prov-secret">{a.senha}</span>{" "}
                    </span>
                  ))}
                </span>
              ) : null}
            </>
          ),
        } as Resultado;
      },
      "Restaurante criado.",
    );
  }

  const rodape = (form: string, texto: string, chave: string) => (
    <>
      <button type="submit" form={form} className="primary-button" disabled={ocupado === chave}>
        {ocupado === chave ? "Enviando…" : texto}
      </button>
      <button type="button" className="secondary-button" onClick={fecharFolha} disabled={ocupado === chave}>
        Cancelar
      </button>
    </>
  );

  return (
    <section className="prov-section" aria-labelledby="prov-titulo">
      <div className="plan-section-head">
        <h3 id="prov-titulo">Provisionamento</h3>
        <button type="button" className="text-link plan-add" onClick={() => router.refresh()}>
          Atualizar
        </button>
      </div>

      <div className="prov-grid">
        <Cartao
          titulo="Acesso ao painel"
          resultado={resultados.acesso ?? null}
          acoes={
            <>
              {!acessoExiste ? (
                <button type="button" className="primary-button" disabled={ocupado === "acesso" || !contato?.email} onClick={() => acesso("criar")}>
                  {ocupado === "acesso" ? "Criando…" : "Criar acesso"}
                </button>
              ) : null}
              <button type="button" className="secondary-button" disabled={ocupado === "acesso" || !contato?.email} onClick={() => acesso("reenviar")}>
                {ocupado === "acesso" ? "Enviando…" : "Reenviar acesso"}
              </button>
            </>
          }
        >
          <div className="ios-list">
            <div className="ios-row ios-row-static">
              <div className="prov-row-main">
                <strong>{contato?.email ?? "Sem e-mail no contato principal"}</strong>
                <small>{contato?.nome ?? "Cadastre o contato principal na aba Dados cadastrais"}</small>
              </div>
              <Pill status={acessoExiste ? "ACTIVE" : contato?.email ? "PENDING" : null} />
            </div>
          </div>
        </Cartao>

        <Cartao
          titulo="Domínios"
          resultado={resultados.dominio ?? null}
          acoes={
            <button type="button" className="primary-button" onClick={() => setFolha("dominio")}>
              <Icone nome="adicionar" tamanho={18} />
              Adicionar domínio
            </button>
          }
        >
          <div className="ios-list">
            {dominios.length === 0 ? (
              <p className="prov-empty">Nenhum domínio ainda.</p>
            ) : (
              dominios.map((d) => {
                const mail = mailDominios.find((m) => m.publicId === d.fqdn);
                const arquivado = d.status === "ARCHIVED";
                return (
                  <div className="ios-row ios-row-static" key={d.id}>
                    <div className="prov-row-main">
                      <strong>{d.fqdn}</strong>
                      <small>{arquivado ? "Arquivado — fora das auditorias e da renovação" : mail ? (mail.status === "ACTIVE" ? "E-mail verificado" : mail.notes ?? "E-mail pendente") : "Sem e-mail configurado"}</small>
                    </div>
                    <Pill status={arquivado ? "ARCHIVED" : d.cloudflareStatus} />
                    <button type="button" className={arquivado ? "text-button" : "text-button prov-perigo"} disabled={ocupado === "dominio"} onClick={() => arquivarDominio(d.fqdn, arquivado ? "reativar" : "arquivar")}>
                      {arquivado ? "Reativar" : "Arquivar"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </Cartao>

        <Cartao
          titulo="E-mail profissional"
          resultado={resultados.caixa ?? null}
          acoes={
            <button type="button" className="primary-button" disabled={dominios.length === 0} onClick={() => setFolha("caixa")}>
              <Icone nome="adicionar" tamanho={18} />
              Criar caixa
            </button>
          }
        >
          <div className="ios-list">
            {caixas.length === 0 ? (
              <p className="prov-empty">{dominios.length === 0 ? "Adicione um domínio primeiro." : "Nenhuma caixa ainda."}</p>
            ) : (
              caixas.map((c) => (
                <div className="ios-row ios-row-static" key={c.provider}>
                  <div className="prov-row-main">
                    <strong>{c.publicId}</strong>
                    <small>{[c.accountName, c.notes].filter(Boolean).join(" · ") || "Caixa ativa"}</small>
                  </div>
                  <Pill status={c.status} />
                </div>
              ))
            )}
          </div>
        </Cartao>

        <Cartao
          titulo="Google"
          descricao="GA4, Tag Manager, Search Console, sitemap e indexação."
          resultado={resultados.google ?? null}
          acoes={
            <button type="button" className="primary-button" onClick={() => setFolha("google")}>
              {google.onboarding ? "Rodar de novo" : "Configurar Google"}
            </button>
          }
        >
          <div className="ios-list">
            {[
              ["GA4", google.ga4?.publicId ?? null, google.ga4?.status ?? null],
              ["Tag Manager", google.gtm?.publicId ?? null, google.gtm?.status ?? null],
              ["Search Console", google.sc?.publicId ?? null, google.sc?.status ?? null],
            ].map(([rotulo, valor, status]) => (
              <div className="ios-row ios-row-static" key={rotulo as string}>
                <div className="prov-row-main">
                  <strong>{rotulo}</strong>
                  <small>{(valor as string | null) ?? "Não configurado"}</small>
                </div>
                <Pill status={status as string | null} />
              </div>
            ))}
            {google.onboarding ? (
              <div className="ios-row ios-row-static">
                <div className="prov-row-main">
                  <strong>Onboarding</strong>
                  <small>{google.onboarding.notes ?? "—"}</small>
                </div>
                <Pill status={google.onboarding.status} />
              </div>
            ) : null}
          </div>
        </Cartao>

        <Cartao
          titulo="Loja virtual"
          descricao="Loja na plataforma lojas.avilaops.com, com DNS e e-mail provisionados."
          resultado={resultados.loja ?? null}
          acoes={
            loja ? (
              <a className="secondary-button" href={loja.url ?? "https://lojas.avilaops.com"} target="_blank" rel="noreferrer">
                Abrir loja
              </a>
            ) : (
              <button type="button" className="primary-button" onClick={() => setFolha("loja")}>
                <Icone nome="adicionar" tamanho={18} />
                Criar loja
              </button>
            )
          }
        >
          <div className="ios-list">
            {loja ? (
              <div className="ios-row ios-row-static">
                <div className="prov-row-main">
                  <strong>{loja.publicId}</strong>
                  <small>{loja.url ?? loja.notes ?? "Loja vinculada"}</small>
                </div>
                <Pill status={loja.status} />
              </div>
            ) : (
              <p className="prov-empty">Nenhuma loja vinculada.</p>
            )}
          </div>
        </Cartao>

        <Cartao
          titulo="Restaurante (Comandeiro)"
          descricao="Estabelecimento no Comandeiro: cardápio, mesas, comanda e cozinha, com as senhas de estreia."
          resultado={resultados.restaurante ?? null}
          acoes={
            restaurante ? (
              <a
                className="secondary-button"
                href={restaurante.url ?? "https://app.comandeiro.com.br/acesso"}
                target="_blank"
                rel="noreferrer"
              >
                Abrir restaurante
              </a>
            ) : (
              <button type="button" className="primary-button" onClick={() => setFolha("restaurante")}>
                <Icone nome="adicionar" tamanho={18} />
                Criar restaurante
              </button>
            )
          }
        >
          <div className="ios-list">
            {restaurante ? (
              <div className="ios-row ios-row-static">
                <div className="prov-row-main">
                  <strong>{restaurante.publicId}</strong>
                  <small>{restaurante.url ?? restaurante.notes ?? "Restaurante vinculado"}</small>
                </div>
                <Pill status={restaurante.status} />
              </div>
            ) : (
              <p className="prov-empty">Nenhum restaurante vinculado.</p>
            )}
          </div>
        </Cartao>
      </div>

      {folha === "dominio" ? (
        <Sheet titulo="Adicionar domínio" aoFechar={fecharFolha} rodape={rodape("form-dominio", "Configurar domínio", "dominio")}>
          <form id="form-dominio" className="form-stack" onSubmit={enviarDominio}>
            <p className="field-help">
              O domínio precisa estar registrado no nome do cliente: .com.br e .br no Registro.br, genéricos na Cloudflare Registrar. Se a zona não existir na Cloudflare, ela é criada e você recebe os nameservers para apontar.
            </p>
            <label className="field">
              <span>Domínio</span>
              <input
                value={formDominio.dominio}
                onChange={(e) => setFormDominio((f) => ({ ...f, dominio: e.target.value }))}
                placeholder="cliente.com.br"
                autoCapitalize="none"
                autoComplete="off"
                inputMode="url"
                required
                autoFocus
              />
            </label>
            <div className="field">
              <span>Site</span>
              <Segmented
                opcoes={[
                  ["hetzner", "Hospedado na Ávila"],
                  ["nenhum", "Só DNS e e-mail"],
                ]}
                valor={formDominio.site}
                aoMudar={(v) => setFormDominio((f) => ({ ...f, site: v }))}
                rotulo="Onde fica o site"
              />
              <small className="field-help">Hospedado na Ávila publica A/CNAME apontando para o servidor.</small>
            </div>
            {resultados.dominio?.tipo === "erro" ? (
              <p className="inline-feedback feedback-error" role="alert">{resultados.dominio.conteudo}</p>
            ) : null}
          </form>
        </Sheet>
      ) : null}

      {folha === "caixa" ? (
        <Sheet titulo="Criar caixa de e-mail" aoFechar={fecharFolha} rodape={rodape("form-caixa", "Criar caixa", "caixa")}>
          <form id="form-caixa" className="form-stack" onSubmit={enviarCaixa}>
            <label className="field field-select">
              <span>Domínio</span>
              <select value={formCaixa.dominio} onChange={(e) => setFormCaixa((f) => ({ ...f, dominio: e.target.value }))}>
                {dominios.map((d) => (
                  <option key={d.id} value={d.fqdn}>
                    {d.fqdn}
                  </option>
                ))}
              </select>
              <Icone nome="chevron" tamanho={16} className="chevron" />
            </label>
            <label className="field">
              <span>Usuário</span>
              <span className="input-prefix input-sufixo">
                <input
                  value={formCaixa.usuario}
                  onChange={(e) => setFormCaixa((f) => ({ ...f, usuario: e.target.value }))}
                  placeholder="contato"
                  autoCapitalize="none"
                  autoComplete="off"
                  required
                  autoFocus
                />
                <i aria-hidden="true">@{formCaixa.dominio || "…"}</i>
              </span>
            </label>
            <label className="field">
              <span>Nome de exibição</span>
              <input value={formCaixa.nome} onChange={(e) => setFormCaixa((f) => ({ ...f, nome: e.target.value }))} placeholder={nome} />
            </label>
            <label className="field">
              <span>Senha inicial (opcional)</span>
              <input
                value={formCaixa.senha}
                onChange={(e) => setFormCaixa((f) => ({ ...f, senha: e.target.value }))}
                placeholder="Em branco: geramos uma e mostramos uma vez"
                autoComplete="new-password"
                className="mono"
              />
              <small className="field-help">A caixa nasce com troca de senha obrigatória no primeiro acesso.</small>
            </label>
            {resultados.caixa?.tipo === "erro" ? (
              <p className="inline-feedback feedback-error" role="alert">{resultados.caixa.conteudo}</p>
            ) : null}
          </form>
        </Sheet>
      ) : null}

      {folha === "google" ? (
        <Sheet titulo="Configurar Google" aoFechar={fecharFolha} rodape={rodape("form-google", "Iniciar", "google")}>
          <form id="form-google" className="form-stack" onSubmit={enviarGoogle}>
            <p className="field-help">
              Cria (ou reaproveita) a propriedade GA4 e o container GTM, verifica o domínio no Search Console pela conta da Ávila, envia o sitemap e pede indexação. Roda em segundo plano.
            </p>
            <label className="field">
              <span>Domínio do site</span>
              <input
                value={formGoogle.dominio}
                onChange={(e) => setFormGoogle((f) => ({ ...f, dominio: e.target.value }))}
                placeholder="cliente.com.br"
                autoCapitalize="none"
                autoComplete="off"
                inputMode="url"
                required
                list="prov-dominios"
              />
              <datalist id="prov-dominios">
                {dominios.map((d) => (
                  <option key={d.id} value={d.fqdn} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Conta Google do dono (recebe acesso)</span>
              <input
                type="email"
                value={formGoogle.donoEmail}
                onChange={(e) => setFormGoogle((f) => ({ ...f, donoEmail: e.target.value }))}
                placeholder="Em branco: só a Ávila Ops"
                autoCapitalize="none"
              />
            </label>
            <label className="field">
              <span>Meta Pixel ID (opcional)</span>
              <input value={formGoogle.pixelId} onChange={(e) => setFormGoogle((f) => ({ ...f, pixelId: e.target.value }))} inputMode="numeric" placeholder="Só números" className="mono" />
            </label>
            <div className="field">
              <span>Pedir indexação</span>
              <Segmented
                opcoes={[
                  ["sim", "Sim"],
                  ["nao", "Não"],
                ]}
                valor={formGoogle.indexar}
                aoMudar={(v) => setFormGoogle((f) => ({ ...f, indexar: v }))}
                rotulo="Pedir indexação ao Google"
              />
            </div>
            <div className="field">
              <span>Perfil da Empresa no Google</span>
              <Segmented
                opcoes={[
                  ["nao", "Não precisa"],
                  ["sim", "Abrir tarefa"],
                ]}
                valor={formGoogle.myBusiness}
                aoMudar={(v) => setFormGoogle((f) => ({ ...f, myBusiness: v }))}
                rotulo="Perfil da Empresa"
              />
              <small className="field-help">A criação do perfil é manual; “Abrir tarefa” registra no Todoist.</small>
            </div>
            {resultados.google?.tipo === "erro" ? (
              <p className="inline-feedback feedback-error" role="alert">{resultados.google.conteudo}</p>
            ) : null}
          </form>
        </Sheet>
      ) : null}

      {folha === "loja" ? (
        <Sheet titulo="Criar loja" aoFechar={fecharFolha} rodape={rodape("form-loja", "Criar loja", "loja")}>
          <form id="form-loja" className="form-stack" onSubmit={enviarLoja}>
            <label className="field">
              <span>Nome da loja</span>
              <input value={formLoja.nome} onChange={(e) => setFormLoja((f) => ({ ...f, nome: e.target.value }))} required autoFocus />
            </label>
            <label className="field">
              <span>Slug</span>
              <input
                value={formLoja.slug}
                onChange={(e) => setFormLoja((f) => ({ ...f, slug: e.target.value }))}
                autoCapitalize="none"
                autoComplete="off"
                className="mono"
                required
              />
              <small className="field-help">Vira {formLoja.slug || "slug"}.lojas.avilaops.com até o domínio próprio apontar.</small>
            </label>
            <div className="field">
              <span>Plano</span>
              <Segmented
                opcoes={[
                  ["SITE", "Site"],
                  ["LOJA", "Loja"],
                  ["LOJA_PRO", "Loja Pro"],
                ]}
                valor={formLoja.plano}
                aoMudar={(v) => setFormLoja((f) => ({ ...f, plano: v }))}
                rotulo="Plano da loja"
              />
            </div>
            <label className="field field-select">
              <span>Domínio próprio (opcional)</span>
              <select value={formLoja.dominioPrincipal} onChange={(e) => setFormLoja((f) => ({ ...f, dominioPrincipal: e.target.value }))}>
                <option value="">Só o subdomínio da plataforma</option>
                {dominios.map((d) => (
                  <option key={d.id} value={d.fqdn}>
                    {d.fqdn}
                  </option>
                ))}
              </select>
              <Icone nome="chevron" tamanho={16} className="chevron" />
            </label>
            {resultados.loja?.tipo === "erro" ? (
              <p className="inline-feedback feedback-error" role="alert">{resultados.loja.conteudo}</p>
            ) : null}
          </form>
        </Sheet>
      ) : null}

      {folha === "restaurante" ? (
        <Sheet
          titulo="Criar restaurante"
          aoFechar={fecharFolha}
          rodape={rodape("form-restaurante", "Criar restaurante", "restaurante")}
        >
          <form id="form-restaurante" className="form-stack" onSubmit={enviarRestaurante}>
            <p className="field-help">
              O CNPJ da ficha vira a identidade da casa — é ele que a equipe digita para entrar.
              As senhas da empresa e dos setores aparecem uma única vez, aqui, quando a casa nascer.
            </p>
            <label className="field">
              <span>Nome do restaurante</span>
              <input
                value={formRestaurante.nome}
                onChange={(e) => setFormRestaurante((f) => ({ ...f, nome: e.target.value }))}
                required
                autoFocus
              />
            </label>
            <label className="field">
              <span>Slug</span>
              <input
                value={formRestaurante.slug}
                onChange={(e) => setFormRestaurante((f) => ({ ...f, slug: e.target.value }))}
                autoCapitalize="none"
                autoComplete="off"
                className="mono"
                required
              />
              <small className="field-help">
                Vira {formRestaurante.slug || "slug"}.comandeiro.com.br.
              </small>
            </label>
            <div className="field">
              <span>Plano</span>
              <Segmented
                opcoes={[
                  ["essencial", "Essencial"],
                  ["profissional", "Profissional"],
                  ["premium", "Premium"],
                ]}
                valor={formRestaurante.plano}
                aoMudar={(v) =>
                  setFormRestaurante((f) => ({
                    ...f,
                    plano: v as "essencial" | "profissional" | "premium",
                  }))
                }
                rotulo="Plano do restaurante"
              />
            </div>
            <label className="field">
              <span>Responsável</span>
              <input
                value={formRestaurante.donoNome}
                onChange={(e) => setFormRestaurante((f) => ({ ...f, donoNome: e.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>E-mail do responsável</span>
              <input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoComplete="off"
                value={formRestaurante.donoEmail}
                onChange={(e) => setFormRestaurante((f) => ({ ...f, donoEmail: e.target.value }))}
                required
              />
              <small className="field-help">É para onde vai a recuperação da senha da empresa.</small>
            </label>
            <label className="field">
              <span>Cidade</span>
              <input
                value={formRestaurante.cidade}
                onChange={(e) => setFormRestaurante((f) => ({ ...f, cidade: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>UF</span>
              <input
                maxLength={2}
                className="mono"
                value={formRestaurante.uf}
                onChange={(e) =>
                  setFormRestaurante((f) => ({ ...f, uf: e.target.value.toUpperCase() }))
                }
              />
            </label>
            {resultados.restaurante?.tipo === "erro" ? (
              <p className="inline-feedback feedback-error" role="alert">
                {resultados.restaurante.conteudo}
              </p>
            ) : null}
          </form>
        </Sheet>
      ) : null}

      {aviso ? (
        <div className="toast" role="status">
          {aviso}
        </div>
      ) : null}
    </section>
  );
}
