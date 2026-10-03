"use client";

/**
 * Tokens & Conexão — gerador de tokens da extensão (spec: "a extensão ficará
 * disponível dentro do painel do usuário… interligada com o sistema via token").
 * Lista, criação (reveal-once), revogação e teste de conexão ao vivo.
 */
import { Check, Copy, KeyRound, Loader2, PlugZap, Plus, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useSession } from "@/components/app/session";
import { apiErrorCode, apiRequest, useApi } from "@/components/app/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

import { WebhooksCard } from "@/components/app/webhooks-card";

type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  deviceLabel: string | null;
  lastUsedAt: string | null;
  useCount: number;
  revokedAt: string | null;
  createdAt: string;
};

type TokensResponse = { tokens: TokenRow[] };
type CreateResponse = { token: { id: string; name: string; prefix: string; scopes: string[] }; raw: string };

const ALL_SCOPES = ["verify", "leads:read", "leads:write"] as const;
type Scope = (typeof ALL_SCOPES)[number];

type VerifyResult =
  | { ok: true; tenant: { name: string; slug: string }; plan: string; credits: { remaining: number; used: number; limit: number } }
  | { ok: false; code: string };

function formatWhen(iso: string | null, neverLabel: string): string {
  if (!iso) return neverLabel;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

export function TokensView() {
  const t = useTranslations("tokens");
  const tApi = useTranslations("apiErrors");
  const tCommon = useTranslations("common");
  const { session } = useSession();
  const tokensQ = useApi<TokensResponse>("/api/tokens");

  const canManage = session?.user.role === "owner" || session?.user.role === "admin";

  const [createOpen, setCreateOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["verify", "leads:write"]);

  const [revealed, setRevealed] = useState<CreateResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<TokenRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  const [connToken, setConnToken] = useState("");
  const [connWorking, setConnWorking] = useState(false);
  const [connResult, setConnResult] = useState<VerifyResult | null>(null);

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(tCommon("errorGeneric"));
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (name.trim().length < 2 || scopes.length === 0) return;
    setWorking(true);
    setFormError(null);
    try {
      const res = await apiRequest<CreateResponse>("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scopes,
          ...(deviceLabel.trim() ? { deviceLabel: deviceLabel.trim() } : {}),
        }),
      });
      setCreateOpen(false);
      setRevealed(res);
      setName("");
      setDeviceLabel("");
      setScopes(["verify", "leads:write"]);
      toast.success(t("createToast"));
      tokensQ.refetch();
    } catch (err) {
      setFormError(tApi(apiErrorCode(err), { message: apiErrorCode(err) }));
    } finally {
      setWorking(false);
    }
  }

  async function handleRevoke(): Promise<void> {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await apiRequest(`/api/tokens/${revokeTarget.id}`, { method: "DELETE" });
      toast.success(t("revokeToast"));
      setRevokeTarget(null);
      tokensQ.refetch();
    } catch (err) {
      toast.error(tApi(apiErrorCode(err), { message: apiErrorCode(err) }));
    } finally {
      setRevoking(false);
    }
  }

  async function handleConnectionTest(): Promise<void> {
    const token = connToken.trim();
    if (!token) return;
    setConnWorking(true);
    setConnResult(null);
    try {
      const res = await fetch("/api/v1/auth/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => null)) as
        | {
            ok: true;
            tenant: { name: string; slug: string };
            plan: string;
            credits: { remaining: number; used: number; limit: number };
          }
        | { ok: false; error: { code: string } }
        | null;
      if (res.ok && json && json.ok) {
        setConnResult({ ok: true, tenant: json.tenant, plan: json.plan, credits: json.credits });
      } else {
        setConnResult({ ok: false, code: json && "error" in json ? json.error.code : "invalid_token" });
      }
    } catch {
      setConnResult({ ok: false, code: "internal_error" });
    } finally {
      setConnWorking(false);
    }
  }

  const tokens = tokensQ.data?.tokens ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)} className="min-h-11 bg-primary text-primary-foreground">
            <Plus className="size-4" aria-hidden />
            {t("create")}
          </Button>
        )}
      </div>

      {/* Lista de tokens */}
      <div className="rounded-2xl border bg-card">
        {tokensQ.loading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-2/3" />
          </div>
        ) : tokensQ.error ? (
          <p className="p-4 text-sm text-destructive">{tokensQ.error}</p>
        ) : tokens.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <KeyRound className="size-8 text-muted-foreground" aria-hidden />
            <p className="max-w-sm text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-96 scrollbar-thin">
            <ul className="divide-y">
              {tokens.map((token) => (
                <li key={token.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{token.name}</span>
                      {token.revokedAt ? (
                        <Badge variant="outline" className="border-destructive/30 text-destructive">
                          {t("status.revoked")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-status-closed/40 text-status-closed">
                          {t("status.active")}
                        </Badge>
                      )}
                    </div>
                    <code className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                      {token.prefix}
                    </code>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {token.scopes.map((s) => (
                        <Badge key={s} variant="secondary" className="px-1.5 py-0 font-mono text-[10px]">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{t("th.lastUsed")}: {formatWhen(token.lastUsedAt, t("neverUsed"))}</div>
                    <div className="tabular-nums">{t("uses", { count: token.useCount })}</div>
                  </div>
                  {canManage && !token.revokedAt ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-9 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setRevokeTarget(token)}
                    >
                      {t("revoke")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </div>

      {/* Teste de conexão */}
      <div className="rounded-2xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <PlugZap className="size-4 text-primary" aria-hidden />
          {t("connectionTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("connectionDesc")}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            type="password"
            value={connToken}
            onChange={(e) => setConnToken(e.target.value)}
            placeholder={t("connectionPlaceholder")}
            className="min-h-11 flex-1 font-mono text-xs"
            autoComplete="off"
          />
          <Button
            onClick={() => void handleConnectionTest()}
            disabled={connWorking || connToken.trim().length === 0}
            className="min-h-11"
          >
            {connWorking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PlugZap className="size-4" aria-hidden />}
            {t("connectionCta")}
          </Button>
        </div>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {t("endpointLabel")}: POST /api/v1/auth/verify
        </p>
        {connResult?.ok ? (
          <div className="mt-3 rounded-lg border border-status-closed/40 bg-status-closed/5 px-4 py-3 text-sm">
            <p className="font-medium text-status-closed">{t("connectionOk")}</p>
            <p className="mt-1 text-muted-foreground">
              {connResult.tenant.name} · {connResult.plan} ·{" "}
              <span className="tabular-nums">
                {t("creditsRemaining", { remaining: connResult.credits.remaining, limit: connResult.credits.limit })}
              </span>
            </p>
          </div>
        ) : connResult && !connResult.ok ? (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-destructive">
              <ShieldAlert className="size-4" aria-hidden />
              {t("connectionFailed")}
            </p>
            <p className="mt-1 text-destructive/80">{tApi(connResult.code, { message: connResult.code })}</p>
          </div>
        ) : null}
      </div>

      {/* Diálogo: criar token */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDesc")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="token-name">{t("nameLabel")}</Label>
              <Input
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                required
                minLength={2}
                maxLength={60}
                className="min-h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="token-device">{t("deviceLabel")}</Label>
              <Input
                id="token-device"
                value={deviceLabel}
                onChange={(e) => setDeviceLabel(e.target.value)}
                placeholder={t("devicePlaceholder")}
                maxLength={60}
                className="min-h-11"
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("scopesLabel")}</legend>
              {ALL_SCOPES.map((scope) => (
                <label
                  key={scope}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors hover:bg-accent"
                >
                  <Checkbox
                    checked={scopes.includes(scope)}
                    onCheckedChange={(checked) =>
                      setScopes((prev) => (checked ? [...prev, scope] : prev.filter((s) => s !== scope)))
                    }
                    className="mt-0.5"
                  />
                  <span>
                    <code className="font-mono text-xs font-semibold">{scope}</code>
                    <span className="block text-xs text-muted-foreground">{t(`scopeDesc.${scope}` as "scopeDesc.verify")}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {formError && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {formError}
              </p>
            )}
            <Button
              type="submit"
              disabled={working || name.trim().length < 2 || scopes.length === 0}
              className="min-h-11 w-full bg-primary text-primary-foreground"
            >
              {working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
              {t("createCta")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo: reveal-once */}
      <Dialog open={!!revealed} onOpenChange={(open) => (!open ? setRevealed(null) : undefined)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("revealTitle")}</DialogTitle>
            <DialogDescription>{t("revealWarning")}</DialogDescription>
          </DialogHeader>
          {revealed && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
                <code className="min-w-0 flex-1 break-all font-mono text-xs">{revealed.raw}</code>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-9 shrink-0 gap-1.5"
                  onClick={() => void copyText(revealed.raw)}
                >
                  {copied ? <Check className="size-3.5 text-status-closed" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                  {copied ? t("copied") : t("copy")}
                </Button>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">{t("curlTitle")}</p>
                <pre className="mt-2 overflow-x-auto rounded bg-muted/60 p-2.5 font-mono text-[11px] leading-relaxed">
{`curl -X POST ${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/auth/verify \\
  -H "Authorization: Bearer ${revealed.raw}"`}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmação: revogar */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => (!open ? setRevokeTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("revokeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget ? t("revokeDesc", { name: revokeTarget.name }) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={revoking}
              onClick={(e) => {
                e.preventDefault();
                void handleRevoke();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {revoking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("revokeCta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Webhooks de saída (Fase 8) */}
      <WebhooksCard />
    </div>
  );
}
