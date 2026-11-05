// Local development diagnostics contain counts and status only, never tokens or records.
let snapshot: unknown = { status: "Waiting for browser" };
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const data = await request.json() as Record<string, unknown>;
  snapshot = { status: String(data.status).slice(0, 2000), products: Number(data.products), signedIn: Boolean(data.signedIn), pending: Number(data.pending), ready: Boolean(data.ready), visibility: data.visibility, busy: data.busy };
  return Response.json({ ok: true });
}
export async function GET() {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  return Response.json(snapshot);
}
