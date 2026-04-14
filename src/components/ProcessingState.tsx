"use client";

import { useEffect, useState } from "react";

interface ProcessingStateProps {
  total: number;
  checked: number;
  businessName?: string | null;
}

const PROCESSING_MESSAGES = [
  "Locating your business on Google Maps...",
  "Building your suburb grid...",
  "Checking visibility across suburbs...",
  "Analysing search rankings...",
  "Almost there...",
];

export default function ProcessingState({ total, checked, businessName }: ProcessingStateProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % PROCESSING_MESSAGES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full max-w-lg mx-auto text-center space-y-6 py-12">
      {/* Animated dots */}
      <div className="flex justify-center gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-full bg-brand-500 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-900">
          {businessName ? `Checking ${businessName}` : "Checking your visibility"}
        </h2>
        <p className="text-gray-500 mt-1 text-sm h-5 transition-all duration-300">
          {PROCESSING_MESSAGES[messageIndex]}
        </p>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>
        <p className="text-xs text-gray-400">
          {checked} of {total} suburbs checked
        </p>
      </div>

      <p className="text-xs text-gray-300">
        Checking your Google Maps rankings across {total} suburbs.
        This takes 20–40 seconds.
      </p>
    </div>
  );
}
