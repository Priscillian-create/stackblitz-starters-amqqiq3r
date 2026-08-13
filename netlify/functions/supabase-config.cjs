exports.handler = async function handler() {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({
      url: process.env.SUPABASE_URL || "https://vxvbwrzlypykidpkewsk.supabase.co",
      anonKey:
        process.env.SUPABASE_ANON_KEY ||
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4dmJ3cnpseXB5a2lkcGtld3NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMjU5MzgsImV4cCI6MjEwMTYwMTkzOH0.8v5Hu6U6IguiSeAsxagWm5R7q9pASD4r6cLmtIBeOuY",
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_cMJrQTRIzTitrUJKkupqHg_hBfM7IN1",
    }),
  };
};
