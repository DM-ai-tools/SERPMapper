export default function ToolLoading() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-4 py-16 bg-mesh-hero">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-600/25">
          <div className="h-7 w-7 rounded-lg border-2 border-white/40 border-t-white animate-spin" />
        </div>
        <div className="space-y-3">
          <div className="mx-auto h-3 max-w-[220px] rounded-full bg-slate-200/90 animate-pulse" />
          <div className="mx-auto h-3 max-w-[160px] rounded-full bg-slate-100 animate-pulse" />
        </div>
        <p className="text-sm font-medium text-slate-500">Loading your workspace…</p>
      </div>
    </div>
  );
}
