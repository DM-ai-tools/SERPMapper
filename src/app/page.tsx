import InputForm from "@/components/InputForm";

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-mesh-hero py-20 md:py-28 px-4">
        <div
          className="pointer-events-none absolute inset-0 bg-grid-faint opacity-40"
          aria-hidden
        />
        <div className="relative max-w-4xl mx-auto text-center space-y-8 md:space-y-10">
          <div
            className="inline-flex items-center gap-2 rounded-full border border-brand-200/80 bg-white/80 px-4 py-2 text-sm font-semibold text-brand-800 shadow-sm backdrop-blur-sm animate-fadeIn"
          >
            <span
              className="relative flex h-2 w-2"
              aria-hidden
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
            </span>
            Free · No signup · Results in ~60 seconds
          </div>

          <div className="space-y-5 animate-fadeIn [animation-delay:80ms] [animation-fill-mode:both]">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-slate-900 leading-[1.08] tracking-tight">
              Can people in your city
              <br />
              <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-brand-700 bg-clip-text text-transparent">
                find you on Google?
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
              SERPMapper checks your Google Maps rankings across suburbs in your area and
              maps them as a colour-coded visibility grid — fast, clear, and actionable.
            </p>
          </div>

          <div className="animate-fadeIn [animation-delay:140ms] [animation-fill-mode:both]">
            <InputForm />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="relative py-20 md:py-24 px-4 bg-mesh-section border-y border-slate-100/90"
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14 md:mb-16">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600 mb-2">
              Simple workflow
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
              How it works
            </h2>
            <p className="mt-3 text-slate-600 max-w-xl mx-auto">
              Three steps from URL to a suburb-level picture of where you show up in local search.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {STEPS.map((step, i) => (
              <div
                key={step.number}
                className="group relative rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-card transition-all duration-300
                           hover:border-brand-200 hover:shadow-card-lg hover:-translate-y-1"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div
                  className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-extrabold text-white shadow-lg shadow-brand-600/25
                             ring-4 ring-brand-50 transition-transform duration-300 group-hover:scale-105"
                >
                  {step.number}
                </div>
                <h3 className="font-bold text-slate-900 text-lg">{step.title}</h3>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Colour legend explainer */}
      <section className="py-16 md:py-20 px-4 bg-[var(--page-bg)]">
        <div className="max-w-4xl mx-auto text-center space-y-10">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              What the colours mean
            </h2>
            <p className="mt-2 text-slate-600 text-sm md:text-base">
              Same legend on the map — green is winning, red is a gap worth fixing.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
            {COLOUR_LEGEND.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card transition-shadow hover:shadow-card-lg"
              >
                <div
                  className="mx-auto mb-3 h-10 w-10 rounded-xl shadow-inner ring-2 ring-white"
                  style={{ backgroundColor: item.color }}
                />
                <p className="font-bold text-sm text-slate-900">{item.label}</p>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof / stats */}
      <section className="py-20 md:py-24 px-4 bg-white border-t border-slate-100">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 leading-snug">
            Most local businesses are invisible in{" "}
            <span className="text-red-500">a majority of nearby suburbs</span>
          </h2>
          <p className="text-slate-600 leading-relaxed">
            Owners often assume they rank well everywhere. SERPMapper shows the gaps — so you
            know exactly where local demand is going to competitors.
          </p>
          <a
            href="/"
            className="btn-primary-live inline-flex items-center justify-center px-8 py-4 text-base rounded-xl"
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
      "Paste your business website URL, your main service keyword (e.g. plumber), and your city.",
  },
  {
    number: "2",
    title: "We scan suburbs",
    description:
      "We check your Google Maps visibility across many suburbs around your business — typically within 20–40 seconds.",
  },
  {
    number: "3",
    title: "See your map",
    description:
      "Get a colour-coded map, a Visibility Score out of 100, and a ranked list of missed opportunities.",
  },
];

const COLOUR_LEGEND = [
  { color: "#22C55E", label: "Top 3", description: "You rank #1–3. Customers find you easily." },
  { color: "#86EFAC", label: "Page 1", description: "You rank #4–10. Visible but not prominent." },
  { color: "#FCD34D", label: "Page 2", description: "Ranking #11–20. Very few people see you." },
  { color: "#EF4444", label: "Not visible", description: "Not in top 20. These are your gaps." },
];
