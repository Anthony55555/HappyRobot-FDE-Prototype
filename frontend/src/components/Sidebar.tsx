import React from "react";

export type PageKey =
  | "overview"
  | "negotiations"
  | "calls"
  | "insights"
  | "sentiment";

interface SidebarProps {
  current: PageKey;
  onNavigate: (page: PageKey) => void;
}

const navItems: { key: PageKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "negotiations", label: "Negotiation Performance" },
  { key: "calls", label: "Call Log" },
  { key: "sentiment", label: "Sentiment Analysis" },
  { key: "insights", label: "Carrier Insights" },
];

export default function Sidebar({ current, onNavigate }: SidebarProps) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white px-4 py-6">
      <div className="mb-8 rounded-2xl bg-navy px-4 py-4 text-white shadow">
        <p className="text-xs uppercase tracking-wide text-slate-300">
          Operations View
        </p>
        <h2 className="text-lg font-semibold">Inbound Sales Ops</h2>
        <p className="mt-2 text-xs text-slate-300">
          Track carrier engagement, negotiation results, and pipeline health.
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => {
          const active = item.key === current;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              className={`rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                active
                  ? "bg-slate-900 text-white shadow"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="rounded-xl bg-slate-100 px-3 py-3 text-xs text-slate-500">
        Demo Mode ships with offline data for demos. Switch to Live Mode when
        your API is ready.
      </div>
    </aside>
  );
}
