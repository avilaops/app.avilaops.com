"use client";

import { useState } from "react";
import type { MappedLocation, BusinessTone } from "@/lib/google-mybusiness";
import type { Ga4OverviewMetrics } from "@/lib/google-analytics";

interface ClientProps {
  initialLocations: MappedLocation[];
  initialGa4: Ga4OverviewMetrics;
  stats: {
    totalLocations: number;
    totalReviews: number;
    pendingReviewsTotal: number;
    averageRating: number;
  };
}

export default function GoogleCommandCenterClient({
  initialLocations,
  initialGa4,
  stats,
}: ClientProps) {
  const [activeTab, setActiveTab] = useState<"locations" | "reviews" | "ga4" | "ecosystem">("locations");
  const [selectedLocation, setSelectedLocation] = useState<MappedLocation>(initialLocations[0]);
  const [testComment, setTestComment] = useState("Excelente atendimento e qualidade insuperável! Com certeza retornaremos.");
  const [testRating, setTestRating] = useState<number>(5);
  const [testReviewer, setTestReviewer] = useState("Rafael Mendes");
  const [generatedReply, setGeneratedReply] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateReply = async () => {
    setIsGenerating(true);
    setGeneratedReply(null);
    try {
      const res = await fetch("/api/google/my-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_reply",
          locationName: selectedLocation.name,
          reviewerName: testReviewer,
          rating: testRating,
          comment: testComment,
          tone: selectedLocation.tone,
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setGeneratedReply(data.reply);
      }
    } catch (err) {
      console.error("Erro ao gerar resposta:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const getToneBadgeStyle = (tone: BusinessTone) => {
    switch (tone) {
      case "ACOLHEDOR":
        return { bg: "#FEF3C7", color: "#92400E", label: "🍲 Acolhedor" };
      case "TECNOLOGICO":
        return { bg: "#DBEAFE", color: "#1E40AF", label: "🚀 Tecnológico" };
      case "FORMAL":
        return { bg: "#E0E7FF", color: "#3730A3", label: "👔 Formal / Técnico" };
      case "ELEGANTE":
        return { bg: "#FCE7F3", color: "#9D174D", label: "✨ Elegante" };
      case "DESCONTRAIDO":
        return { bg: "#FEE2E2", color: "#991B1B", label: "🍔 Descontraído" };
      case "MOTIVADOR":
        return { bg: "#D1FAE5", color: "#065F46", label: "💪 Motivador / Fit" };
      case "OBJETIVO":
      case "ATENCIOSO":
      default:
        return { bg: "#F3F4F6", color: "#374151", label: "💼 Atencioso" };
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", marginTop: "1.5rem" }}>
      {/* Resumo de Indicadores Chave */}
      <section className="report-hero">
        <div>
          <span>Locais Mapeados</span>
          <strong>{stats.totalLocations} empresas</strong>
          <small>Google Business Profile</small>
        </div>
        <dl>
          <div>
            <dt>Nota Média do Grupo</dt>
            <dd style={{ color: "#F59E0B" }}>★ {stats.averageRating}</dd>
          </div>
          <div>
            <dt>Avaliações Totais</dt>
            <dd>{stats.totalReviews.toLocaleString("pt-BR")}</dd>
          </div>
          <div>
            <dt>Avaliações Pendentes</dt>
            <dd style={{ color: stats.pendingReviewsTotal > 0 ? "#EF4444" : "#10B981" }}>
              {stats.pendingReviewsTotal} pendentes
            </dd>
          </div>
          <div>
            <dt>GA4 Ativos Agora</dt>
            <dd style={{ color: "#10B981" }}>🟢 {initialGa4.realtimeActiveUsers} online</dd>
          </div>
        </dl>
      </section>

      {/* Bar de Navegação de Abas */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border-color, #e5e7eb)", paddingBottom: "0.5rem" }}>
        <button
          onClick={() => setActiveTab("locations")}
          className={activeTab === "locations" ? "secondary-button" : "text-button"}
          style={{ fontWeight: activeTab === "locations" ? "bold" : "normal" }}
        >
          📍 As 10 Empresas ({initialLocations.length})
        </button>
        <button
          onClick={() => setActiveTab("reviews")}
          className={activeTab === "reviews" ? "secondary-button" : "text-button"}
          style={{ fontWeight: activeTab === "reviews" ? "bold" : "normal" }}
        >
          🤖 Respostas de Avaliações (IA)
        </button>
        <button
          onClick={() => setActiveTab("ga4")}
          className={activeTab === "ga4" ? "secondary-button" : "text-button"}
          style={{ fontWeight: activeTab === "ga4" ? "bold" : "normal" }}
        >
          📊 GA4 Analytics
        </button>
        <button
          onClick={() => setActiveTab("ecosystem")}
          className={activeTab === "ecosystem" ? "secondary-button" : "text-button"}
          style={{ fontWeight: activeTab === "ecosystem" ? "bold" : "normal" }}
        >
          🌐 Google Suite Full (Ads/Trends/Merchant)
        </button>
      </div>

      {/* ABA 1: Perfis dos Locais */}
      {activeTab === "locations" && (
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2>Frota de Perfis no Google Meu Negócio</h2>
            <span style={{ fontSize: "0.875rem", opacity: 0.8 }}>Sincronizado via Google Business Profile API</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.25rem" }}>
            {initialLocations.map((loc) => {
              const toneBadge = getToneBadgeStyle(loc.tone);
              return (
                <div
                  key={loc.id}
                  style={{
                    border: "1px solid var(--border-color, #e5e7eb)",
                    borderRadius: "0.75rem",
                    padding: "1.25rem",
                    backgroundColor: "var(--card-bg, #ffffff)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                      <strong style={{ fontSize: "1.1rem" }}>{loc.name}</strong>
                      <span
                        style={{
                          backgroundColor: toneBadge.bg,
                          color: toneBadge.color,
                          fontSize: "0.75rem",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "0.375rem",
                          fontWeight: 600,
                        }}
                      >
                        {toneBadge.label}
                      </span>
                    </div>

                    <p style={{ fontSize: "0.85rem", opacity: 0.75, margin: "0.25rem 0" }}>{loc.category} · {loc.segment}</p>
                    <p style={{ fontSize: "0.8rem", opacity: 0.6, marginBottom: "0.75rem" }}>📍 {loc.address}</p>
                  </div>

                  <div style={{ borderTop: "1px solid var(--border-color, #f3f4f6)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem" }}>
                      <div>
                        <span style={{ color: "#F59E0B", fontWeight: "bold" }}>★ {loc.rating.toFixed(1)}</span>
                        <span style={{ fontSize: "0.8rem", opacity: 0.7, marginLeft: "0.3rem" }}>({loc.reviewCount} avaliações)</span>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedLocation(loc);
                          setActiveTab("reviews");
                        }}
                        className="secondary-button"
                        style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                      >
                        Testar IA de Resposta
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ABA 2: Respostas com IA */}
      {activeTab === "reviews" && (
        <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <h2>Simulador de Resposta Automática por Tom de Voz</h2>
          <p style={{ opacity: 0.8 }}>
            Selecione uma das 10 empresas e teste como o robô de IA responde a avaliações ajustando automaticamente o tom de voz para aquela marca.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1.5rem",
              border: "1px solid var(--border-color, #e5e7eb)",
              borderRadius: "0.75rem",
              padding: "1.5rem",
              backgroundColor: "var(--card-bg, #ffffff)",
            }}
          >
            {/* Formulário de Teste */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <h3>1. Seleção & Dados da Avaliação</h3>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                  Empresa / Perfil do Google:
                </label>
                <select
                  value={selectedLocation.id}
                  onChange={(e) => {
                    const found = initialLocations.find((l) => l.id === e.target.value);
                    if (found) setSelectedLocation(found);
                  }}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #ccc" }}
                >
                  {initialLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.tone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                  Nome do Cliente:
                </label>
                <input
                  type="text"
                  value={testReviewer}
                  onChange={(e) => setTestReviewer(e.target.value)}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #ccc" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                  Nota em Estrelas:
                </label>
                <select
                  value={testRating}
                  onChange={(e) => setTestRating(Number(e.target.value))}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #ccc" }}
                >
                  <option value={5}>⭐⭐⭐⭐⭐ (5 Estrelas - Excelente)</option>
                  <option value={4}>⭐⭐⭐⭐ (4 Estrelas - Muito Bom)</option>
                  <option value={3}>⭐⭐⭐ (3 Estrelas - Regular / Crítica)</option>
                  <option value={2}>⭐⭐ (2 Estrelas - Insatisfeito)</option>
                  <option value={1}>⭐ (1 Estrela - Péssimo / Reclamação)</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                  Comentário do Cliente:
                </label>
                <textarea
                  rows={3}
                  value={testComment}
                  onChange={(e) => setTestComment(e.target.value)}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #ccc" }}
                />
              </div>

              <button
                onClick={handleGenerateReply}
                disabled={isGenerating}
                className="secondary-button"
                style={{ alignSelf: "flex-start", padding: "0.6rem 1.2rem", fontWeight: "bold" }}
              >
                {isGenerating ? "Gerando Resposta..." : "✨ Gerar Resposta Automática (IA)"}
              </button>
            </div>

            {/* Resultado Gerado */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", backgroundColor: "var(--nested-bg, #f9fafb)", padding: "1.25rem", borderRadius: "0.5rem" }}>
              <h3>2. Resposta Gerada pela IA</h3>

              <div style={{ fontSize: "0.85rem" }}>
                <strong>Tom de Voz Ativo:</strong>{" "}
                <span
                  style={{
                    backgroundColor: getToneBadgeStyle(selectedLocation.tone).bg,
                    color: getToneBadgeStyle(selectedLocation.tone).color,
                    padding: "0.2rem 0.5rem",
                    borderRadius: "0.25rem",
                    fontWeight: "bold",
                  }}
                >
                  {getToneBadgeStyle(selectedLocation.tone).label}
                </span>
              </div>

              {generatedReply ? (
                <div
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #10B981",
                    borderRadius: "0.5rem",
                    padding: "1rem",
                    fontSize: "0.95rem",
                    lineHeight: 1.5,
                    color: "#1F2937",
                  }}
                >
                  <p style={{ fontWeight: "bold", fontSize: "0.8rem", color: "#10B981", marginBottom: "0.5rem" }}>
                    ✓ Resposta Pronta para Envio ao Google Meu Negócio:
                  </p>
                  {generatedReply}
                </div>
              ) : (
                <div style={{ border: "2px dashed #D1D5DB", padding: "2rem", textAlign: "center", borderRadius: "0.5rem", opacity: 0.6 }}>
                  Clique no botão à esquerda para gerar a resposta instantânea ajustada ao tom de voz de <strong>{selectedLocation.name}</strong>.
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ABA 3: GA4 Analytics */}
      {activeTab === "ga4" && (
        <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>Métricas de Tráfego - Google Analytics 4 (GA4)</h2>
            <span style={{ fontSize: "0.85rem", color: "#10B981", fontWeight: "bold" }}>
              🟢 {initialGa4.realtimeActiveUsers} usuários navegando em tempo real
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
            <div style={{ border: "1px solid #e5e7eb", padding: "1rem", borderRadius: "0.5rem", backgroundColor: "#fff" }}>
              <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>Sessões (30d)</span>
              <strong style={{ display: "block", fontSize: "1.5rem", marginTop: "0.25rem" }}>
                {initialGa4.sessions30Days.toLocaleString("pt-BR")}
              </strong>
            </div>

            <div style={{ border: "1px solid #e5e7eb", padding: "1rem", borderRadius: "0.5rem", backgroundColor: "#fff" }}>
              <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>Usuários Totais (30d)</span>
              <strong style={{ display: "block", fontSize: "1.5rem", marginTop: "0.25rem" }}>
                {initialGa4.totalUsers30Days.toLocaleString("pt-BR")}
              </strong>
            </div>

            <div style={{ border: "1px solid #e5e7eb", padding: "1rem", borderRadius: "0.5rem", backgroundColor: "#fff" }}>
              <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>Visualizações de Página</span>
              <strong style={{ display: "block", fontSize: "1.5rem", marginTop: "0.25rem" }}>
                {initialGa4.pageViews30Days.toLocaleString("pt-BR")}
              </strong>
            </div>

            <div style={{ border: "1px solid #e5e7eb", padding: "1rem", borderRadius: "0.5rem", backgroundColor: "#fff" }}>
              <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>Taxa de Rejeição</span>
              <strong style={{ display: "block", fontSize: "1.5rem", marginTop: "0.25rem", color: "#2563EB" }}>
                {initialGa4.bounceRate}%
              </strong>
            </div>
          </div>

          <div style={{ border: "1px solid #e5e7eb", padding: "1.25rem", borderRadius: "0.75rem", backgroundColor: "#fff" }}>
            <h3>Origens de Tráfego por Canal</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
              {initialGa4.topChannels.map((ch) => (
                <div key={ch.channel} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                    <strong>{ch.channel}</strong>
                    <span>{ch.users.toLocaleString("pt-BR")} usuários ({ch.percentage}%)</span>
                  </div>
                  <div style={{ width: "100%", height: "8px", backgroundColor: "#F3F4F6", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${ch.percentage}%`, height: "100%", backgroundColor: "#3B82F6", borderRadius: "4px" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ABA 4: Ecossistema Completo */}
      {activeTab === "ecosystem" && (
        <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <h2>Mapa do Ecossistema Google & Próximas Fases</h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.25rem" }}>
            <div style={{ border: "1px solid #e5e7eb", padding: "1.25rem", borderRadius: "0.75rem", backgroundColor: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <strong>📍 Google My Business</strong>
                <span style={{ fontSize: "0.75rem", color: "#10B981", backgroundColor: "#D1FAE5", padding: "0.2rem 0.5rem", borderRadius: "0.25rem" }}>Ativo (Fase 1)</span>
              </div>
              <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Gestão das 10 empresas com inteligência de respostas automáticas por IA.</p>
            </div>

            <div style={{ border: "1px solid #e5e7eb", padding: "1.25rem", borderRadius: "0.75rem", backgroundColor: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <strong>📊 GA4 Analytics</strong>
                <span style={{ fontSize: "0.75rem", color: "#10B981", backgroundColor: "#D1FAE5", padding: "0.2rem 0.5rem", borderRadius: "0.25rem" }}>Ativo (Fase 1)</span>
              </div>
              <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Relatório de tráfego, usuários em tempo real e canais de aquisição.</p>
            </div>

            <div style={{ border: "1px solid #e5e7eb", padding: "1.25rem", borderRadius: "0.75rem", backgroundColor: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <strong>🎯 Google Ads</strong>
                <span style={{ fontSize: "0.75rem", color: "#2563EB", backgroundColor: "#DBEAFE", padding: "0.2rem 0.5rem", borderRadius: "0.25rem" }}>Fase 2 (Pronto)</span>
              </div>
              <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Integração com o livro caixa do <code>financeiro</code> para conciliação de custos por clique (CPC).</p>
            </div>

            <div style={{ border: "1px solid #e5e7eb", padding: "1.25rem", borderRadius: "0.75rem", backgroundColor: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <strong>📈 Google Trends</strong>
                <span style={{ fontSize: "0.75rem", color: "#2563EB", backgroundColor: "#DBEAFE", padding: "0.2rem 0.5rem", borderRadius: "0.25rem" }}>Fase 2 (Pronto)</span>
              </div>
              <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Radar de inteligência de palavras-chave e pesquisas emergentes por setor.</p>
            </div>

            <div style={{ border: "1px solid #e5e7eb", padding: "1.25rem", borderRadius: "0.75rem", backgroundColor: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <strong>🏷️ Google Tag Manager</strong>
                <span style={{ fontSize: "0.75rem", color: "#D97706", backgroundColor: "#FEF3C7", padding: "0.2rem 0.5rem", borderRadius: "0.25rem" }}>Fase 3 (Pronto)</span>
              </div>
              <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Gerenciamento automático de containers e injeção de pixels via Cloudflare.</p>
            </div>

            <div style={{ border: "1px solid #e5e7eb", padding: "1.25rem", borderRadius: "0.75rem", backgroundColor: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <strong>🛒 Google Merchant Center</strong>
                <span style={{ fontSize: "0.75rem", color: "#D97706", backgroundColor: "#FEF3C7", padding: "0.2rem 0.5rem", borderRadius: "0.25rem" }}>Fase 3 (Pronto)</span>
              </div>
              <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>Sincronização de catálogo de produtos integrado com a plataforma <code>lojas.avilaops.com</code>.</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
