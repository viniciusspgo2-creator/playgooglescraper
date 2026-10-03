"use client";

/**
 * BillingView (Fase 8) — plano atual, catálogo com preços da landing,
 * checkout real via Stripe quando configurado (senão estado honesto 409),
 * ativação manual (owner, vendas assistidas) e histórico de eventos.
 */
import { BadgeCheck, CreditCard, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useSession } from "@/components/app/session";
import { formatNumber, formatWhen } from "@/components/app/bits";
import { apiErrorCode, apiRequest, useApi } from "@/components/app/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type BillingData = {
  current: { plan: string; leadCredits: number; leadCreditsUsed: number; seats: number; remaining: number };
  catalog: Array<{ key: string; credits: number; seats: number; priceMonthlyBRL: number; priceAnnualBRL: number }>;
  providers: { stripe: boolean; mercadopago: boolean };
  events: Array<{ id: string; provider: string; eventId: string; type: string; processedAt: string }>;
};

export function BillingView() {
  const t = useTranslations("billing");
  const tApi = useTranslations("apiErrors");
  const { session } = useSession();
  const q = useApi<BillingData>("/api/billing");
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [working, setWorking] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);

  const isOwner = session?.user.role === "owner";
  const data = q.data;

  async function checkout(plan: string): Promise<void> {
    setWorking(true);
    try {
      const res = await apiRequest<{ checkoutUrl: string }>("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, cycle }),
      });
      window.location.href = res.checkoutUrl;
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    } finally {
      setWorking(false);
    }
  }

  const usedPct = data && data.current.leadCredits > 0 ? (data.current.leadCreditsUsed / data.current.leadCredits) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {isOwner && <Button variant="outline" className="min-h-11" onClick={() => setActivateOpen(true)}>{t("manualCta")}</Button>}
      </div>

      {q.loading || !data ? (
        <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("currentPlan")}</CardTitle></CardHeader>
              <CardContent>
                <p className="font-display text-2xl font-semibold capitalize">{data.current.plan}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("seats", { count: data.current.seats })}</p>
                {!data.providers.stripe && !data.providers.mercadopago && (
                  <p className="mt-2 text-xs text-muted-foreground">{t("providerUnconfigured")}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("credits")}</CardTitle></CardHeader>
              <CardContent>
                <p className="font-display text-2xl font-semibold tabular-nums">{formatNumber(data.current.remaining)}</p>
                <Progress value={usedPct} className="mt-2 h-1.5" aria-label={t("credits")} />
                <p className="mt-1 text-xs text-muted-foreground">{t("creditsUsed", { used: formatNumber(data.current.leadCreditsUsed), limit: formatNumber(data.current.leadCredits) })}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("events")}</CardTitle></CardHeader>
              <CardContent>
                {data.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noEvents")}</p>
                ) : (
                  <div className="flex max-h-32 flex-col gap-1.5 overflow-y-auto text-xs">
                    {data.events.map((e) => (
                      <div key={e.id} className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{e.provider}</Badge>
                        <span className="truncate">{e.type}</span>
                        <span className="ml-auto whitespace-nowrap text-muted-foreground">{formatWhen(e.processedAt, "")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant={cycle === "monthly" ? "default" : "outline"} className="min-h-10" onClick={() => setCycle("monthly")}>{t("monthly")}</Button>
            <Button size="sm" variant={cycle === "annual" ? "default" : "outline"} className="min-h-10" onClick={() => setCycle("annual")}>{t("annual")}</Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {data.catalog.filter((p) => p.key !== "trial").map((plan) => {
              const isCurrent = data.current.plan === plan.key;
              const price = cycle === "monthly" ? plan.priceMonthlyBRL : plan.priceAnnualBRL;
              return (
                <Card key={plan.key} className={isCurrent ? "border-primary/50" : undefined}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base capitalize">
                      {plan.key}
                      {isCurrent && <BadgeCheck className="size-4 text-[#12B886]" aria-hidden />}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <p className="font-display text-2xl font-semibold tabular-nums">
                      {t("price", { value: (price / 100).toLocaleString(undefined, { minimumFractionDigits: 0 }) })}
                      <span className="text-sm font-normal text-muted-foreground">{t("perMonth")}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{t("planCredits", { credits: formatNumber(plan.credits), seats: plan.seats })}</p>
                    {isOwner && !isCurrent && (
                      <Button className="min-h-11" disabled={working} onClick={() => void checkout(plan.key)}>
                        <CreditCard className="size-4" aria-hidden />
                        {t("checkout")}
                      </Button>
                    )}
                    {isCurrent && <Badge variant="outline" className="w-fit text-[11px]">{t("currentBadge")}</Badge>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <ManualActivationDialog open={activateOpen} onOpenChange={setActivateOpen} onDone={() => void q.refetch()} />
    </div>
  );
}

function ManualActivationDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const t = useTranslations("billing.manual");
  const tApi = useTranslations("apiErrors");
  const [plan, setPlan] = useState("starter");
  const [credits, setCredits] = useState("2000");
  const [seats, setSeats] = useState("1");
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setWorking(true);
    try {
      await apiRequest("/api/billing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, credits: Number(credits), seats: Number(seats), ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      toast.success(t("toast"));
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(tApi(apiErrorCode(err)));
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("plan")}</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">trial</SelectItem>
                  <SelectItem value="starter">starter</SelectItem>
                  <SelectItem value="pro">pro</SelectItem>
                  <SelectItem value="business">business</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="man-credits">{t("credits")}</Label>
              <Input id="man-credits" type="number" min={0} max={1000000} value={credits} onChange={(e) => setCredits(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="man-seats">{t("seats")}</Label>
              <Input id="man-seats" type="number" min={1} max={100} value={seats} onChange={(e) => setSeats(e.target.value)} required />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="man-note">{t("note")}</Label>
            <Input id="man-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button type="submit" className="min-h-11" disabled={working}>
              {working && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
