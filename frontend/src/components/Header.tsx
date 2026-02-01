import React from "react";

type Mode = "demo" | "live";

interface HeaderProps {
  mode: Mode;
  onToggle: (mode: Mode) => void;
}

export default function Header({ mode, onToggle }: HeaderProps) {
  const isLive = mode === "live";

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          HappyRobot Carrier Automation
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">
          Inbound Sales Dashboard
        </h1>
      </div>
      <div className="flex items-center gap-4">
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {isLive ? "Live Mode" : "Demo Mode"}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Demo</span>
          <button
            type="button"
            onClick={() => onToggle(isLive ? "demo" : "live")}
            className={`relative h-6 w-12 rounded-full transition ${
              isLive ? "bg-emerald-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                isLive ? "left-6" : "left-1"
              }`}
            />
          </button>
          <span className="text-sm text-slate-600">Live</span>
        </div>
      </div>
    </header>
  );
}
