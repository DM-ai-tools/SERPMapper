"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SearchableCombobox, { type ComboboxOption } from "@/components/SearchableCombobox";

/** Common service keywords — users can still type anything */
const KEYWORD_PRESETS = [
  "plumber",
  "electrician",
  "dentist",
  "cleaner",
  "mechanic",
  "painter",
  "locksmith",
  "roofer",
  "landscaper",
  "hvac",
  "concreter",
  "builder",
  "carpenter",
  "tiler",
  "pest control",
  "pool service",
  "solar installer",
  "removalist",
  "beauty salon",
  "hairdresser",
  "physiotherapist",
  "veterinarian",
  "accountant",
  "lawyer",
];

const AU_CITY_OPTIONS: ComboboxOption[] = [
  { value: "Melbourne", label: "Melbourne", searchText: "melbourne vic victoria" },
  { value: "Sydney", label: "Sydney", searchText: "sydney nsw new south wales" },
  { value: "Brisbane", label: "Brisbane", searchText: "brisbane qld queensland" },
  { value: "Canberra", label: "Canberra", searchText: "canberra act australian capital territory" },
  { value: "Perth", label: "Perth", searchText: "perth wa western australia" },
  { value: "Adelaide", label: "Adelaide", searchText: "adelaide sa south australia" },
  { value: "Hobart", label: "Hobart", searchText: "hobart tas tasmania" },
  { value: "Darwin", label: "Darwin", searchText: "darwin nt northern territory" },
  { value: "Gold Coast", label: "Gold Coast", searchText: "gold coast qld queensland" },
  { value: "Newcastle", label: "Newcastle", searchText: "newcastle nsw new south wales" },
];

function keywordOptions(): ComboboxOption[] {
  return KEYWORD_PRESETS.map((k) => {
    const label = k
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return {
      value: label,
      label,
      searchText: k.toLowerCase(),
    };
  });
}

export default function InputForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keywordOpts = useMemo(keywordOptions, []);

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

  const fieldClass =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900 shadow-sm " +
    "placeholder:text-slate-400 transition-all duration-200 " +
    "hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15";

  return (
    <form
      onSubmit={handleSubmit}
      className="card-elevated w-full max-w-2xl mx-auto p-6 sm:p-8 space-y-6 text-left"
    >
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <GlobeIcon />
          </span>
          Business website
        </label>
        <input
          type="url"
          required
          placeholder="https://yourwebsite.com.au"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={fieldClass}
          autoComplete="url"
        />
      </div>

      <SearchableCombobox
        label="Primary service"
        icon={<SearchIcon />}
        name="keyword"
        value={keyword}
        onChange={setKeyword}
        options={keywordOpts}
        placeholder="Search or type a service (e.g. Plumber)"
        required
        allowCustom
        hint="Choose a suggestion or type your own service keyword."
      />

      <SearchableCombobox
        label="City"
        icon={<PinIcon />}
        name="city"
        value={city}
        onChange={setCity}
        options={AU_CITY_OPTIONS}
        placeholder="Choose a city (e.g. Melbourne)"
        required
        hint="Major Australian cities. You can still type your own city."
        autoComplete="off"
      />

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary-live w-full py-4 text-base disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {loading ? (
          <span className="relative z-10 flex items-center justify-center gap-2">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Preparing your analysis…
          </span>
        ) : (
          <span className="relative z-10">Check my Google visibility</span>
        )}
      </button>

      <p className="text-center text-xs text-slate-500">
        Free · No credit card · Typical runtime 20–60 seconds
      </p>
    </form>
  );
}

function GlobeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}
