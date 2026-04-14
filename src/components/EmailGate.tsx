"use client";

import { useState } from "react";

interface EmailGateProps {
  reportId: string;
  visibilityScore: number;
  onUnlocked: (ctaUrl: string, topMissedSuburb: string) => void;
}

export default function EmailGate({ reportId, visibilityScore, onUnlocked }: EmailGateProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, report_id: reportId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      onUnlocked(data.ctaUrl, data.topMissedSuburb);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-auto text-center space-y-5">
      {/* Score teaser */}
      <div>
        <div className="text-5xl font-black text-gray-900">
          {visibilityScore}
          <span className="text-2xl font-semibold text-gray-400"> / 100</span>
        </div>
        <p className="text-sm text-gray-500 mt-1">Visibility Score</p>
      </div>

      <div className="border-t border-gray-100" />

      <div>
        <h2 className="text-xl font-bold text-gray-900">Your map is ready.</h2>
        <p className="text-gray-600 mt-2 text-sm leading-relaxed">
          Enter your email to unlock the full suburb-by-suburb map — and see exactly where
          your competitors are winning.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          required
          placeholder="you@yourbusiness.com.au"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
        {error && <p className="text-sm text-red-600 text-left">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60
                     text-white font-semibold py-3 rounded-xl transition-colors duration-150"
        >
          {loading ? "Unlocking..." : "Unlock Full Map — Free"}
        </button>
      </form>

      <p className="text-xs text-gray-400">
        No spam. Unsubscribe anytime. We send 3 emails, that is it.
      </p>
    </div>
  );
}
