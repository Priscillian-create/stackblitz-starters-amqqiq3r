import { GET as getConfig } from '../supabase-config/route';
import { proxyDatabaseRequest } from '../../../server/database-proxy.mjs';

async function handle(request: Request) {
  const config = await (await getConfig()).json() as { url: string; anonKey: string };
  return proxyDatabaseRequest(request, config);
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
