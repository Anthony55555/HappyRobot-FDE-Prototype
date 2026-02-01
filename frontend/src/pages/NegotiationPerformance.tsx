import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import MetricCard from "../components/MetricCard";
import Panel from "../components/Panel";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import { demoNegotiations } from "../data/demoData";
import { fetchNegotiationMetrics } from "../data/api";
import { NegotiationMetrics } from "../data/types";

type Mode = "demo" | "live";

export default function NegotiationPerformance({ mode }: { mode: Mode }) {
  const [data, setData] = useState<NegotiationMetrics | null>(null);
  const [loading, setLoading] = useState(mode === "live");
  const [error, setError] = useState<string | null>(null);

  const metrics = useMemo(() => {
    if (mode === "demo") return demoNegotiations;
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
    fetchNegotiationMetrics()
      .then((res) => {
        if (!active) return;
        setData(res);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "Failed to load negotiation metrics.");
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
    return <LoadingState label="Loading negotiation performance..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!metrics) {
    return <LoadingState label="No negotiation data available." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Total Negotiations"
          value={metrics.total_negotiations.toLocaleString()}
          helper="Calls with active negotiation attempts."
        />
        <MetricCard
          label="Success Rate"
          value={`${metrics.success_rate}%`}
          helper="Negotiations that ended in a booking."
        />
        <MetricCard
          label="Avg Premium"
          value={`$${Math.max(0, metrics.avg_discount).toLocaleString()}`}
          helper="Average premium above loadboard rate (carrier negotiated up)."
        />
      </div>

      <Panel
        title="Loadboard vs Final Rates"
        description="Track how negotiated pricing trends against initial quotes."
      >
        <div className="h-72">
          {metrics.chart_points.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
              No trend data yet. Negotiations with both loadboard and final rate will appear here.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.chart_points}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="loadboard_rate"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  name="Loadboard Rate"
                />
                <Line
                  type="monotone"
                  dataKey="final_rate"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="Final Agreed Rate"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Panel>

      <Panel
        title="Recent Negotiations"
        description="Latest negotiated calls with pricing outcomes."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">Date</th>
                <th>Load ID</th>
                <th>Origin → Destination</th>
                <th>Loadboard Rate</th>
                <th>Final Rate</th>
                <th>Spread</th>
                <th>Rounds</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {metrics.recent_negotiations.map((row) => (
                <tr key={`${row.load_id}-${row.date}`} className="text-slate-600">
                  <td className="py-2 text-slate-900">{row.date}</td>
                  <td>{row.load_id}</td>
                  <td>{row.lane}</td>
                  <td>
                    $
                    {(
                      row.loadboard_rate ||
                      row.final_rate ||
                      0
                    ).toLocaleString()}
                  </td>
                  <td>
                    {row.final_rate
                      ? `$${row.final_rate.toLocaleString()}`
                      : "—"}
                  </td>
                  <td>
                    $
                    {Math.max(
                      0,
                      row.spread ??
                        (row.loadboard_rate || 0) - (row.final_rate || 0)
                    ).toLocaleString()}
                  </td>
                  <td>{row.rounds}</td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        row.outcome === "agreed"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {row.outcome === "agreed" ? "Agreed" : "Declined"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
