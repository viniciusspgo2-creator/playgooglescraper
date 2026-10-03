import type { Transition } from "framer-motion";

/**
 * Spring padrão do produto — NADA de linear (spec de identidade visual).
 * Framer Motion: spring {stiffness: 260, damping: 24}.
 */
export const springTransition: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 24,
};

/** Fade curto permitido em prefers-reduced-motion. */
export const reducedFade: Transition = { duration: 0.15, ease: "easeOut" };
