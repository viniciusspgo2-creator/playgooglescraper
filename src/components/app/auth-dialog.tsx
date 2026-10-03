"use client";

/**
 * AuthDialog — login, criação de conta e aceite de convite em um único diálogo.
 * Validação local com Zod (schemas compartilhados) + códigos de erro traduzidos.
 */
import { Loader2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useSession, type SessionData } from "@/components/app/session";
import { apiErrorCode, apiRequest } from "@/components/app/use-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppLocale } from "@/i18n/provider";
import { acceptInviteSchema, loginSchema, registerSchema } from "@/shared/schemas";
import { analyticsEvents } from "@/lib/analytics";
import { toast } from "sonner";

type InvitePreview = { email: string; tenantName: string; expiresAt: string };

export function AuthDialog() {
  const t = useTranslations("auth");
  const tApi = useTranslations("apiErrors");
  const { authOpen, closeAuth, authMode, inviteToken, setSession } = useSession();
  const { setLocale } = useAppLocale();

  const mode = authMode === "invite" && !inviteToken ? "login" : authMode;

  const [working, setWorking] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [inviteState, setInviteState] = useState<"loading" | "ok" | "invalid">("loading");

  // Remonta os formulários a cada abertura/troca de modo → campos sempre limpos.
  const formKey = `${mode}-${authOpen ? "open" : "closed"}`;

  // Limpa o erro sempre que o diálogo abre/muda de modo.
  useEffect(() => {
    if (!authOpen) return;
    const id = requestAnimationFrame(() => {
      setFormError(null);
      setWorking(false);
    });
    return () => cancelAnimationFrame(id);
  }, [authOpen, mode]);

  // Prévia do convite (?invite=…): busca tenant/e-mail para o usuário confirmar.
  useEffect(() => {
    if (mode !== "invite" || !inviteToken || !authOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/auth/invite-info?token=${encodeURIComponent(inviteToken)}`);
        const json = (await res.json().catch(() => null)) as
          | { ok: true; invite: InvitePreview }
          | { ok: false; error: { code: string } }
          | null;
        if (cancelled) return;
        if (res.ok && json && json.ok) {
          setInvite(json.invite);
          setInviteState("ok");
        } else {
          setInviteState("invalid");
        }
      } catch {
        if (!cancelled) setInviteState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, inviteToken, authOpen]);

  function onAuthSuccess(
    session: SessionData,
    mode: "login" | "signup" | "invite",
  ): void {
    analyticsEvents.formSubmit(mode === "invite" ? "invite_accept" : "auth_dialog");
    if (mode === "login") analyticsEvents.login("email");
    else analyticsEvents.signUp(mode);
    setSession(session);
    setLocale((session.user.locale as "pt-BR" | "en-US" | "es-ES") ?? "pt-BR");
    closeAuth();
    // Limpa ?invite= da URL após uso.
    if (mode === "invite" && window.location.search.includes("invite=")) {
      window.history.replaceState({}, "", "/");
    }
    toast.success(mode === "invite" ? t("welcomeInvite") : t("welcome", { name: session.user.name }));
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = loginSchema.safeParse({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (!parsed.success) {
      setFormError(t(parsed.error.issues[0]?.path[0] === "email" ? "errEmail" : "errPassword"));
      return;
    }
    setWorking(true);
    setFormError(null);
    try {
      const res = await apiRequest<{ session: SessionData }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      onAuthSuccess(res.session, "login");
    } catch (err) {
      setFormError(tApi(apiErrorCode(err), { message: apiErrorCode(err) }));
      setWorking(false);
    }
  }

  async function handleSignup(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password !== confirm) {
      setFormError(t("errPasswordMismatch"));
      return;
    }
    const parsed = registerSchema.safeParse({
      name: String(form.get("name") ?? ""),
      company: String(form.get("company") ?? ""),
      email: String(form.get("email") ?? ""),
      password,
    });
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      setFormError(t(field === "name" ? "errName" : field === "company" ? "errCompany" : field === "email" ? "errEmail" : "errPassword"));
      return;
    }
    setWorking(true);
    setFormError(null);
    try {
      const res = await apiRequest<{ session: SessionData }>("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      onAuthSuccess(res.session, "signup");
    } catch (err) {
      setFormError(tApi(apiErrorCode(err), { message: apiErrorCode(err) }));
      setWorking(false);
    }
  }

  async function handleInvite(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!inviteToken) return;
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password !== confirm) {
      setFormError(t("errPasswordMismatch"));
      return;
    }
    const parsed = acceptInviteSchema.safeParse({
      token: inviteToken,
      name: String(form.get("name") ?? ""),
      password,
    });
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      setFormError(t(field === "name" ? "errName" : "errPassword"));
      return;
    }
    setWorking(true);
    setFormError(null);
    try {
      const res = await apiRequest<{ session: SessionData }>("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      onAuthSuccess(res.session, "invite");
    } catch (err) {
      setFormError(tApi(apiErrorCode(err), { message: apiErrorCode(err) }));
      setWorking(false);
    }
  }

  const title = mode === "login" ? t("loginTitle") : mode === "signup" ? t("signupTitle") : t("inviteTitle");
  const subtitle =
    mode === "login"
      ? t("loginSubtitle")
      : mode === "signup"
        ? t("signupSubtitle")
        : t("inviteSubtitle", { tenant: invite?.tenantName ?? "…" });

  return (
    <Dialog open={authOpen} onOpenChange={(open) => (!open ? closeAuth() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        {mode === "invite" && inviteState === "invalid" ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {t("inviteInvalid")}
          </p>
        ) : (
          <div className="space-y-4" key={formKey}>
            {mode === "invite" && inviteState === "loading" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> {t("inviteLoading")}
              </p>
            )}
            {mode === "invite" && invite && (
              <p className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <ShieldCheck className="size-4 text-primary" aria-hidden />
                {t("inviteFor", { email: invite.email })}
              </p>
            )}

            {mode === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <Field label={t("emailLabel")} name="email" type="email" autoComplete="email" required />
                <Field label={t("passwordLabel")} name="password" type="password" autoComplete="current-password" required />
                <Submit working={working} label={t("loginCta")} workingLabel={t("working")} />
              </form>
            )}

            {mode === "signup" && (
              <form onSubmit={handleSignup} className="space-y-4">
                <Field label={t("nameLabel")} name="name" autoComplete="name" required />
                <Field label={t("companyLabel")} name="company" autoComplete="organization" required />
                <Field label={t("emailLabel")} name="email" type="email" autoComplete="email" required />
                <Field
                  label={t("passwordLabel")}
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  hint={t("passwordHint")}
                />
                <Field label={t("confirmLabel")} name="confirm" type="password" autoComplete="new-password" required />
                <Submit working={working} label={t("signupCta")} workingLabel={t("working")} />
              </form>
            )}

            {mode === "invite" && invite && (
              <form onSubmit={handleInvite} className="space-y-4">
                <Field label={t("nameLabel")} name="name" autoComplete="name" required />
                <Field
                  label={t("passwordLabel")}
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  hint={t("passwordHint")}
                />
                <Field label={t("confirmLabel")} name="confirm" type="password" autoComplete="new-password" required />
                <Submit working={working} label={t("inviteCta")} workingLabel={t("working")} />
              </form>
            )}

            {formError && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {formError}
              </p>
            )}

            <div className="pt-1 text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <ModeLink label={t("toSignup")} target="signup" />
              ) : mode === "signup" ? (
                <ModeLink label={t("toLogin")} target="login" />
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModeLink({ label, target }: { label: string; target: "login" | "signup" }) {
  const { openAuth } = useSession();
  return (
    <button
      type="button"
      onClick={() => openAuth(target)}
      className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      {label}
    </button>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
}) {
  const id = `auth-${name}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type={type} autoComplete={autoComplete} required={required} className="min-h-11" />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Submit({ working, label, workingLabel }: { working: boolean; label: string; workingLabel: string }) {
  return (
    <Button type="submit" disabled={working} className="min-h-11 w-full bg-primary font-semibold text-primary-foreground">
      {working ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden /> {workingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}
