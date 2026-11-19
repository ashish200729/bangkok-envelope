import { type CheckStatus, type Citation, formatCitation, LAWS } from "@envelope/engine";
import { cn } from "@envelope/ui/lib/utils";
import type { ReactNode } from "react";

/** A scheme's letter: solid for a generated scheme, outlined for one the user edited. */
export function SchemeBadge({
  badge,
  custom,
  small,
  className,
}: {
  badge: string;
  custom: boolean;
  small?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-md px-1 font-mono font-semibold",
        small ? "h-5 min-w-5 text-[10px]" : "h-7 min-w-7 text-xs",
        custom ? "border border-primary/50 text-primary" : "bg-foreground text-background",
        className,
      )}
    >
      {badge}
    </span>
  );
}

export function CitationLink({ source, className }: { source: Citation; className?: string }) {
  const law = LAWS[source.law];
  return (
    <a
      href={law.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${law.titleEn} (${law.titleTh})`}
      className={cn(
        "whitespace-nowrap text-muted-foreground text-xs underline decoration-border underline-offset-2 hover:text-foreground hover:decoration-foreground",
        className,
      )}
    >
      {formatCitation(source)}
    </a>
  );
}

const PILL: Record<CheckStatus, { label: string; className: string }> = {
  pass: { label: "Pass", className: "bg-pass/12 text-pass ring-pass/30" },
  fail: { label: "Fail", className: "bg-fail/12 text-fail ring-fail/30" },
  warn: { label: "Check", className: "bg-warn/15 text-warn ring-warn/35" },
  "n/a": { label: "N/A", className: "bg-muted text-muted-foreground ring-border" },
};

export function StatusPill({ status, className }: { status: CheckStatus; className?: string }) {
  const pill = PILL[status];
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex h-5 min-w-11 shrink-0 items-center justify-center rounded-full px-2 font-medium text-[11px] uppercase tracking-wide ring-1 ring-inset",
        pill.className,
        className,
      )}
    >
      {pill.label}
    </span>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {children}
      </h3>
      {aside}
    </div>
  );
}

export function Figure({
  label,
  value,
  detail,
  testId,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="grid min-w-0 content-start gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate font-mono font-semibold text-lg tabular" data-testid={testId}>
        {value}
      </dd>
      {detail && <dd className="text-muted-foreground text-xs leading-snug">{detail}</dd>}
    </div>
  );
}
