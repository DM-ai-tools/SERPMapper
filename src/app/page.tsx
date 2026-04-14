"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import InputForm from "@/components/InputForm";
import { AnalyzeResponse } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [_pending, setPending] = useState(false);

  function handleReportCreated(reportId: string, response: AnalyzeResponse) {
    setPending(true);
    // Navigate to the tool page with the report ID
    router.push(`/tool?report=${reportId}&cached=${response.cached}`);
  }

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-white to-gray-50 py-20 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 rounded-full px-4 py-1.5 text-sm font-semibold">
            <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
            Free · No signup · Results in 60 seconds
          </div>

          <h1 className="text-5xl md:text-6xl font-black text-gray-900 leading-tight tracking-tight">
            Can people in your city
            <br />
            <span className="text-brand-600">find you on Google?</span>
          </h1>

          <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            SERPMapper checks your Google Maps rankings across every suburb in your city and
            renders the answer as a colour-coded visibility map — in under 60 seconds.
          </p>

          <InputForm onReportCreated={handleReportCreated} />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-gray-900 text-center mb-12">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((step) => (
              <div key={step.number} className="text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-brand-100 text-brand-700 font-black text-xl
                                flex items-center justify-center mx-auto">
                  {step.number}
                </div>
                <h3 className="font-bold text-gray-900">{step.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Colour legend explainer */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <h2 className="text-2xl font-black text-gray-900">What the colours mean</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {COLOUR_LEGEND.map((item) => (
              <div key={item.label} className="bg-white rounded-xl p-4 shadow-sm space-y-2">
                <div
                  className="w-8 h-8 rounded-lg mx-auto"
                  style={{ backgroundColor: item.color }}
                />
                <p className="font-semibold text-sm text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-500">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof / stats */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h2 className="text-3xl font-black text-gray-900">
            The average AU local business is invisible in{" "}
            <span className="text-red-500">60% of their suburbs</span>
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Most business owners assume they rank well locally. SERPMapper reveals the gaps.
            Once you see the red suburbs on your map, you know exactly where to focus.
          </p>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="inline-block bg-brand-600 text-white font-bold px-8 py-4 rounded-xl
                       hover:bg-brand-700 transition-colors text-lg"
          >
            Check my visibility — free
          </a>
        </div>
      </section>
    </>
  );
}

const STEPS = [
  {
    number: "1",
    title: "Enter your details",
    description:
      "Paste your business website URL, type your main service keyword (e.g. plumber), and your city.",
  },
  {
    number: "2",
    title: "We check 50 suburbs",
    description:
      "SERPMapper checks your Google Maps ranking in up to 50 suburbs around you. Takes 20–40 seconds.",
  },
  {
    number: "3",
    title: "See your visibility map",
    description:
      "Get a colour-coded suburb map, a Visibility Score out of 100, and a ranked list of missed opportunities.",
  },
];

const COLOUR_LEGEND = [
  { color: "#22C55E", label: "Top 3", description: "You rank #1–3. Customers find you easily." },
  { color: "#86EFAC", label: "Page 1", description: "You rank #4–10. Visible but not prominent." },
  { color: "#FCD34D", label: "Page 2", description: "Ranking #11–20. Very few people see you." },
  { color: "#EF4444", label: "Not visible", description: "Not in top 20. These are your gaps." },
];
