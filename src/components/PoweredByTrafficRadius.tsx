"use client";

import { useEffect, useState } from "react";

const LOGO_CANDIDATES = [
  "/Traffic-Radius-Logo.webp",
  "/traffic-radius-logo.webp",
  "/Traffic-Radius-Logo.png",
  "/traffic-radius-logo.png",
  "/logo.webp",
  "/logo.png",
];

export default function PoweredByTrafficRadius() {
  const [logoSrc, setLogoSrc] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      for (const src of LOGO_CANDIDATES) {
        try {
          const res = await fetch(src, { method: "HEAD" });
          if (res.ok) {
            if (mounted) setLogoSrc(src);
            return;
          }
        } catch {
          // Try next candidate.
        }
      }
      if (mounted) setLogoSrc(null);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <a
      href="https://trafficradius.com.au/"
      target="_blank"
      rel="noopener noreferrer"
      className="hidden md:inline-flex items-center gap-2"
      aria-label="Powered by Traffic Radius"
      title="Powered by Traffic Radius"
    >
      <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Powered by</span>
      {logoSrc ? (
        <img
          src={logoSrc}
          alt="Traffic Radius"
          className="h-5 w-auto object-contain"
          onError={() => setLogoSrc(null)}
        />
      ) : (
        <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Traffic Radius</span>
      )}
    </a>
  );
}
