export default function BlogPage() {
  return (
    <div className="min-h-[50vh] bg-mesh-hero px-4 py-20 md:py-28">
      <div className="card-elevated max-w-2xl mx-auto px-8 py-12 md:py-14 text-center space-y-5">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">Insights</p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">Blog</h1>
        <p className="text-slate-600 text-lg leading-relaxed">
          Tips, guides and case studies on local SEO and Google Maps visibility.
        </p>
        <p className="text-slate-400 text-sm">Coming soon — check back shortly.</p>
        <a
          href="/"
          className="inline-flex mt-2 text-sm font-semibold text-brand-600 hover:text-brand-700 underline decoration-brand-200 underline-offset-4 hover:decoration-brand-400 transition-colors"
        >
          Back to SERPMapper
        </a>
      </div>
    </div>
  );
}
