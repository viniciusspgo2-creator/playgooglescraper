"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { springTransition } from "@/lib/motion";

/**
 * Reveal on-scroll com spring da marca. Em prefers-reduced-motion,
 * mantém apenas fade curto (sem deslocamento).
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
}) {
  const reduced = useReducedMotion();
  const MotionTag = motion[as];

  return (
    <MotionTag
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, ...(reduced ? {} : { y: 0 }) }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ ...springTransition, delay: reduced ? 0 : delay }}
    >
      {children}
    </MotionTag>
  );
}
