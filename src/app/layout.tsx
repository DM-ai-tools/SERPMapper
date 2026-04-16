import type { Metadata } from "next";
import "./globals.css";

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
      <body className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white/90 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 font-black text-lg text-gray-900">
              <span className="text-brand-600">SERPMapper</span>
            </a>
            <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600">
              <a href="/#how-it-works" className="hover:text-gray-900 transition-colors">
                How it works
              </a>
              <a href="/blog" className="hover:text-gray-900 transition-colors">
                Blog
              </a>
              <a
                href="https://dotmappers.in/book"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-brand-600 text-white font-semibold px-4 py-1.5 rounded-lg
                           hover:bg-brand-700 transition-colors"
              >
                Book a Free Call
              </a>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-gray-200 bg-white mt-20 py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-400">
            <p>
              SERPMapper is a free tool by{" "}
              <a
                href="https://dotmappers.in"
                className="text-brand-600 hover:text-brand-700"
                target="_blank"
                rel="noopener noreferrer"
              >
                DotMappers IT Pvt Ltd
              </a>
            </p>
            <p className="mt-1">
              <a href="/privacy" className="hover:text-gray-600">Privacy</a>
              {" · "}
              <a href="/terms" className="hover:text-gray-600">Terms</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
