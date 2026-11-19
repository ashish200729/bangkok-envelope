import { Badge } from "@envelope/ui/components/badge";
import { Separator } from "@envelope/ui/components/separator";
import type { Metadata } from "next";
import { StatusBoard } from "@/components/status-board";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "System status" };

const swatches = [
  ["Pass", "bg-pass"],
  ["Fail", "bg-fail"],
  ["Warn", "bg-warn"],
  ["Envelope", "bg-envelope"],
  ["ย. low", "bg-zone-residential-low"],
  ["ย. medium", "bg-zone-residential-mid"],
  ["ย. high", "bg-zone-residential-high"],
  ["พ. commercial", "bg-zone-commercial"],
] as const;

export default function StatusPage() {
  return (
    <div className="mx-auto grid max-w-4xl gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="grid gap-2">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-8 place-items-center rounded-md bg-primary">
              <span className="size-3.5 rounded-[2px] border-2 border-primary-foreground" />
            </span>
            <h1 className="font-semibold text-xl tracking-tight">Bangkok Plot Envelope</h1>
            <Badge variant="secondary">Starter</Badge>
          </div>
          <p className="max-w-prose text-muted-foreground text-sm">
            The tool isn&apos;t built yet. This page checks that each layer of the stack is wired
            up: web app, API, database and sign-in.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <StatusBoard />

      <Separator />

      <section className="grid gap-3" aria-labelledby="tokens">
        <h2 id="tokens" className="font-medium text-muted-foreground text-sm">
          Theme tokens
        </h2>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {swatches.map(([label, bg]) => (
            <li key={label} className="flex items-center gap-2">
              <span aria-hidden className={`size-3.5 rounded-sm ${bg}`} />
              {label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
