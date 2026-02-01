import React from "react";

export default function LoadingState({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-10 text-sm text-slate-500">
      {label ?? "Loading data..."}
    </div>
  );
}
