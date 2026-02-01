import React, { useEffect, useMemo, useState } from "react";
import {
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import MetricCard from "../components/MetricCard";
import Panel from "../components/Panel";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import { demoOverview } from "../data/demoData";
import { fetchOverviewMetrics } from "../data/api";
import { OverviewMetrics } from "../data/types";

type Mode = "demo" | "live";

const outcomeColors = ["#0f766e", "#f59e0b", "#ef4444", "#94a3b8"];
const sentimentColors = ["#10b981", "#64748b", "#ef4444", "#f97316"];

export default function Overview({ mode }: { mode: Mode }) {
  const [data, setData] = useState<OverviewMetrics | null>(null);
  const [loading, setLoading] = useState(mode === "live");
  const [error, setError] = useState<string | null>(null);

  const overview = useMemo(() => {
    if (mode === "demo") {
      return demoOverview;
    }
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
    fetchOverviewMetrics()
      .then((res) => {
        if (!active) return;
        setData(res);
      })
      .catch((err) => {
        if (!active) return;
        const msg =
          err?.message === "Failed to fetch" || err?.message === "Load failed"
            ? "Could not reach the API. Make sure the backend is running (e.g. uvicorn app.main:app --reload on port 8000), or use Demo Mode."
            : err?.message || "Failed to load overview metrics.";
        setError(msg);
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
    return <LoadingState label="Loading overview metrics..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!overview) {
    return <LoadingState label="No overview data available." />;
  }

  const outcomeData = [
    {
      name: "Verified & Booked",
      value: overview.call_outcomes.verified_booked,
    },
    {
      name: "Verified & No Deal",
      value: overview.call_outcomes.verified_no_deal,
    },
    {
      name: "Failed Verification",
      value: overview.call_outcomes.failed_verification,
    },
    {
      name: "Dropped/Incomplete",
      value: overview.call_outcomes.dropped_incomplete,
    },
  ];

  const sentimentData = [
    { name: "Positive", value: overview.sentiment_distribution.positive },
    { name: "Neutral", value: overview.sentiment_distribution.neutral },
    { name: "Negative", value: overview.sentiment_distribution.negative },
    { name: "Frustrated", value: overview.sentiment_distribution.frustrated },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total Calls"
          value={overview.total_calls.toLocaleString()}
          helper="All inbound carrier calls logged."
        />
        <MetricCard
          label="Conversion Rate"
          value={`${overview.conversion_rate}%`}
          helper="Booked loads / total calls."
        />
        <MetricCard
          label="Avg Negotiation Spread"
          value={`$${overview.avg_negotiation_spread.toLocaleString()}`}
          helper="Avg premium above loadboard rate."
        />
        <MetricCard
          label="Calls Today"
          value={overview.calls_today.toLocaleString()}
          helper="Rolling 24-hour window."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Call Outcome Summary"
          description="Distribution of verification and booking results."
          action={
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
              {overview.total_calls} calls
            </span>
          }
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={outcomeData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {outcomeData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={outcomeColors[index % outcomeColors.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
            {outcomeData.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-slate-300" />
                <span>{item.name}</span>
                <span className="ml-auto font-semibold text-slate-900">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Sentiment Distribution"
          description="Carrier sentiment across all recorded calls."
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sentimentData}>
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {sentimentData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={sentimentColors[index % sentimentColors.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}
