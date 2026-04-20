"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

const MAX_VISIBLE = 60;

export type ComboboxOption = {
  value: string;
  label: string;
  /** Optional extra text used only for filtering (lowercase) */
  searchText?: string;
};

type Props = {
  label: React.ReactNode;
  icon?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder: string;
  required?: boolean;
  /** Allow values not in the list (always true for keyword; city can still type unmatched suburb spelling) */
  allowCustom?: boolean;
  hint?: string;
  id?: string;
  name?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
};

export default function SearchableCombobox({
  label,
  icon,
  value,
  onChange,
  options,
  placeholder,
  required,
  allowCustom = true,
  hint,
  id: idProp,
  name,
  inputMode,
  autoComplete,
}: Props) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const id = idProp ?? `${reactId}-input`;

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = value.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!query) {
      return options.slice(0, MAX_VISIBLE);
    }
    const scored: { opt: ComboboxOption; score: number }[] = [];
    for (const opt of options) {
      const hay = (opt.searchText ?? `${opt.label} ${opt.value}`).toLowerCase();
      if (!hay.includes(query)) continue;
      let score = 0;
      const lv = opt.label.toLowerCase();
      if (lv.startsWith(query)) score += 100;
      else if (lv.split(/[\s,]+/).some((w) => w.startsWith(query))) score += 50;
      else score += 10;
      scored.push({ opt, score });
    }
    scored.sort((a, b) => b.score - a.score || a.opt.label.localeCompare(b.opt.label, "en-AU"));
    return scored.slice(0, MAX_VISIBLE).map((s) => s.opt);
  }, [options, query]);

  useEffect(() => {
    setHighlight(0);
  }, [value, filtered.length]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selectOption = useCallback(
    (opt: ComboboxOption) => {
      onChange(opt.value);
      setOpen(false);
      inputRef.current?.blur();
    },
    [onChange]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter" && filtered.length > 0) {
      e.preventDefault();
      selectOption(filtered[highlight] ?? filtered[0]);
    }
  };

  const showList = open && (filtered.length > 0 || !query);

  return (
    <div className="space-y-2" ref={wrapRef}>
      <label
        htmlFor={id}
        className="flex items-center gap-2 text-sm font-semibold text-slate-800"
      >
        {icon ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            {icon}
          </span>
        ) : null}
        {label}
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          required={required}
          placeholder={placeholder}
          value={value}
          inputMode={inputMode}
          autoComplete={autoComplete ?? "off"}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && filtered[highlight] ? `${id}-opt-${highlight}` : undefined
          }
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={
            "w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 pr-10 text-slate-900 shadow-sm " +
            "placeholder:text-slate-400 transition-all duration-200 " +
            "hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
          }
        />
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden
        >
          <ChevronIcon open={open} />
        </span>

        {showList && filtered.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5"
          >
            {filtered.map((opt, i) => {
              const active = i === highlight;
              return (
                <li
                  key={`${opt.value}-${i}`}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={active}
                  className={
                    "cursor-pointer px-3 py-2.5 text-sm text-slate-800 transition-colors " +
                    (active ? "bg-brand-50 text-brand-900" : "hover:bg-slate-50")
                  }
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectOption(opt)}
                >
                  {opt.label}
                </li>
              );
            })}
          </ul>
        )}

        {open && query && filtered.length === 0 && allowCustom && (
          <p className="absolute z-50 mt-1 w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-lg">
            No match — press Enter to use your text as typed.
          </p>
        )}
      </div>

      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-5 w-5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
