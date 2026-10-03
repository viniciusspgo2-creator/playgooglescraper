/**
 * GET/POST /api/extension/download — pacote da extensão Chrome com configuração injetada (Fase 4).
 *
 * GET  (sessão obrigatória): zipa `extension/` substituindo __API_BASE__ pela origem
 *      da requisição. O placeholder de token permanece comentado — o token é colado
 *      na Side Panel pela operadora.
 * POST (sessão obrigatória, body {token?}): além da origem, valida o token
 *      (pgs_live_…, existente e não revogado) via authenticateApiToken e injeta a
 *      linha `embeddedToken` no config.js do zip para conexão automática.
 *
 * A extensão é a fonte de execução do scraping; este endpoint nunca devolve dados
 * de leads — só o pacote montado pela própria origem do tenant.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import JSZip from "jszip";
import { z } from "zod";

import { requireSession } from "@/server/auth/guard";
import { apiError } from "@/server/http";
import { authenticateApiToken } from "@/server/tokens/service";

export const runtime = "nodejs";

const EXTENSION_DIR = path.join(process.cwd(), "extension");
const ZIP_FILENAME = "play-google-scraper-extension-v1.0.0.zip";

/** Arquivos copiados verbatim (relativos à pasta extension/). */
const VERBATIM_FILES = [
  "manifest.json",
  "sw.js",
  "quadtree.js",
  "humanizer.js",
  "queue.js",
  "content.js",
  "injected.js",
  "sidepanel.html",
  "sidepanel.css",
  "sidepanel.js",
  "config.template.js",
  "README.md",
  "_locales/pt_BR/messages.json",
  "_locales/en_US/messages.json",
  "_locales/es_ES/messages.json",
] as const;

const BINARY_FILES = ["icon.png"] as const;

const downloadBodySchema = z.object({
  token: z.string().trim().min(1).max(200).optional(),
});

/** Origem do painel: header Origin → x-forwarded-* → localhost (dev). */
function resolveOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? req.headers.get("host");
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}


/** manifest.json final: adiciona a origem do painel em host_permissions (MV3 exige para fetch cross-origin). */
function buildManifestJson(raw: string, origin: string): string {
  const manifest = JSON.parse(raw) as { host_permissions?: string[] };
  const entry = `${origin}/*`;
  const list = manifest.host_permissions ?? [];
  if (!list.includes(entry)) list.push(entry);
  manifest.host_permissions = list;
  return JSON.stringify(manifest, null, 2) + "\n";
}

/** config.js final: origem injetada + (opcional) token embutido. */
async function buildConfigJs(origin: string, embeddedToken?: string): Promise<string> {
  const template = await readFile(path.join(EXTENSION_DIR, "config.template.js"), "utf8");
  // Substituições exatas nas linhas de código (placeholders únicos do template).
  let output = template.replace('apiBase: "__API_BASE__"', `apiBase: ${JSON.stringify(origin)}`);
  if (embeddedToken) {
    // Substitui o placeholder comentado pelo token (conexão automática na 1ª abertura).
    output = output.replace("/* __TOKEN__ */", `embeddedToken: ${JSON.stringify(embeddedToken)},`);
  }
  return output;
}

async function buildExtensionZip(origin: string, embeddedToken?: string): Promise<Buffer> {
  const zip = new JSZip();
  for (const rel of VERBATIM_FILES) {
    const content = await readFile(path.join(EXTENSION_DIR, rel), "utf8");
    zip.file(rel, rel === "manifest.json" ? buildManifestJson(content, origin) : content);
  }
  for (const rel of BINARY_FILES) {
    zip.file(rel, await readFile(path.join(EXTENSION_DIR, rel)));
  }
  zip.file("config.js", await buildConfigJs(origin, embeddedToken));
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  return buffer;
}

function zipResponse(zip: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${ZIP_FILENAME}"`,
      "Content-Length": String(zip.byteLength),
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  const { error } = await requireSession();
  if (error) return error;

  const origin = resolveOrigin(req);
  try {
    const zip = await buildExtensionZip(origin);
    return zipResponse(zip);
  } catch (err) {
    console.error("[extension/download] falha ao montar zip:", err);
    return apiError(500, "internal_error", "Falha ao montar o pacote da extensão.");
  }
}

export async function POST(req: Request) {
  const { error } = await requireSession();
  if (error) return error;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {}; // corpo vazio → download sem token embutido (mesmo comportamento do GET)
  }
  const parsed = downloadBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "bad_request", "Corpo inválido — esperado {token?: string}.");
  }

  let embeddedToken: string | undefined;
  const requested = parsed.data.token;
  if (requested) {
    if (!requested.startsWith("pgs_live_")) {
      return apiError(400, "invalid_token", "Token deve começar com pgs_live_ (criado no painel).");
    }
    const auth = await authenticateApiToken(requested);
    if (!auth) {
      return apiError(400, "invalid_token", "Token inexistente ou revogado.");
    }
    embeddedToken = requested;
  }

  const origin = resolveOrigin(req);
  try {
    const zip = await buildExtensionZip(origin, embeddedToken);
    return zipResponse(zip);
  } catch (err) {
    console.error("[extension/download] falha ao montar zip:", err);
    return apiError(500, "internal_error", "Falha ao montar o pacote da extensão.");
  }
}
