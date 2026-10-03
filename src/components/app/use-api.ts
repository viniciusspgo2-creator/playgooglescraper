"use client";

/**
 * Camada fina de leitura/escrita de API.
 * Respostas das rotas: { ok: true, ...payload } | { ok: false, error: { code, message } }.
 * Sem setState síncrono em effect (react-hooks). ADR-003 §D7 — TanStack Query
 * entra na Fase 5 com as tabelas virtualizadas, sem mudar estes call-sites.
 */
import { useCallback, useEffect, useState } from "react";

import { useTranslations } from "next-intl";

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type ApiEnvelope<T> = ({ ok: true } & T) | { ok: false; error: { code: string; message: string } };

/** Request genérico — devolve o corpo inteiro (tipado) ou lança ApiClientError. */
export async function apiRequest<T extends object>(path: string, init?: RequestInit): Promise<T & { ok: true }> {
  const res = await fetch(path, {
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !json || json.ok === false) {
    const err = json && "error" in json ? json.error : null;
    throw new ApiClientError(err?.code ?? "internal_error", err?.message ?? `HTTP ${res.status}`);
  }
  return json as T & { ok: true };
}

export function useApi<T extends object>(path: string | null) {
  const tError = useTranslations("apiErrors");
  const [data, setData] = useState<(T & { ok: true }) | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const json = (await fetch(path, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        }).then((res) => res.json().catch(() => null))) as ApiEnvelope<T> | null;
        if (cancelled) return;
        if (!json || json.ok === false) {
          const err = json && "error" in json ? json.error : null;
          setErrorCode(err?.code ?? "internal_error");
          setError(tError(err?.code ?? "internal_error", { message: err?.code ?? "http" }));
          setData(null);
        } else {
          setData(json);
          setErrorCode(null);
          setError(null);
        }
        setLoading(false);
      } catch {
        if (!cancelled) {
          setErrorCode("internal_error");
          setError(tError("internal_error", { message: "network" }));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [path, tick, tError]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { data, errorCode, error, loading, refetch };
}

/** Código do erro de mutação — o componente traduz via tApi(code, { message: code }). */
export function apiErrorCode(err: unknown): string {
  if (err instanceof ApiClientError) return err.code;
  return "internal_error";
}
