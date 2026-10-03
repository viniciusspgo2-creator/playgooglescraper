/**
 * Renderizador inline para textos de conteúdo: [link](href), **negrito** e
 * `código` — sem dangerouslySetInnerHTML (seguro e tipado).
 * Links internos relativos (ex.: /blog/…) ficam como âncoras ricas de
 * entity-linking; externos ganham rel="noopener" (target em quem decidir usar).
 */
import type { ReactNode } from "react";

const INLINE_RE = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined && match[2] !== undefined) {
      const href = match[2];
      const external = href.startsWith("http");
      nodes.push(
        <a
          key={key++}
          href={href}
          className="font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary"
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {match[1]}
        </a>,
      );
    } else if (match[3] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {match[3]}
        </strong>,
      );
    } else if (match[4] !== undefined) {
      nodes.push(
        <code key={key++} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
          {match[4]}
        </code>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
