import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SERPMapper — Local Search Visibility Heat Map",
  description:
    "See exactly which suburbs you rank in on Google Maps — free. Enter your URL and keyword to get a colour-coded suburb-by-suburb visibility map in under 60 seconds.",
  keywords: [
    "local SEO checker Australia",
    "check Google ranking by suburb",
    "Google Maps ranking tool Australia",
    "local search visibility",
    "suburb SEO checker",
  ],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://serpmap.com.au"),
  openGraph: {
    title: "SERPMapper — Local Search Visibility Heat Map",
    description:
      "Can people in your city find you on Google? See your suburb-by-suburb visibility map in 60 seconds. Free.",
    type: "website",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: "SERPMapper — Local Search Visibility Heat Map",
    description: "See exactly which suburbs you rank in on Google Maps — free.",
  },
  icons: {
    icon: "/Traffic-Radius-Logo.webp",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-AU">
      <head>
        {/* Leaflet CSS loaded via globals.css import */}
      </head>
      <body
        className={`${sans.className} min-h-screen flex flex-col antialiased text-slate-900 bg-[var(--page-bg)]`}
      >
        <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/75 backdrop-blur-md supports-[backdrop-filter]:bg-white/65 shadow-sm shadow-slate-900/[0.04]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 md:h-16 flex items-center justify-between gap-3">
            <a
              href="/"
              className="flex items-center gap-2 group"
              aria-label="SERPMapper home"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/25 ring-1 ring-white/20">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 3L4 8v8l8 5 8-5V8l-8-5z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 12v9M12 12L4 7.5M12 12l8-4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="font-extrabold text-lg tracking-tight text-slate-900 group-hover:text-brand-700 transition-colors">
                SERP<span className="text-brand-600">Mapper</span>
              </span>
            </a>

            <div className="flex items-center gap-2 sm:gap-3">
              <nav className="hidden md:flex items-center gap-1 lg:gap-2 text-sm">
                <a href="/#how-it-works" className="nav-link-underline px-3 py-2 rounded-lg">
                  How it works
                </a>
              </nav>
              <a
                href="https://trafficradius.com.au/contact-us/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-brand-500 to-brand-700 px-3.5 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-semibold text-white shadow-md shadow-brand-600/30 ring-1 ring-white/15 transition-all duration-200 hover:shadow-lg hover:shadow-brand-600/35 hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap"
              >
                Strategic call
              </a>
            </div>
          </div>
        </header>

        <main className="flex-1 w-full">{children}</main>

        <footer className="mt-auto border-t border-slate-200/90 bg-white/80 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center text-sm text-slate-500">
            <p>
              SERPMapper is a free tool by{" "}
              <a
                href="https://trafficradius.com.au/"
                className="font-medium text-brand-600 hover:text-brand-700 underline decoration-brand-200 underline-offset-4 hover:decoration-brand-400 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                Traffic radius
              </a>
            </p>
            <p className="mt-3 flex items-center justify-center gap-3 text-xs text-slate-400">
              <a href="/privacy" className="hover:text-slate-700 transition-colors">
                Privacy
              </a>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <a href="/terms" className="hover:text-slate-700 transition-colors">
                Terms
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
