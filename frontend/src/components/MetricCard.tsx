import React from "react";

interface MetricCardProps {
  label: string;
  value: string;
  helper?: string;
}

export default function MetricCard({ label, value, helper }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}
