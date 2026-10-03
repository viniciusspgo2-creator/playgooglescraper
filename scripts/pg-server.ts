/**
 * Servidor PostgreSQL local (user-space) — mesma engine do Neon (produção/Vercel).
 *
 * Uso: bun scripts/pg-server.ts   (fica em execução; inicie em background)
 * - Inicializa o cluster em db/pgdata na primeira execução.
 * - Porta 5432, usuário postgres / senha postgres, database "pgs" (criado se faltar).
 * - DATABASE_URL no .env aponta para postgresql://postgres:postgres@127.0.0.1:5432/pgs
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "db", "pgdata");
const PORT = Number(process.env.PG_PORT ?? 5432);

async function main() {
  const fresh = !existsSync(path.join(DATA_DIR, "PG_VERSION"));

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
  });

  if (fresh) {
    console.log(`[pg] inicializando cluster em ${DATA_DIR}...`);
    await pg.initialise();
  }

  console.log(`[pg] subindo PostgreSQL na porta ${PORT}...`);
  await pg.start();

  try {
    await pg.createDatabase("pgs");
    console.log("[pg] database 'pgs' criado.");
  } catch {
    console.log("[pg] database 'pgs' já existe.");
  }

  console.log(`[pg] pronto: postgresql://postgres:postgres@127.0.0.1:${PORT}/pgs`);
}

main().catch((err) => {
  console.error("[pg] falhou:", err);
  process.exit(1);
});
