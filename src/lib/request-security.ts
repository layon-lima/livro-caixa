export function sameOriginPost(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.host === host;
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
