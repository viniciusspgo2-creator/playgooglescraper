"use client";

/**
 * ExtensionView (Fase 4 na UI) — download do pacote MV3 com apiBase injetado,
 * passo a passo de instalação, conexão por token (paste ou embutida no zip)
 * e status de uso dos tokens (lastUsedAt) como prova de interligação.
 */
import { Chrome, Download, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { apiErrorCode, apiRequest, useApi } from "@/components/app/use-api";
import { formatWhen } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { analyticsEvents } from "@/lib/analytics";

type TokenRow = { id: string; name: string; prefix: string; lastUsedAt: string | null; useCount: number; revokedAt: string | null };

export function ExtensionView() {
  const t = useTranslations("extension");
  const tApi = useTranslations("apiErrors");
  const tokensQ = useApi<{ tokens: TokenRow[] }>("/api/tokens");
  const [downloading, setDownloading] = useState(false);

  async function download(): Promise<void> {
    analyticsEvents.extensionDownload();
    setDownloading(true);
    try {
      const res = await fetch("/api/extension/download", { method: "GET" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { code: string } } | null;
        throw Object.assign(new Error(json?.error?.code ?? "internal_error"), { code: json?.error?.code });
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "play-google-scraper-extension-v1.0.0.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("downloadToast"));
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    } finally {
      setDownloading(false);
    }
  }

  const activeTokens = (tokensQ.data?.tokens ?? []).filter((tk) => !tk.revokedAt);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Chrome className="size-5 text-primary" aria-hidden />
            {t("downloadCard")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t("downloadDesc")}</p>
          <Button className="min-h-12 w-fit" onClick={() => void download()} disabled={downloading}>
            {downloading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : <Download className="size-4" aria-hidden />}
            {t("downloadCta")}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">1 · {t("steps.install")}</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>{t("steps.installText")}</p>
            <code className="mt-2 block rounded bg-muted px-2 py-1 text-xs">chrome://extensions</code>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">2 · {t("steps.load")}</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{t("steps.loadText")}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">3 · {t("steps.connect")}</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{t("steps.connectText")}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-5 text-[#12B886]" aria-hidden />
            {t("connectionCard")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tokensQ.loading ? (
            <Skeleton className="h-24" />
          ) : activeTokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noTokens")}</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{t("connectionHint")}</p>
              {activeTokens.map((tk) => (
                <div key={tk.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                  <span className={`size-2 rounded-full ${tk.lastUsedAt ? "bg-[#12B886]" : "bg-muted-foreground/40"}`} aria-hidden />
                  <span className="font-medium">{tk.name}</span>
                  <code className="text-xs text-muted-foreground">{tk.prefix}</code>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {tk.lastUsedAt ? t("lastUsed", { when: formatWhen(tk.lastUsedAt, ""), count: tk.useCount }) : t("neverUsed")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground">
          <p>{t("lgpdNote")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
