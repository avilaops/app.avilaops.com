/**
 * Esqueleto com a forma da tela que vai chegar: uma superfície com N linhas,
 * do mesmo tamanho das linhas reais. Sem roda girando no meio da página.
 */
export function EsqueletoLista({ linhas = 4, titulo = true }: { linhas?: number; titulo?: boolean }) {
  return (
    <section className="grupo" aria-hidden="true">
      {titulo ? <span className="esqueleto" style={{ width: 120, height: 12 }} /> : null}
      <div className="grupo-superficie">
        {Array.from({ length: linhas }).map((_, i) => (
          <div className="esqueleto-linha" key={i}>
            <span className="esqueleto" style={{ width: 32, height: 32, borderRadius: 10 }} />
            <span className="esqueleto" style={{ width: `${60 + ((i * 13) % 30)}%`, height: 14 }} />
            <span className="esqueleto" style={{ width: 48, height: 14, justifySelf: "end" }} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Carregando de página inteira: cabeçalho + duas listas. */
export default function EsqueletoTela() {
  return (
    <div className="pilha" role="status" aria-label="Carregando">
      <span className="esqueleto" style={{ width: 220, height: 30, borderRadius: 12 }} />
      <EsqueletoLista linhas={3} />
      <EsqueletoLista linhas={5} />
    </div>
  );
}
