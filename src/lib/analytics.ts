"use client";

/**
 * Camada única de eventos de marketing (GA4 + GTM).
 *
 * - Sem NEXT_PUBLIC_GA_MEASUREMENT_ID / NEXT_PUBLIC_GTM_ID, todas as chamadas
 *   são no-op (zero script injetado — CSP e performance intactos).
 * - Com GTM presente, eventos também vão para dataLayer (campanhas/Tag Manager).
 */

type EventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function pushToDataLayer(event: string, params: EventParams): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event, ...params });
}

/** Evento genérico: GA4 (gtag) + dataLayer (GTM). */
export function trackEvent(name: string, params: EventParams = {}): void {
  if (typeof window === "undefined") return;
  pushToDataLayer(name, params);
  if (typeof window.gtag === "function") {
    window.gtag("event", name, params);
  }
}

export const analyticsEvents = {
  /** Cliques em CTAs principais da landing/blog (label = local do botão). */
  ctaClick: (label: string, destination?: string) =>
    trackEvent("cta_click", { cta_label: label, cta_destination: destination }),
  /** Submissões de formulário (auth, convite). */
  formSubmit: (formName: string) => trackEvent("form_submit", { form_name: formName }),
  /** Conversões de aquisição (cadastro concluído / login). */
  signUp: (method = "email") => trackEvent("sign_up", { method }),
  login: (method = "email") => trackEvent("login", { method }),
  /** Profundidade de scroll em páginas de conteúdo (25/50/75/100). */
  scrollDepth: (percent: 25 | 50 | 75 | 100, pagePath: string) =>
    trackEvent("scroll", { percent_scrolled: percent, page_path: pagePath }),
  /** Download do pacote da extensão no painel. */
  extensionDownload: () => trackEvent("extension_download"),
  /** Conversão comercial: negócio fechado no Kanban (uso do produto). */
  dealClosed: () => trackEvent("deal_closed"),
} as const;

/** Nome do autor/organização para links de atribuição em conteúdo. */
export const CONTENT_AUTHOR = "Play Google Scraper — Equipe de Engenharia";
