/**
 * Validação CSRF por origem pública conhecida.
 * Não usa Host/X-Forwarded-Host, que podem mudar entre Caddy e Next.js.
 */
export function sameOriginPost(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const originUrl = new URL(origin);
    const publicOrigin = process.env.APP_ORIGIN || "https://livrocaixa.fazendanovohorizonte.com";
    if (originUrl.origin === new URL(publicOrigin).origin) return true;

    // Desenvolvimento local: permite a origem da própria aplicação,
    // nunca hosts recebidos de cabeçalhos repassados pelo proxy.
    if (process.env.NODE_ENV !== "production") {
      return originUrl.origin === new URL(request.url).origin;
    }
    return false;
  } catch {
    return false;
  }
}

export function backTo(path: string, status = 303): Response {
  return new Response(null, { status, headers: { Location: path, "Cache-Control": "no-store" } });
}

export function forbidden(): Response {
  return new Response("Acesso negado", { status: 403, headers: { "Cache-Control": "no-store" } });
}
