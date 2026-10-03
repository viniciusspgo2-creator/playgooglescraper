/**
 * scripts/pack-extension.ts — empacota a extensão localmente (sem auth) para
 * inspeção/validação. Espelha a lógica de src/app/api/extension/download/route.ts.
 *
 * Uso:
 *   bun scripts/pack-extension.ts                       → origem http://localhost:3000
 *   PGS_ORIGIN=https://app.example.com bun scripts/pack-extension.ts
 *   bun scripts/pack-extension.ts "pgs_live_..."        → injeta embeddedToken (conexão automática)
 *
 * Saída: download/play-google-scraper-extension-v1.0.0.zip + listagem do conteúdo
 * no stdout com verificação da injeção do config.js e do manifest.json.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import JSZip from "jszip";

const ROOT = process.cwd();
const EXTENSION_DIR = path.join(ROOT, "extension");
const OUT_DIR = path.join(ROOT, "download");
const OUT_FILE = path.join(OUT_DIR, "play-google-scraper-extension-v1.0.0.zip");

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
];
const BINARY_FILES = ["icon.png"];


/** manifest.json final: adiciona a origem do painel em host_permissions (MV3 exige para fetch cross-origin). */
function buildManifestJson(raw: string, origin: string): string {
  const manifest = JSON.parse(raw) as { host_permissions?: string[] };
  const entry = `${origin}/*`;
  const list = manifest.host_permissions ?? [];
  if (!list.includes(entry)) list.push(entry);
  manifest.host_permissions = list;
  return JSON.stringify(manifest, null, 2) + "\n";
}

async function main() {
  const origin = (process.env.PGS_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "");
  const tokenArg = process.argv[2] ?? process.env.PGS_TOKEN ?? "";
  const token = tokenArg.startsWith("pgs_live_") ? tokenArg.trim() : undefined;

  const template = await readFile(path.join(EXTENSION_DIR, "config.template.js"), "utf8");
  let configJs = template.replace('apiBase: "__API_BASE__"', `apiBase: ${JSON.stringify(origin)}`);
  if (token) {
    configJs = configJs.replace("/* __TOKEN__ */", `embeddedToken: ${JSON.stringify(token)},`);
  }

  const zip = new JSZip();
  for (const rel of VERBATIM_FILES) {
    const content = await readFile(path.join(EXTENSION_DIR, rel), "utf8");
    zip.file(rel, rel === "manifest.json" ? buildManifestJson(content, origin) : content);
  }
  for (const rel of BINARY_FILES) {
    zip.file(rel, await readFile(path.join(EXTENSION_DIR, rel)));
  }
  zip.file("config.js", configJs);

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, buffer);

  // ── Validação: relê o zip e confere conteúdo crítico ──
  const reloaded = await JSZip.loadAsync(buffer);
  const names = Object.keys(reloaded.files).filter((n) => !reloaded.files[n].dir).sort();

  console.log(`[pack-extension] origem injetada: ${origin}`);
  console.log(`[pack-extension] token embutido: ${token ? "sim (pgs_live_…)" : "não (usuário cola na Side Panel)"}`);
  console.log(`[pack-extension] arquivo: ${OUT_FILE} (${(buffer.byteLength / 1024).toFixed(1)} KiB)`);
  console.log(`[pack-extension] conteúdo (${names.length} entradas):`);
  for (const name of names) console.log(`  - ${name}`);

  const packedConfig = await reloaded.file("config.js")!.async("string");
  const hasOrigin = packedConfig.includes(`apiBase: "${origin}"`);
  const hasToken = token ? packedConfig.includes(`embeddedToken: "${token}"`) : packedConfig.includes("/* __TOKEN__ */");
  const manifestRaw = await reloaded.file("manifest.json")!.async("string");
  const manifest = JSON.parse(manifestRaw) as { name: string; version: string; default_locale: string; manifest_version?: number };

  const checks: Array<[string, boolean]> = [
    ["config.js com apiBase injetado", hasOrigin],
    [token ? "config.js com embeddedToken injetado" : "config.js com placeholder de token comentado", hasToken],
    ["manifest MV3 com default_locale pt_BR", manifest.manifest_version === 3 && manifest.default_locale === "pt_BR"],
    ["manifest referencia icon.png presente", Boolean(reloaded.file("icon.png"))],
    ["service worker presente", Boolean(reloaded.file("sw.js"))],
    ["content + injected presentes", Boolean(reloaded.file("content.js") && reloaded.file("injected.js"))],
    ["3 locales completas", ["_locales/pt_BR/messages.json", "_locales/en_US/messages.json", "_locales/es_ES/messages.json"].every((f) => Boolean(reloaded.file(f)))],
    ["sem placeholders __API_BASE__ restantes", !packedConfig.includes("__API_BASE__")],
  ];

  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    if (!ok) failed += 1;
  }
  if (failed > 0) {
    console.error(`[pack-extension] FALHOU: ${failed} checagem(ns).`);
    process.exit(1);
  }
  console.log("[pack-extension] OK — zip válido e config injetado.");
}

main().catch((err) => {
  console.error("[pack-extension] erro:", err);
  process.exit(1);
});
