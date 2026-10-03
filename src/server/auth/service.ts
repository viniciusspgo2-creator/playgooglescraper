/**
 * Serviço de autenticação e organização (Fase 2) — regras de negócio puras.
 * Toda escrita passa pelo TenantGuard; sessões são cookie assinado (ADR-003).
 */
import { randomBytes } from "node:crypto";

import { locales, type AppLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { slugifyCompany, type AcceptInviteInput, type InviteMemberInput, type RegisterInput } from "@/shared/schemas";
import { tenantDb } from "@/server/tenancy/tenant-guard";

import { hashPassword, verifyPassword } from "./password";

function tenantDbFor(tenantId: string) {
  return tenantDb(tenantId);
}

export type Role = "owner" | "admin" | "member";

export type SessionView = {
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    status: string;
    locale: AppLocale;
    createdAt: string;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    leadCredits: number;
    leadCreditsUsed: number;
    seats: number;
  };
};

export class AuthError extends Error {
  constructor(
    public code:
      | "email_taken"
      | "invalid_credentials"
      | "invite_pending"
      | "account_disabled"
      | "seats_exhausted"
      | "invite_invalid"
      | "tenant_not_found"
      | "forbidden",
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function asLocale(value: string | null | undefined): AppLocale {
  if (value && (locales as readonly string[]).includes(value)) return value as AppLocale;
  return "pt-BR";
}

function toSessionView(
  user: { id: string; email: string; name: string; role: string; status: string; locale: string; createdAt: Date },
  tenant: { id: string; name: string; slug: string; plan: string; leadCredits: number; leadCreditsUsed: number; seats: number }
): SessionView {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
      status: user.status,
      locale: asLocale(user.locale),
      createdAt: user.createdAt.toISOString(),
    },
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      leadCredits: tenant.leadCredits,
      leadCreditsUsed: tenant.leadCreditsUsed,
      seats: tenant.seats,
    },
  };
}

async function uniqueSlug(base: string): Promise<string> {
  const clean = base || "org";
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? clean : `${clean}-${randomBytes(2).toString("hex")}`;
    const exists = await db.tenant.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  return `${clean}-${Date.now().toString(36)}`;
}

/** Onboarding: cria tenant + owner em uma transação e devolve a sessão. */
export async function registerTenantAndOwner(input: RegisterInput): Promise<SessionView> {
  const email = input.email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new AuthError("email_taken", "E-mail já cadastrado.");

  const slug = await uniqueSlug(slugifyCompany(input.company));
  const passwordHash = await hashPassword(input.password);

  const tenant = await db.tenant.create({
    data: {
      name: input.company.trim(),
      slug,
      plan: "trial",
      leadCredits: 500,
      seats: 3,
      locale: input.locale ?? "pt-BR",
      users: {
        create: {
          email,
          name: input.name.trim(),
          passwordHash,
          role: "owner",
          status: "active",
          locale: input.locale ?? "pt-BR",
        },
      },
    },
    include: { users: true },
  });

  const owner = tenant.users[0]!;

  // Atividades são append-only e tenant-scoped (guard aplica).
  const tdb = tenantDbFor(tenant.id);
  await tdb.activity.createMany({
    data: [
      { tenantId: tenant.id, userId: owner.id, type: "tenant.created", dataJson: JSON.stringify({ slug }) },
      { tenantId: tenant.id, userId: owner.id, type: "auth.register", dataJson: null },
    ],
  });

  return toSessionView(owner, tenant);
}

export async function login(input: { email: string; password: string }): Promise<SessionView> {
  const email = input.email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    // Usuário inexistente e senha errada dão o MESMO erro (sem enumeração de contas).
    throw new AuthError("invalid_credentials", "E-mail ou senha inválidos.");
  }
  if (user.status === "disabled") {
    throw new AuthError("account_disabled", "Conta desativada. Fale com o dono da organização.");
  }
  if (user.status === "invited") {
    throw new AuthError("invite_pending", "Convite pendente: defina sua senha pelo link recebido.");
  }
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw new AuthError("invalid_credentials", "E-mail ou senha inválidos.");

  const tenant = await db.tenant.findUnique({ where: { id: user.tenantId } });
  if (!tenant) throw new AuthError("tenant_not_found", "Organização não encontrada.");

  const tdb = tenantDbFor(user.tenantId);
  await tdb.user.updateMany({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await tdb.activity.create({
    data: { tenantId: user.tenantId, userId: user.id, type: "auth.login", dataJson: null },
  });

  return toSessionView(user, tenant);
}

export async function getSessionView(userId: string): Promise<SessionView | null> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "active") return null;
  const tenant = await db.tenant.findUnique({ where: { id: user.tenantId } });
  if (!tenant) return null;
  return toSessionView(user, tenant);
}

export async function updateProfile(
  userId: string,
  data: { name?: string; locale?: AppLocale }
): Promise<SessionView | null> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const tdb = tenantDbFor(user.tenantId);
  await tdb.user.updateMany({
    where: { id: userId },
    data: {
      ...(data.name ? { name: data.name } : {}),
      ...(data.locale ? { locale: data.locale } : {}),
    },
  });
  const updated = await tdb.user.findFirst({ where: { id: userId } });
  const tenant = await db.tenant.findUnique({ where: { id: updated!.tenantId } });
  if (!updated || !tenant) return null;
  return toSessionView(updated, tenant);
}

/** owner/admin convidam; assentos contratados são respeitados. */
export async function inviteMember(
  tenantId: string,
  actor: { id: string; role: Role },
  input: InviteMemberInput
): Promise<{ inviteUrl: string; email: string; mailerBackend: string }> {
  if (actor.role === "member") {
    throw new AuthError("forbidden", "Somente owner/admin podem convidar.");
  }
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new AuthError("tenant_not_found", "Organização não encontrada.");

  const membersCount = await db.user.count({
    where: { tenantId, status: { in: ["active", "invited"] } },
  });
  if (membersCount >= tenant.seats) {
    throw new AuthError("seats_exhausted", "Limite de assentos atingido no plano atual.");
  }

  const email = input.email.trim().toLowerCase();
  const emailTaken = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (emailTaken) throw new AuthError("email_taken", "E-mail já cadastrado.");

  const inviteToken = randomBytes(32).toString("hex");
  const tdb = tenantDbFor(tenantId);
  const user = await tdb.user.create({
    data: {
      tenantId,
      email,
      name: input.name?.trim() ?? email.split("@")[0]!,
      role: input.role,
      status: "invited",
      inviteToken,
      inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      locale: tenant.locale,
    },
  });

  await tdb.activity.create({
    data: {
      tenantId,
      userId: actor.id,
      type: "auth.invite_sent",
      dataJson: JSON.stringify({ invitedUserId: user.id, role: input.role }),
    },
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/?invite=${inviteToken}`;
  const mail = await sendInviteMail({ to: email, tenantName: tenant.name, inviterName: undefined, inviteUrl, locale: asLocale(tenant.locale) });

  return { inviteUrl, email, mailerBackend: mail.backend };
}

async function sendInviteMail(opts: {
  to: string;
  tenantName: string;
  inviterName: string | undefined;
  inviteUrl: string;
  locale: AppLocale;
}) {
  const { sendMail } = await import("@/server/mailer");
  const subjectByLocale: Record<AppLocale, string> = {
    "pt-BR": `Você foi convidado para ${opts.tenantName} no Play Google Scraper`,
    "en-US": `You've been invited to ${opts.tenantName} on Play Google Scraper`,
    "es-ES": `Te invitaron a ${opts.tenantName} en Play Google Scraper`,
  };
  const bodyByLocale: Record<AppLocale, string> = {
    "pt-BR": `Defina sua senha e acesse o painel: ${opts.inviteUrl} (válido por 7 dias).`,
    "en-US": `Set your password and access the panel: ${opts.inviteUrl} (valid for 7 days).`,
    "es-ES": `Define tu contraseña y accede al panel: ${opts.inviteUrl} (válido por 7 días).`,
  };
  return sendMail({
    to: opts.to,
    subject: subjectByLocale[opts.locale],
    text: bodyByLocale[opts.locale],
  });
}

export async function getInvitePreview(token: string): Promise<{
  email: string;
  tenantName: string;
  expiresAt: string;
} | null> {
  const user = await db.user.findUnique({ where: { inviteToken: token } });
  if (!user || user.status !== "invited") return null;
  if (!user.inviteExpiresAt || user.inviteExpiresAt.getTime() < Date.now()) return null;
  const tenant = await db.tenant.findUnique({ where: { id: user.tenantId } });
  if (!tenant) return null;
  return {
    email: user.email,
    tenantName: tenant.name,
    expiresAt: user.inviteExpiresAt.toISOString(),
  };
}

export async function acceptInvite(input: AcceptInviteInput): Promise<SessionView> {
  const user = await db.user.findUnique({ where: { inviteToken: input.token } });
  if (!user || user.status !== "invited") throw new AuthError("invite_invalid", "Convite inválido ou já utilizado.");
  if (!user.inviteExpiresAt || user.inviteExpiresAt.getTime() < Date.now()) {
    throw new AuthError("invite_invalid", "Convite expirado. Peça um novo convite.");
  }
  const passwordHash = await hashPassword(input.password);
  const tdb = tenantDbFor(user.tenantId);
  await tdb.user.updateMany({
    where: { id: user.id },
    data: {
      passwordHash,
      name: input.name.trim(),
      status: "active",
      inviteToken: null,
      inviteExpiresAt: null,
      lastLoginAt: new Date(),
    },
  });
  const updated = await tdb.user.findFirst({ where: { id: user.id } });
  const tenant = await db.tenant.findUnique({ where: { id: user.tenantId } });
  if (!updated || !tenant) throw new AuthError("tenant_not_found", "Organização não encontrada.");
  await tenantDbFor(updated.tenantId).activity.create({
    data: { tenantId: updated.tenantId, userId: updated.id, type: "auth.invite_accepted", dataJson: null },
  });
  return toSessionView(updated, tenant);
}

/** owner/admin desativam membros; ninguém desativa owner nem a si mesmo. */
export async function disableMember(
  tenantId: string,
  actor: { id: string; role: Role },
  targetUserId: string
): Promise<{ ok: true }> {
  if (actor.role === "member") {
    throw new AuthError("forbidden", "Somente owner/admin podem desativar membros.");
  }
  if (actor.id === targetUserId) {
    throw new AuthError("forbidden", "Não é possível desativar a própria conta aqui.");
  }
  const tdb = tenantDbFor(tenantId);
  const target = await tdb.user.findFirst({ where: { id: targetUserId } });
  if (!target) throw new AuthError("invite_invalid", "Membro não encontrado.");
  if (target.role === "owner") {
    throw new AuthError("forbidden", "A conta do dono não pode ser desativada.");
  }
  await tdb.user.updateMany({
    where: { id: targetUserId },
    data: { status: "disabled", tokenVersion: { increment: 1 }, inviteToken: null, inviteExpiresAt: null },
  });
  await tdb.activity.create({
    data: { tenantId, userId: actor.id, type: "auth.member_disabled", dataJson: JSON.stringify({ targetUserId }) },
  });
  return { ok: true };
}

export async function listMembers(tenantId: string) {
  const tdb = tenantDbFor(tenantId);
  const users = await tdb.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      locale: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return users.map((u) => ({
    ...u,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  }));
}

