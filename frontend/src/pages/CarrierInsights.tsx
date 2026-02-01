import React, { useEffect, useMemo, useState } from "react";
import Panel from "../components/Panel";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import { demoCarrierInsights } from "../data/demoData";
import { fetchCarrierInsights } from "../data/api";
import { CarrierInsights } from "../data/types";

type Mode = "demo" | "live";

export default function CarrierInsightsPage({ mode }: { mode: Mode }) {
  const [data, setData] = useState<CarrierInsights | null>(null);
  const [loading, setLoading] = useState(mode === "live");
  const [error, setError] = useState<string | null>(null);

  const insights = useMemo(() => {
    if (mode === "demo") return demoCarrierInsights;
    return data;
  }, [mode, data]);

  useEffect(() => {
    if (mode === "demo") {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fetchCarrierInsights()
      .then((res) => {
        if (!active) return;
        setData(res);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "Failed to load carrier insights.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode]);

  if (loading) {
    return <LoadingState label="Loading carrier insights..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!insights) {
    return <LoadingState label="No carrier insights available." />;
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Carrier Insights (Beta)"
        description="Forward-looking view into carrier patterns and repeat behaviors."
        action={
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs text-indigo-700">
            Coming Soon
          </span>
        }
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              Repeat Callers
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Carriers with multiple inbound calls and their usual lanes.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-400">
                  <tr>
                    <th className="py-2">MC Number</th>
                    <th>Carrier</th>
                    <th>Call Count</th>
                    <th>Typical Lanes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {insights.repeat_callers.map((carrier) => (
                    <tr key={carrier.mc_number}>
                      <td className="py-2 text-slate-900">{carrier.mc_number}</td>
                      <td>{carrier.carrier_name}</td>
                      <td>{carrier.call_count}</td>
                      <td>{carrier.typical_lanes.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              Frequently Requested Lanes
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Identify hot lanes to prioritize on load matching.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-400">
                  <tr>
                    <th className="py-2">Lane</th>
                    <th>Call Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {insights.frequent_lanes.map((lane) => (
                    <tr key={lane.lane}>
                      <td className="py-2 text-slate-900">{lane.lane}</td>
                      <td>{lane.call_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
