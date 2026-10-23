import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin", "latin-ext"], axes: ["wdth"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "Launchpad",
  description: "Is anything of mine broken right now?",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1220" },
  ],
};

/* Design contract (impeccable). Kept in the source only, not shipped in the page.
THESIS: The watch log of one builder's fleet. Each check writes one entry, "all well" or the trouble ruled in red. Refuses the screenshot wall and the dot-studded status page.
OWN-WORLD: A deck-log form. Pale log paper by day, night-watch navy by night; navy ink, blue form ruling, red ink only for trouble. Archivo across its widths, tabular figures, ruled ledger columns.
STORY: The owner opens it, reads the entry, knows within a second whether anything is broken and which, and opens any app in one click.
FIRST VIEWPORT: Left, the watch column: LAUNCHPAD form title, checked time, find field, the entry at display size. Right, the ruled ledger of every live app on one screen at 1440.
FORM: Bridge watch log, position 7 of my list, seed 1cb1cdf8. Signature: trouble and all-well entries are ruled in by a drawn pen line.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
*/

// Same storage key and values as the old Launchpad, applied before paint so there is no flash.
const THEME = `try{var t=localStorage.getItem("launchpad-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
