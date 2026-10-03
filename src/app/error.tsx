"use client";

import { useEffect } from "react";

/**
 * Error boundary da rota: em vez da tela branca "Application error", mostra a
 * mensagem real do erro (facilita o diagnóstico) e permite recuperar a sessão.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui-error]", error);
  }, [error]);

  async function logoutAndReload(): Promise<void> {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignora: o reload abaixo tenta de qualquer forma
    }
    window.location.href = "/";
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 560, width: "100%" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Algo deu errado ao carregar o painel</h1>
        <p style={{ fontSize: 14, opacity: 0.75, marginBottom: 12 }}>Tire um print desta tela e envie para o suporte.</p>
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, background: "rgba(127,127,127,.15)", padding: 12, borderRadius: 8, marginBottom: 16 }}>
          {error.message || "Erro desconhecido"}
          {error.digest ? "\n\ndigest: " + error.digest : ""}
        </pre>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => reset()} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #888", cursor: "pointer" }}>
            Tentar de novo
          </button>
          <button type="button" onClick={() => void logoutAndReload()} style={{ padding: "10px 16px", borderRadius: 8, border: 0, background: "#FF6B1A", color: "#fff", cursor: "pointer" }}>
            Sair e recarregar
          </button>
        </div>
      </div>
    </main>
  );
}
