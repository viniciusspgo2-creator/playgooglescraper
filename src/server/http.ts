/**
 * Helpers HTTP para rotas de API — erros consistentes + parse com Zod.
 */
import { NextResponse } from "next/server";
import type { z } from "zod";

import { AuthError } from "@/server/auth/service";
import { TokenError } from "@/server/tokens/service";
import { TenantScopeError } from "@/server/tenancy/tenant-guard";
import { Prisma } from "@prisma/client";

export function apiError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<{ data: z.infer<T>; error: null } | { data: null; error: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { data: null, error: apiError(400, "invalid_json", "Corpo da requisição inválido.") };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first?.path?.join(".") ?? "body";
    return {
      data: null,
      error: apiError(422, "validation_error", `Campo inválido: ${field} — ${first?.message ?? "revise os dados"}`),
    };
  }
  return { data: parsed.data as z.infer<T>, error: null };
}

/** Mapeia erros de negócio para respostas HTTP sem vazar detalhes internos. */
export function mapServiceError(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    const statusByCode: Record<string, number> = {
      email_taken: 409,
      invalid_credentials: 401,
      invite_pending: 409,
      account_disabled: 403,
      seats_exhausted: 402,
      invite_invalid: 410,
      tenant_not_found: 404,
      forbidden: 403,
    };
    return apiError(statusByCode[err.code] ?? 400, err.code, err.message);
  }
  if (err instanceof TokenError) {
    const statusByCode: Record<string, number> = {
      not_found: 404,
      revoked: 409,
      tenant_not_found: 404,
    };
    return apiError(statusByCode[err.code] ?? 400, err.code, err.message);
  }
  if (err instanceof TenantScopeError) {
    // Nunca deve acontecer em rotas corretas; se acontecer, é bug — loga e nega.
    console.error("[tenant-guard] violação em rota:", err.message);
    return apiError(500, "internal_error", "Erro interno.");
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return apiError(409, "conflict", "Registro duplicado.");
  }
  console.error("[api] erro inesperado:", err);
  return apiError(500, "internal_error", "Erro interno.");
}
