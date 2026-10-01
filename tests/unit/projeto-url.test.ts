import { describe, expect, it } from "vitest";
import { urlDeProjetoValida } from "@/lib/projects";

/**
 * O link do projeto vira `href` na tela. A regra existe para impedir que um
 * esquema executável chegue lá — por isso ela é testada pelo que precisa
 * recusar, não só pelo que aceita.
 */
describe("urlDeProjetoValida", () => {
  it("aceita http e https", () => {
    expect(urlDeProjetoValida("https://clinicahorizonte.com.br")).toBe(true);
    expect(urlDeProjetoValida("http://192.168.0.10:3000/board")).toBe(true);
    expect(urlDeProjetoValida("https://github.com/avilaops/app?tab=readme#topo")).toBe(true);
  });

  it("vazio é válido: o campo é opcional", () => {
    expect(urlDeProjetoValida("")).toBe(true);
  });

  it("recusa esquema que executa ou lê arquivo", () => {
    expect(urlDeProjetoValida("javascript:alert(1)")).toBe(false);
    expect(urlDeProjetoValida("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(urlDeProjetoValida("file:///etc/passwd")).toBe(false);
    expect(urlDeProjetoValida("vbscript:msgbox(1)")).toBe(false);
  });

  it("recusa maiúsculas e espaço à frente, que enganam quem valida na mão", () => {
    // `new URL` normaliza o esquema para minúsculo, então JavaScript: também
    // cai — o que garante que não dá para escapar pelo caixa alta.
    expect(urlDeProjetoValida("JavaScript:alert(1)")).toBe(false);
    expect(urlDeProjetoValida(" javascript:alert(1)")).toBe(false);
  });

  it("recusa o que não é URL", () => {
    expect(urlDeProjetoValida("clinicahorizonte.com.br")).toBe(false);
    expect(urlDeProjetoValida("//exemplo.com")).toBe(false);
    expect(urlDeProjetoValida("texto qualquer")).toBe(false);
  });

  it("recusa outros esquemas de rede, que não abrem no navegador", () => {
    expect(urlDeProjetoValida("ftp://exemplo.com/arquivo")).toBe(false);
    expect(urlDeProjetoValida("mailto:alguem@exemplo.com")).toBe(false);
  });
});
