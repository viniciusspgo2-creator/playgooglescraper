/**
 * SEED ROTULADO — dados de demonstração da Fase 2.
 *
 * Executa:  bun run db:seed
 *
 * ⚠️  TUDO criado aqui é rotulado "[SEED]" e serve APENAS para desenvolver/
 *     demonstrar o produto. Nunca rode em produção. Nenhum dado é apresentado
 *     na UI como se fosse real — o nome da organização carrega o rótulo.
 *
 * Cria:
 *  - Tenant "Demo (SEED)" (trial, 500 créditos)
 *  - Owner  demo@playgooglescraper.app  / senha Demo1234
 *  - Admin  admin.demo@playgooglescraper.app / senha Demo1234
 *  - Membro convidado member.demo@… (token de convite impresso para testar o fluxo)
 *  - 1 token de API (impresso UMA vez)
 *  - 6 leads rotulados [SEED] com heat_score/classificação preenchidos
 *    (insumo para as fases 5–7; claramente marcados como demonstração)
 */
import { createHash, randomBytes } from "node:crypto";

import { db } from "../src/lib/db";
import { hashPassword } from "../src/server/auth/password";

const TENANT_SLUG = "demo-seed";
const OWNER_EMAIL = "demo@playgooglescraper.app";
const ADMIN_EMAIL = "admin.demo@playgooglescraper.app";
const MEMBER_EMAIL = "member.demo@playgooglescraper.app";
const SEED_PASSWORD = "Demo1234";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main(): Promise<void> {
  console.log("\n═══ SEED ROTULADO — Play Google Scraper (Fase 2) ═══\n");

  const existingTenant = await db.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (existingTenant) {
    console.log(`Tenant "${TENANT_SLUG}" já existe — nada foi criado. Rode db:reset para recomeçar.`);
    return;
  }

  const passwordHash = await hashPassword(SEED_PASSWORD);
  const memberInviteToken = randomBytes(32).toString("hex");

  const tenant = await db.tenant.create({
    data: {
      name: "Demo (SEED)",
      slug: TENANT_SLUG,
      plan: "trial",
      leadCredits: 500,
      seats: 3,
      locale: "pt-BR",
      users: {
        create: [
          { email: OWNER_EMAIL, name: "Dono (SEED)", passwordHash, role: "owner", status: "active", locale: "pt-BR" },
          { email: ADMIN_EMAIL, name: "Admin (SEED)", passwordHash, role: "admin", status: "active", locale: "pt-BR" },
          {
            email: MEMBER_EMAIL,
            name: "Membro Convidado (SEED)",
            role: "member",
            status: "invited",
            locale: "pt-BR",
            inviteToken: memberInviteToken,
            inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        ],
      },
    },
    include: { users: true },
  });

  const owner = tenant.users.find((u) => u.email === OWNER_EMAIL)!;
  const admin = tenant.users.find((u) => u.email === ADMIN_EMAIL)!;

  // Token de API do seed (impresso uma única vez no console).
  const secretPart = randomBytes(32).toString("hex");
  const rawToken = `pgs_live_${TENANT_SLUG.replace(/-/g, "")}_${secretPart}`;
  await db.apiToken.create({
    data: {
      tenantId: tenant.id,
      name: "[SEED] Conexão de demonstração",
      tokenHash: sha256(rawToken),
      tokenPrefix: `${rawToken.slice(0, 20)}…${rawToken.slice(-4)}`,
      scopesJson: JSON.stringify(["verify", "leads:write", "leads:read"]),
      createdById: owner.id,
    },
  });

  // Leads rotulados [SEED] — insumo para as fases 5–7.
  const seedLeads = [
    { name: "[SEED] Barbearia Navalha de Ouro", websiteType: "none", temperature: "hot", heat: 88, rating: 4.7, reviews: 132, phone: "+5562999990001", cat: "Barbearia" },
    { name: "[SEED] Padaria Pão da Esquina", websiteType: "none", temperature: "hot", heat: 91, rating: 4.8, reviews: 210, phone: "+5562999990002", cat: "Padaria" },
    { name: "[SEED] Studio Pilates Equilíbrio", websiteType: "social", temperature: "warm", heat: 64, rating: 4.5, reviews: 58, phone: "+5562999990003", cat: "Estúdio de pilates" },
    { name: "[SEED] Clínica Odonto Sorriso", websiteType: "own", temperature: "cold", heat: 31, rating: 4.2, reviews: 96, phone: "+5562999990004", cat: "Clínica odontológica" },
    { name: "[SEED] Pet Shop Amigo Fiel", websiteType: "none", temperature: "hot", heat: 84, rating: 4.6, reviews: 74, phone: "+5562999990005", cat: "Pet shop" },
    { name: "[SEED] Restaurante Sabor Caseiro", websiteType: "social", temperature: "warm", heat: 59, rating: 4.4, reviews: 41, phone: "+5562999990006", cat: "Restaurante" },
  ] as const;

  await db.lead.createMany({
    data: seedLeads.map((l, i) => ({
      tenantId: tenant.id,
      placeId: `seed_place_${i + 1}`,
      name: l.name,
      phoneE164: l.phone,
      website: l.websiteType === "none" ? null : `https://${l.websiteType === "social" ? "instagram.com/" : ""}${TENANT_SLUG}-${i + 1}`,
      websiteType: l.websiteType,
      temperature: l.temperature,
      hasSite: l.websiteType !== "none",
      heatScore: l.heat,
      rating: l.rating,
      reviewsCount: l.reviews,
      primaryCategory: l.cat,
      categoriesJson: JSON.stringify([l.cat]),
      categoriesText: l.cat,
      claimed: i % 2 === 0,
    })),
  });

  await db.activity.create({
    data: { tenantId: tenant.id, userId: admin.id, type: "seed.executed", dataJson: JSON.stringify({ at: new Date().toISOString() }) },
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  console.log("Dados criados (todos rotulados [SEED]):");
  console.log(`  Tenant: "Demo (SEED)" — plano trial, 500 créditos, 3 assentos`);
  console.log(`  Owner  → ${OWNER_EMAIL}   senha: ${SEED_PASSWORD}`);
  console.log(`  Admin  → ${ADMIN_EMAIL}   senha: ${SEED_PASSWORD}`);
  console.log(`  Membro convidado → ${MEMBER_EMAIL}`);
  console.log(`  Link de convite do membro (teste o fluxo): ${appUrl}/?invite=${memberInviteToken}`);
  console.log(`  Token de API (mostrado UMA vez): ${rawToken}`);
  console.log(`  Leads [SEED]: ${seedLeads.length} registros com heat_score preenchido`);
  console.log("\n⚠️  Nenhum destes dados é de produção. Nunca rode este seed em produção.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed falhou:", err);
    process.exit(1);
  });
