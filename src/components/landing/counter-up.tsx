"use client";

import { useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Counter-up com números tabulares (para as métricas não "pularem").
 * Respeita prefers-reduced-motion (vai direto ao valor final, sem animar).
 */
export function CounterUp({
  value,
  duration = 1400,
  suffix = "",
  prefix = "",
  staticValue,
  className,
}: {
  /** Valor numérico final (usado na animação). */
  value: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  /** Texto final exibido (ex.: "4.000+"); se ausente, formata `value`. */
  staticValue?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    if (!inView || reduced) return; // reduced-motion: exibição derivada abaixo.
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimated(Math.round(eased * value));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, value, duration]);

  const display = reduced ? value : animated;

  const formatted = new Intl.NumberFormat().format(display);
  const text = staticValue
    ? display >= value
      ? staticValue
      : formatted
    : formatted;

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
