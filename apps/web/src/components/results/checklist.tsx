"use client";

import type { Check } from "@envelope/engine";
import { cn } from "@envelope/ui/lib/utils";
import { formatCheckFigures } from "@/lib/results/format";
import { CitationLink, StatusPill } from "./bits";

export function checkCounts(checks: readonly Check[]) {
  return {
    pass: checks.filter((c) => c.status === "pass").length,
    fail: checks.filter((c) => c.status === "fail").length,
    warn: checks.filter((c) => c.status === "warn").length,
  };
}

/** "9 pass · 1 fail", with "· 1 to check" for warnings. */
export function countsText(checks: readonly Check[]): string {
  const { pass, fail, warn } = checkCounts(checks);
  return [`${pass} pass`, `${fail} fail`, warn ? `${warn} to check` : null]
    .filter(Boolean)
    .join(" · ");
}

/** A design's checklist: every check with its plain message, figures and legal source. */
export function Checklist({
  checks,
  dense = false,
  className,
}: {
  checks: readonly Check[];
  dense?: boolean;
  className?: string;
}) {
  const order = { fail: 0, warn: 1, pass: 2, "n/a": 3 } as const;
  const sorted = [...checks].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <ul
      className={cn("grid divide-y rounded-lg border bg-card", className)}
      data-testid="checklist"
    >
      {sorted.map((check) => {
        const figures = formatCheckFigures(check);
        return (
          <li
            key={`${check.ruleId}-${check.message}`}
            data-testid={`check-${check.ruleId}`}
            data-status={check.status}
            className={cn(
              "flex items-start gap-2.5 px-3",
              dense ? "py-2" : "py-2.5",
              check.status === "fail" && "bg-fail/5",
            )}
          >
            <StatusPill status={check.status} className="mt-0.5" />
            <div className="grid min-w-0 gap-0.5">
              <p className="text-sm leading-snug">{check.message}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
                <span>{check.label}</span>
                {figures && <span className="font-mono tabular">{figures}</span>}
                <CitationLink source={check.source} />
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
