"use client";

/**
 * Equipe — membros do tenant, convites (owner/admin) e desativação.
 * Assentos contratados exibidos; servidor valida papéis em toda ação.
 */
import { Loader2, ShieldCheck, UserPlus, Users } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  status: "active" | "invited" | "disabled";
  locale: string;
  lastLoginAt: string | null;
  createdAt: string;
};

type MembersResponse = { members: MemberRow[]; seats: number };
type InviteResponse = { inviteUrl: string; email: string; mailerBackend: string };

function formatWhen(iso: string | null, neverLabel: string): string {
  if (!iso) return neverLabel;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

export function MembersView() {
  const t = useTranslations("members");
  const tApi = useTranslations("apiErrors");
  const tCommon = useTranslations("common");
  const { session } = useSession();
  const membersQ = useApi<MembersResponse>("/api/members");

  const canManage = session?.user.role === "owner" || session?.user.role === "admin";

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [working, setWorking] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState<InviteResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const [disableTarget, setDisableTarget] = useState<MemberRow | null>(null);
  const [disabling, setDisabling] = useState(false);

  const members = membersQ.data?.members ?? [];
  const seats = membersQ.data?.seats ?? session?.tenant.seats ?? 0;
  const inUse = members.filter((m) => m.status !== "disabled").length;

  async function handleInvite(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setWorking(true);
    setFormError(null);
    try {
      const res = await apiRequest<InviteResponse>("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          ...(inviteName.trim() ? { name: inviteName.trim() } : {}),
        }),
      });
      setInviteSent(res);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("member");
      toast.success(t("inviteToast"));
      membersQ.refetch();
    } catch (err) {
      setFormError(tApi(apiErrorCode(err), { message: apiErrorCode(err) }));
    } finally {
      setWorking(false);
    }
  }

  async function handleDisable(): Promise<void> {
    if (!disableTarget) return;
    setDisabling(true);
    try {
      await apiRequest(`/api/members/${disableTarget.id}/disable`, { method: "POST" });
      toast.success(t("disableToast"));
      setDisableTarget(null);
      membersQ.refetch();
    } catch (err) {
      toast.error(tApi(apiErrorCode(err), { message: apiErrorCode(err) }));
    } finally {
      setDisabling(false);
    }
  }

  async function copyLink(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(tCommon("errorGeneric"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {t("subtitle", { used: inUse, seats })}
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setInviteSent(null);
              setFormError(null);
              setInviteOpen(true);
            }}
            className="min-h-11 bg-primary text-primary-foreground"
          >
            <UserPlus className="size-4" aria-hidden />
            {t("invite")}
          </Button>
        )}
      </div>

      <div className="rounded-2xl border bg-card">
        {membersQ.loading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : membersQ.error ? (
          <p className="p-4 text-sm text-destructive">{membersQ.error}</p>
        ) : (
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{m.name}</span>
                    {m.id === session?.user.id && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {t("you")}
                      </Badge>
                    )}
                  </div>
                  <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      m.role === "owner"
                        ? "border-primary/30 text-primary"
                        : undefined
                    }
                  >
                    {t(`roles.${m.role}` as "roles.owner")}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      m.status === "active"
                        ? "border-status-closed/40 text-status-closed"
                        : m.status === "disabled"
                          ? "border-destructive/30 text-destructive"
                          : undefined
                    }
                  >
                    {t(`status.${m.status}` as "status.active")}
                  </Badge>
                </div>
                <div className="w-36 text-right text-xs text-muted-foreground">
                  {t("th.lastLogin")}: {formatWhen(m.lastLoginAt, t("never"))}
                </div>
                {canManage && m.role !== "owner" && m.id !== session?.user.id ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-9 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDisableTarget(m)}
                  >
                    {t("disable")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Diálogo: convidar */}
      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          if (!open) {
            setInviteOpen(false);
            setInviteSent(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("inviteTitle", { org: session?.tenant.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("inviteDesc")}</DialogDescription>
          </DialogHeader>

          {inviteSent ? (
            <div className="space-y-4">
              <p className="flex items-start gap-2 rounded-lg border border-status-closed/40 bg-status-closed/5 px-4 py-3 text-sm">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-status-closed" aria-hidden />
                <span>
                  {t("inviteSentDesc", { backend: inviteSent.mailerBackend })}
                </span>
              </p>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
                <code className="min-w-0 flex-1 break-all font-mono text-xs">{inviteSent.inviteUrl}</code>
                <Button size="sm" variant="outline" className="min-h-9 shrink-0" onClick={() => void copyLink(inviteSent.inviteUrl)}>
                  {copied ? tCommon("close") : tCommon("copy")}
                </Button>
              </div>
              <Button variant="outline" className="min-h-11 w-full" onClick={() => setInviteOpen(false)}>
                {tCommon("close")}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">{t("emailLabel")}</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  className="min-h-11"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-name">{t("inviteName")}</Label>
                <Input
                  id="invite-name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  maxLength={80}
                  className="min-h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("inviteRole")}</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "admin" | "member")}>
                  <SelectTrigger className="min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">{t("roles.member")}</SelectItem>
                    <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formError && (
                <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {formError}
                </p>
              )}
              <Button type="submit" disabled={working || !inviteEmail.trim()} className="min-h-11 w-full bg-primary text-primary-foreground">
                {working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
                {t("inviteCta")}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmação: desativar */}
      <AlertDialog open={!!disableTarget} onOpenChange={(open) => (!open ? setDisableTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{disableTarget ? t("disableTitle", { name: disableTarget.name }) : ""}</AlertDialogTitle>
            <AlertDialogDescription>{t("disableDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disabling}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={disabling}
              onClick={(e) => {
                e.preventDefault();
                void handleDisable();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {disabling ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Users className="size-4" aria-hidden />}
              {t("disableCta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
