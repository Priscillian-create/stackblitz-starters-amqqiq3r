import { env } from "cloudflare:workers";

const fallbackSupabaseUrl = "https://vxvbwrzlypykidpkewsk.supabase.co";
const fallbackSupabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4dmJ3cnpseXB5a2lkcGtld3NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMjU5MzgsImV4cCI6MjEwMTYwMTkzOH0.8v5Hu6U6IguiSeAsxagWm5R7q9pASD4r6cLmtIBeOuY";
const fallbackSupabasePublishableKey = "sb_publishable_cMJrQTRIzTitrUJKkupqHg_hBfM7IN1";

export async function GET() {
  return Response.json({
    url: env.SUPABASE_URL ?? fallbackSupabaseUrl,
    anonKey: env.SUPABASE_ANON_KEY ?? fallbackSupabaseAnonKey,
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? fallbackSupabasePublishableKey,
  });
}
