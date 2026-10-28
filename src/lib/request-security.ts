/**
 * Proteção CSRF para formulários navegados pelo navegador.
 *
 * O Caddy pode repassar Host e X-Forwarded-Host diferentes do endereço
 * público. Não dependemos desses cabeçalhos para validar a origem.
 *
 * Sec-Fetch-Site é definido pelo navegador (scripts não podem forjá-lo)
 * e identifica requisições iniciadas no próprio site mesmo quando o
 * navegador omite o cabeçalho Origin.
 */
export function sameOriginPost(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");

  // Bloqueia requisições de outros sites e subdomínios.
  if (fetchSite === "cross-site" || fetchSite === "same-site") return false;

  // Formulário iniciado no próprio domínio: seguro mesmo sem Origin.
  if (fetchSite === "same-origin") return true;

  const rawOrigin = request.headers.get("origin");
  const rawReferer = request.headers.get("referer");
  const expected = process.env.APP_ORIGIN || "https://livrocaixa.fazendanovohorizonte.com";

  try {
    const expectedOrigin = new URL(expected).origin;
    if (rawOrigin && new URL(rawOrigin).origin === expectedOrigin) return true;
    if (!rawOrigin && rawReferer && new URL(rawReferer).origin === expectedOrigin) return true;

    if (process.env.NODE_ENV !== "production") {
      const localOrigin = new URL(request.url).origin;
      if (rawOrigin && new URL(rawOrigin).origin === localOrigin) return true;
      if (!rawOrigin && rawReferer && new URL(rawReferer).origin === localOrigin) return true;
    }
  } catch {
    // Referências malformadas não são aceitas.
  }

  console.warn("Requisicao de formulario bloqueada", {
    fetchSite: fetchSite ?? "ausente",
    hasOrigin: Boolean(rawOrigin),
    hasReferer: Boolean(rawReferer),
  });
  return false;
}

export function backTo(path: string, status = 303): Response {
  return new Response(null, { status, headers: { Location: path, "Cache-Control": "no-store" } });
}

export function forbidden(): Response {
  return new Response("Acesso negado", { status: 403, headers: { "Cache-Control": "no-store" } });
}
