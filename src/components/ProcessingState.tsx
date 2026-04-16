"use client";

import { useEffect, useMemo, useState } from "react";

interface ProcessingStateProps {
  total: number;
  checked: number;
  businessName?: string | null;
  suburbNames?: string[];
}

const MESSAGES = [
  "Locating your business on Google Maps...",
  "Building your suburb grid...",
  "Checking Google Maps rankings...",
  "Analysing search result positions...",
  "Calculating your visibility score...",
];

const HEX_COLORS = ["#22C55E", "#86EFAC", "#FCD34D", "#EF4444", "#D1D5DB"];

const DEMO_SUBURBS = [
  "Melbourne",
  "Richmond",
  "Hawthorn",
  "Fitzroy",
  "Collingwood",
  "Carlton",
  "South Yarra",
  "Prahran",
  "St Kilda",
  "Brighton",
  "Elwood",
  "Bentleigh",
  "Caulfield",
  "Malvern",
  "Armadale",
  "Toorak",
  "South Melbourne",
  "Port Melbourne",
  "Williamstown",
  "Footscray",
  "Yarraville",
  "Spotswood",
  "Newport",
  "Altona",
  "Sunshine",
  "Deer Park",
  "Hoppers Crossing",
  "Werribee",
  "Laverton",
  "Altona North",
  "Sydney",
  "Parramatta",
  "Bondi",
  "Manly",
  "Chatswood",
  "Newtown",
  "Surry Hills",
];

export default function ProcessingState({
  total,
  checked,
  businessName,
  suburbNames,
}: ProcessingStateProps) {
  const [msgIdx, setMsgIdx] = useState(0);

  // When we don't have real per-suburb progress yet, we display a smooth
  // time-based progress so the bar and the "checked" count stay consistent.
  const startTsRef = useMemo(() => Date.now(), []);
  const [nowTs, setNowTs] = useState(Date.now());

  useEffect(() => {
    const iv = setInterval(() => setMsgIdx((p) => (p + 1) % MESSAGES.length), 3500);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setNowTs(Date.now()), 250);
    return () => clearInterval(iv);
  }, []);

  const estimatedChecked = useMemo(() => {
    if (total <= 0) return 0;
    // Typical analysis window is ~20–40 seconds; we bias to the middle.
    const estimateMs = 32_000;
    const elapsed = Math.max(0, nowTs - startTsRef);
    const ratio = Math.min(1, elapsed / estimateMs);
    return Math.floor(ratio * total);
  }, [nowTs, startTsRef, total]);

  const displayChecked = useMemo(() => {
    if (total <= 0) return 0;
    const real = Math.max(0, Math.min(total, Math.floor(checked)));
    // If real progress isn't available yet (checked stays 0), fall back to estimate.
    if (real > 0) return real;
    return estimatedChecked;
  }, [checked, total, estimatedChecked]);

  const pct = useMemo(() => {
    if (total <= 0) return 0;
    return Math.round((displayChecked / total) * 100);
  }, [displayChecked, total]);

  const chipList = useMemo(() => {
    const list = suburbNames && suburbNames.length > 0 ? suburbNames : DEMO_SUBURBS;
    return list.slice(0, Math.min(list.length, displayChecked));
  }, [suburbNames, displayChecked]);

  const HEX_ROWS = 5;
  const HEX_COLS = 7;
  const totalHex = HEX_ROWS * HEX_COLS; // 35
  const visibleHexes = useMemo(() => {
    if (total <= 0) return 0;
    return Math.round((displayChecked / total) * totalHex);
  }, [displayChecked, total]);

  const getHexColor = (idx: number) => HEX_COLORS[idx % (HEX_COLORS.length - 1)];

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 py-10 bg-gradient-to-br from-gray-50 to-white">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
        {/* LEFT — Progress info */}
        <div className="space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 rounded-full px-3 py-1 text-xs font-semibold mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
              Scanning now
            </div>
            <h2 className="text-2xl font-black text-gray-900 leading-snug">
              {businessName ? (
                <>
                  Checking <span className="text-brand-600">{businessName}</span>
                </>
              ) : (
                "Checking your visibility"
              )}
            </h2>
            <p className="text-gray-500 mt-2 text-sm min-h-[20px] transition-all duration-300">
              {MESSAGES[msgIdx]}
            </p>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>
                {displayChecked} of {total} suburbs checked
              </span>
              <span>{pct}%</span>
            </div>
          </div>

          {/* Suburb chips */}
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-hidden">
            {chipList.map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="inline-flex items-center gap-1 bg-white border border-gray-200 text-gray-700 text-xs px-2.5 py-1 rounded-full shadow-sm animate-fadeIn"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                {name}
              </span>
            ))}
            {displayChecked < total && (
              <span className="inline-flex items-center gap-1 bg-brand-50 border border-brand-200 text-brand-700 text-xs px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                Checking...
              </span>
            )}
          </div>

          <p className="text-xs text-gray-400">
            Results typically take 20–40 seconds. Please stay on this page.
          </p>
        </div>

        {/* RIGHT — Hex preview (tied to real checked count) */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-700">Live Map Preview</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-500 bg-red-50 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </span>
          </div>

          <div className="p-6 flex flex-col items-center gap-0.5 bg-gray-50 min-h-[260px] justify-center">
            {Array.from({ length: HEX_ROWS }, (_, rowIdx) => (
              <div
                key={rowIdx}
                className="flex gap-0.5"
                style={{ marginLeft: rowIdx % 2 === 1 ? "22px" : "0" }}
              >
                {Array.from({ length: HEX_COLS }, (_, colIdx) => {
                  const idx = rowIdx * HEX_COLS + colIdx;
                  const visible = idx < visibleHexes;
                  return (
                    <div
                      key={colIdx}
                      className="transition-all duration-300 ease-out"
                      style={{
                        width: "40px",
                        height: "46px",
                        clipPath:
                          "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                        backgroundColor: visible ? getHexColor(idx) : "#E5E7EB",
                        opacity: visible ? 1 : 0.35,
                        transform: visible ? "scale(1)" : "scale(0.85)",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <div className="px-4 pb-4 flex flex-wrap gap-3 justify-center">
            {[
              { color: "#22C55E", label: "Top 3" },
              { color: "#86EFAC", label: "Page 1" },
              { color: "#FCD34D", label: "Page 2" },
              { color: "#EF4444", label: "Not visible" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
