/** Редирект на экспорт счёта клиенту (старый URL `/api/accounting/export`). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  const path = qs ? `/api/accounting/export/client?${qs}` : "/api/accounting/export/client";
  return Response.redirect(new URL(path, url.origin), 307);
}
