"use client";

/**
 * AuditView (Fase 6/10) — trilha de auditoria paginada de todas as ações
 * do tenant (append-only). Nomes de usuário e leads resolvidos no servidor.
 */
import { useTranslations } from "next-intl";
import { useState } from "react";

import { formatWhen } from "@/components/app/bits";
import { useApi } from "@/components/app/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ActivityRow = {
  id: string;
  type: string;
  data: Record<string, unknown> | null;
  userName: string | null;
  leadName: string | null;
  createdAt: string;
};

type ActivitiesResponse = { activities: ActivityRow[]; pagination: { page: number; perPage: number; total: number; totalPages: number } };

export function AuditView() {
  const t = useTranslations("audit");
  const [page, setPage] = useState(1);
  const q = useApi<ActivitiesResponse>(`/api/activities?page=${page}&perPage=30`);
  const rows = q.data?.activities ?? [];
  const pagination = q.data?.pagination;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{pagination ? t("subtitle", { count: pagination.total }) : ""}</p>
      </div>
      <Card>
        <CardContent className="p-0">
          {q.loading ? (
            <div className="flex flex-col gap-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="flex flex-col">
              {rows.map((row, i) => (
                <div key={row.id} className={cn("flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm", i > 0 && "border-t")}>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{row.type}</span>
                  <span className="font-medium">{row.userName ?? "—"}</span>
                  {row.leadName && <span className="truncate text-muted-foreground">{row.leadName}</span>}
                  <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{formatWhen(row.createdAt, "")}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" className="min-h-10" disabled={page <= 1} onClick={() => setPage((p) => Math.max(p - 1, 1))}>{t("prev")}</Button>
          <span className="text-sm tabular-nums text-muted-foreground">{t("pageOf", { page: pagination.page, total: pagination.totalPages })}</span>
          <Button variant="outline" size="sm" className="min-h-10" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}>{t("next")}</Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        <Badge variant="outline" className="mr-1.5 text-[10px]">LGPD</Badge>
        {t("lgpdNote")}
      </p>
    </div>
  );
}
