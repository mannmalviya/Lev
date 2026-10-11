import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";

const etbook = localFont({
  variable: "--font-etbook",
  src: [
    { path: "./fonts/et-book-roman-line-figures.woff", weight: "400", style: "normal" },
    { path: "./fonts/et-book-display-italic-old-style-figures.woff", weight: "400", style: "italic" },
    { path: "./fonts/et-book-bold-line-figures.woff", weight: "700", style: "normal" },
  ],
});

const virgil = localFont({ variable: "--font-virgil", src: "./fonts/Virgil.woff2" });

export const metadata: Metadata = {
  title: "System 1 Playground",
  description: "Small local System 1 models vs Jev vs a text LLM, racing in Flappy Bird and Chrome Dino.",
};

const NAV = [
  { href: "/play", label: "Playground" },
  { href: "/results", label: "Results" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${etbook.variable} ${virgil.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <header className="mx-auto w-full max-w-6xl px-4 pt-6 pb-2 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="font-hand text-2xl tracking-wide">
            System 1 <span className="text-orange">Playground</span>
          </Link>
          <nav className="flex gap-2 font-hand text-lg">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="sketch-soft px-3 py-0.5 hover:bg-fill-orange">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16">{children}</main>
        <footer className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted">
          UCSC AI Hackathon · Local AI track · models run on an ASUS GX10
        </footer>
      </body>
    </html>
  );
}
