import React from "react";

interface PanelProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export default function Panel({ title, description, children, action }: PanelProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {description ? (
            <p className="text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
