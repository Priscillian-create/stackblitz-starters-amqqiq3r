import { readFile, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const clientDir = join(dist, "client");
const serverEntry = join(dist, "server", "index.js");
const patchedEntry = join(dist, "server", ".netlify-prerender-index.mjs");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
  [".woff2", "font/woff2"],
]);

async function assetResponse(url) {
  const pathname = new URL(url).pathname.replace(/^\/+/, "");
  const filePath = join(clientDir, pathname);
  const type = contentTypes.get(extname(filePath)) || "application/octet-stream";
  return new Response(createReadStream(filePath), {
    headers: { "Content-Type": type },
  });
}

const serverCode = await readFile(serverEntry, "utf8");
await writeFile(
  patchedEntry,
  serverCode.replace('import { env } from "cloudflare:workers";', "const env = {};"),
);

const handler = (await import(pathToFileURL(patchedEntry))).default;
const response = await handler.fetch(
  new Request("https://pa-gerry-pos.netlify.app/"),
  {
    ASSETS: {
      fetch: (request) => assetResponse(request.url),
    },
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || "",
  },
  { waitUntil() {} },
);

if (!response.ok) {
  throw new Error(`Could not prerender Netlify index: ${response.status}`);
}

const html = await response.text();
if (!html.includes("PA GERRY POS")) {
  throw new Error("Prerendered Netlify index did not contain the POS app shell.");
}

await writeFile(join(clientDir, "index.html"), html);
await rm(patchedEntry, { force: true });
