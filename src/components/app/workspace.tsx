"use client";

/**
 * Workspace — painel do usuário (shell de rota única, ADR-003 §D1).
 * Navegação completa (Fases 5–8): Operação (overview/searches/leads/kanban),
 * Growth (whatsapp) e Sistema (extension/tokens/billing/members/audit).
 * Topbar com org/plano/créditos + idioma/tema/menu; Sheet no mobile.
 */
import {
  Coins,
  KeyRound,
  LayoutDashboard,
  Link2,
  ListChecks,
  LogOut,
  MapPinned,
  MessageSquareText,
  Receipt,
  ScrollText,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useSession } from "@/components/app/session";
import { AuditView } from "@/components/app/audit-view";
import { BillingView } from "@/components/app/billing-view";
import { ExtensionView } from "@/components/app/extension-view";
import { KanbanView } from "@/components/app/kanban-view";
import { LeadsView } from "@/components/app/leads-view";
import { MembersView } from "@/components/app/members-view";
import { OverviewView } from "@/components/app/overview-view";
import { SearchesView } from "@/components/app/searches-view";
import { TokensView } from "@/components/app/tokens-view";
import { WhatsAppView } from "@/components/app/whatsapp-view";
import { LanguageSwitcher, ThemeToggle } from "@/components/shared/preferences";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type WorkspaceTab =
  | "overview"
  | "searches"
  | "leads"
  | "kanban"
  | "whatsapp"
  | "extension"
  | "tokens"
  | "billing"
  | "members"
  | "audit";

const NAV_GROUPS: Array<{ label: string; items: Array<{ id: WorkspaceTab; key: string; icon: React.ComponentType<{ className?: string }> }> }> = [
  {
    label: "operation",
    items: [
      { id: "overview", key: "overview", icon: LayoutDashboard },
      { id: "searches", key: "searches", icon: MapPinned },
      { id: "leads", key: "leads", icon: Users },
      { id: "kanban", key: "kanban", icon: ListChecks },
    ],
  },
  {
    label: "growth",
    items: [{ id: "whatsapp", key: "whatsapp", icon: MessageSquareText }],
  },
  {
    label: "system",
    items: [
      { id: "extension", key: "extension", icon: Link2 },
      { id: "tokens", key: "tokens", icon: KeyRound },
      { id: "billing", key: "billing", icon: Receipt },
      { id: "members", key: "members", icon: Users },
      { id: "audit", key: "audit", icon: ScrollText },
    ],
  },
];

export function Workspace() {
  const t = useTranslations("workspace");
  const tCommon = useTranslations("common");
  const { session, setSession, setView } = useSession();
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (!session) return null;

  const creditsRemaining = Math.max(session.tenant.leadCredits - session.tenant.leadCreditsUsed, 0);

  async function logout(): Promise<void> {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // mesmo se falhar, a sessão local é limpa
    }
    setSession(null);
    setView("landing");
    toast.success(t("logout") + " · " + tCommon("brand"));
  }

  function navigate(next: string): void {
    setTab(next as WorkspaceTab);
    setMobileNavOpen(false);
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          {/* Mobile: navegação */}
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-10 md:hidden" aria-label={t("openMenu")}>
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetTitle className="sr-only">{tCommon("brand")}</SheetTitle>
              <nav className="mt-6 flex flex-col gap-4" aria-label={tCommon("brand")}>
                {NAV_GROUPS.map((group) => (
                  <div key={group.label} className="flex flex-col gap-1">
                    <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`navGroup.${group.label}` as "navGroup.operation")}</p>
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigate(item.id)}
                        aria-current={tab === item.id ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors",
                          tab === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <item.icon className="size-4" aria-hidden />
                        {t(`nav.${item.key}` as "nav.overview")}
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <button
            type="button"
            onClick={() => setView("landing")}
            className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-primary"
            aria-label={t("backToSite")}
          >
            <Image src="/brand/logo.png" alt="" width={30} height={30} className="size-8 rounded-lg object-contain" />
            <span className="font-display hidden text-sm font-semibold tracking-tight sm:inline">Play Google Scraper</span>
          </button>

          <div className="mx-2 hidden h-5 w-px bg-border sm:block" aria-hidden />

          <div className="hidden min-w-0 flex-col sm:flex">
            <span className="truncate text-sm font-medium leading-tight">{session.tenant.name}</span>
            <span className="text-xs leading-tight text-muted-foreground">{t("planNames." + (session.tenant.plan as "trial"))}</span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Badge variant="outline" className="hidden gap-1.5 border-primary/30 bg-primary/5 py-1 pl-2 pr-2.5 text-xs font-medium text-primary md:inline-flex">
              <Coins className="size-3.5" aria-hidden />
              <span className="tabular-nums">{creditsRemaining.toLocaleString()}</span>
              <span className="text-primary/70">{t("creditsLabel")}</span>
            </Badge>
            <LanguageSwitcher />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="min-h-11 gap-2 px-2" aria-label={session.user.name}>
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white">
                    {session.user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden max-w-28 truncate text-sm md:inline">{session.user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="truncate">{session.user.name}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">{session.user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setView("landing")} className="min-h-11 cursor-pointer">{t("backToSite")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void logout()} className="min-h-11 cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="size-4" aria-hidden />
                  {t("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
        <aside className="sticky top-20 hidden h-fit w-56 shrink-0 flex-col gap-4 md:flex" aria-label={tCommon("brand")}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`navGroup.${group.label}` as "navGroup.operation")}</p>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  aria-current={tab === item.id ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                    tab === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                  {t(`nav.${item.key}` as "nav.overview")}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <main className="min-w-0 flex-1">
          {tab === "overview" && <OverviewView onNavigate={navigate} />}
          {tab === "searches" && <SearchesView />}
          {tab === "leads" && <LeadsView />}
          {tab === "kanban" && <KanbanView />}
          {tab === "whatsapp" && <WhatsAppView />}
          {tab === "extension" && <ExtensionView />}
          {tab === "tokens" && <TokensView />}
          {tab === "billing" && <BillingView />}
          {tab === "members" && <MembersView />}
          {tab === "audit" && <AuditView />}
        </main>
      </div>
    </div>
  );
}
