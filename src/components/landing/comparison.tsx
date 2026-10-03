"use client";

import { Check, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Reveal } from "./reveal";
import { Section, SectionHeading } from "./section";

export function Comparison() {
  const t = useTranslations("comparison");
  const rows = t.raw("rows") as { feature: string; us: string; them: string }[];

  return (
    <Section ariaLabel={t("title")} className="bg-muted/40">
      <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />

      <Reveal delay={0.1} className="mt-12">
        <div className="overflow-x-auto rounded-2xl border bg-card scrollbar-thin">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="min-w-[180px] text-foreground"></TableHead>
                <TableHead className="min-w-[240px]">
                  <span className="bg-brand-gradient inline-block rounded-lg px-3 py-1 text-xs font-bold text-white">
                    {t("thUs")}
                  </span>
                </TableHead>
                <TableHead className="min-w-[220px] text-muted-foreground">
                  {t("thThem")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.feature}>
                  <TableCell className="font-medium text-foreground">{row.feature}</TableCell>
                  <TableCell>
                    <span className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-status-closed" aria-hidden />
                      {row.us}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Minus className="mt-0.5 size-4 shrink-0 text-status-waiting" aria-hidden />
                      {row.them}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Reveal>
    </Section>
  );
}
