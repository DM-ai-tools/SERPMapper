"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const KEYWORD_SUGGESTIONS = [
  "plumber",
  "electrician",
  "dentist",
  "cleaner",
  "mechanic",
  "painter",
  "locksmith",
  "roofer",
  "landscaper",
];

export default function InputForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUrl = url.trim();
    const trimmedKeyword = keyword.trim();
    const trimmedCity = city.trim();

    if (!trimmedUrl || !trimmedKeyword || !trimmedCity) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    const params = new URLSearchParams({
      url: trimmedUrl,
      keyword: trimmedKeyword,
      city: trimmedCity,
    });
    router.push(`/tool?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8 space-y-6"
    >
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Business Website URL
        </label>
        <input
          type="url"
          required
          placeholder="https://yourwebsite.com.au"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Primary Service Keyword
        </label>
        <input
          type="text"
          required
          placeholder="e.g. plumber, dentist, electrician"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          list="keyword-suggestions"
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
        <datalist id="keyword-suggestions">
          {KEYWORD_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          City / Suburb
        </label>
        <input
          type="text"
          required
          placeholder="e.g. Melbourne, Sydney, Brisbane"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400
                     focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed
                   text-white font-semibold py-4 rounded-xl text-lg transition-colors duration-150"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Loading...
          </span>
        ) : (
          "Check My Google Visibility"
        )}
      </button>

      <p className="text-center text-xs text-gray-400">
        Free. No credit card. Results in under 60 seconds.
      </p>
    </form>
  );
}
