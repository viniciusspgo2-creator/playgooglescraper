/**
 * Normalização e classificação de campos de lead (fonte de verdade no SERVIDOR).
 * A extensão envia sua classificação, mas ela nunca é confiável — todo dado
 * que define temperatura/heat_score é recalculado aqui (trust boundary, ADR-002 §D6).
 */
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

import type { LeadWebsiteType } from "@/shared/contracts";

/**
 * Domínios que NÃO são um site próprio — presença apenas em plataformas.
 * negocio.site / business.site são construtores do Google (morno, não quente).
 */
const SOCIAL_DOMAINS = [
  "facebook.com",
  "fb.com",
  "fb.me",
  "m.facebook.com",
  "instagram.com",
  "linktr.ee",
  "wa.me",
  "api.whatsapp.com",
  "chat.whatsapp.com",
  "whatsapp.com",
  "bio.link",
  "beacons.ai",
  "carrd.co",
  "negocio.site",
  "business.site",
  "sites.google.com",
  "t.me",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "x.com",
  "twitter.com",
] as const;

export function classifyWebsite(website: string | null | undefined): LeadWebsiteType {
  if (!website) return "none";
  let host: string;
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    host = url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "none";
  }
  const isSocial = SOCIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`) || host.endsWith(d));
  return isSocial ? "social" : "own";
}

export type NormalizedPhone = {
  e164: string | null;
  valid: boolean;
  /** Heurística de WhatsApp: telefone móvel válido (libphonenumber type MOBILE). */
  whatsapp: boolean;
};

export function normalizePhone(raw: string | null | undefined, defaultCountry = "BR"): NormalizedPhone {
  if (!raw || typeof raw !== "string") return { e164: null, valid: false, whatsapp: false };
  const cleaned = raw.replace(/[^\d+]/g, "").slice(0, 24);
  if (!cleaned) return { e164: null, valid: false, whatsapp: false };
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry as CountryCode);
  if (!parsed || !parsed.isValid()) return { e164: null, valid: false, whatsapp: false };
  return { e164: parsed.number, valid: true, whatsapp: parsed.getType() === "MOBILE" };
}

/** URL de website limpa (com esquema) ou null. */
export function normalizeWebsite(website: string | null | undefined): string | null {
  if (!website || typeof website !== "string") return null;
  const trimmed = website.trim().slice(0, 512);
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
