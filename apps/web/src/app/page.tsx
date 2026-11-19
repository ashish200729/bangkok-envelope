import { Badge } from "@envelope/ui/components/badge";
import { PlotMapLoader } from "@/components/map/plot-map-loader";
import { PlotPanel } from "@/components/panel/plot-panel";
import { ThemeToggle } from "@/components/theme-toggle";

export default function PlotPage() {
  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-primary">
            <span className="size-3 rounded-[2px] border-2 border-primary-foreground" />
          </span>
          <h1 className="truncate font-semibold tracking-tight">Bangkok Plot Envelope</h1>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            Zones ย.8–ย.10
          </Badge>
        </div>
        <ThemeToggle />
      </header>
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section aria-label="Map" className="relative h-[60dvh] shrink-0 lg:h-auto lg:flex-1">
          <PlotMapLoader />
        </section>
        <aside
          aria-label="Plot details"
          className="w-full border-t lg:w-[400px] lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-l"
        >
          <PlotPanel />
        </aside>
      </main>
    </div>
  );
}
