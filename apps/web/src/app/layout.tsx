import "@envelope/ui/globals.css";
import { Toaster } from "@envelope/ui/components/sonner";
import { TooltipProvider } from "@envelope/ui/components/tooltip";
import { cn } from "@envelope/ui/lib/utils";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Thai } from "next/font/google";
import type { ReactNode } from "react";
import { preconnect } from "react-dom";
import { ThemeProvider } from "@/components/theme-provider";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-latin",
});

// Thai legal terms (zone codes such as ย.10, clause titles) render in the same family.
const thai = IBM_Plex_Sans_Thai({
  subsets: ["thai"],
  weight: ["400", "500", "600"],
  variable: "--font-thai",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: { default: "Bangkok Plot Envelope", template: "%s · Bangkok Plot Envelope" },
  description:
    "See what you can build on a Bangkok plot: the rules that apply, the allowed 3D envelope and concept designs.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1714" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // The basemap's style, tiles and fonts all come from here; open the connection (DNS and TLS,
  // which can take seconds on a slow network) while the page's own scripts load.
  preconnect("https://tiles.openfreemap.org", { crossOrigin: "anonymous" });
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans antialiased", sans.variable, thai.variable, mono.variable)}
    >
      <body className="min-h-dvh">
        <ThemeProvider>
          <TooltipProvider>
            {children}
            <Toaster richColors position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
