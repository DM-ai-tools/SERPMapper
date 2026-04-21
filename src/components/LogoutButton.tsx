"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const pathname = usePathname();

  if (pathname === "/login") {
    return null;
  }

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-2 md:px-4 md:py-2.5 text-xs md:text-sm font-semibold text-slate-700 transition-colors duration-200 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
    >
      {busy ? "Logging out..." : "Logout"}
    </button>
  );
}
