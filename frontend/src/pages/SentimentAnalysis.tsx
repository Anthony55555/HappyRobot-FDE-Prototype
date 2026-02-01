import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import Panel from "../components/Panel";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import { demoCalls } from "../data/demoData";
import { fetchCalls } from "../data/api";
import { formatInPT } from "../data/utils";
import { CallRecord, Sentiment } from "../data/types";

type Mode = "demo" | "live";

const SENTIMENTS: Sentiment[] = ["positive", "neutral", "negative", "frustrated"];
const SENTIMENT_LABELS: Record<Sentiment, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  frustrated: "Frustrated",
};
const SENTIMENT_COLORS: Record<Sentiment, string> = {
  positive: "#10b981",
  neutral: "#64748b",
  negative: "#ef4444",
  frustrated: "#f97316",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TREND_DAYS = 14;
const PERIOD_DAYS = 7;

function useSentimentData(mode: Mode) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(mode === "live");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "demo") {
      setCalls(demoCalls);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fetchCalls()
      .then((res) => {
        if (!active) return;
        setCalls(res);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "Failed to load calls.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode]);

  const now = Date.now();
  const trendStart = now - TREND_DAYS * MS_PER_DAY;
  const recentStart = now - PERIOD_DAYS * MS_PER_DAY;
  const priorStart = now - 2 * PERIOD_DAYS * MS_PER_DAY;

  const distribution = useMemo(() => {
    const d: Record<Sentiment, number> = {
      positive: 0,
      neutral: 0,
      negative: 0,
      frustrated: 0,
    };
    calls.forEach((c) => {
      d[c.sentiment] += 1;
    });
    return d;
  }, [calls]);

  const trendByDay = useMemo(() => {
    const dayCounts: Record<string, Record<Sentiment, number>> = {};
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const dayStart = new Date(now - i * MS_PER_DAY);
      const dateKey = dayStart.toISOString().slice(0, 10);
      dayCounts[dateKey] = {
        positive: 0,
        neutral: 0,
        negative: 0,
        frustrated: 0,
      };
    }
    calls.forEach((c) => {
      const t = new Date(c.timestamp).getTime();
      if (t < trendStart) return;
      const dateKey = new Date(t).toISOString().slice(0, 10);
      if (dayCounts[dateKey]) dayCounts[dateKey][c.sentiment] += 1;
    });
    return Object.entries(dayCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({
        date: new Date(date + "T12:00:00").toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          timeZone: "America/Los_Angeles",
        }),
        ...counts,
        total:
          counts.positive +
          counts.neutral +
          counts.negative +
          counts.frustrated,
      }));
  }, [calls, now, trendStart]);

  const growthBySentiment = useMemo(() => {
    const recent: Record<Sentiment, number> = {
      positive: 0,
      neutral: 0,
      negative: 0,
      frustrated: 0,
    };
    const prior: Record<Sentiment, number> = {
      positive: 0,
      neutral: 0,
      negative: 0,
      frustrated: 0,
    };
    calls.forEach((c) => {
      const t = new Date(c.timestamp).getTime();
      if (t >= recentStart) recent[c.sentiment] += 1;
      else if (t >= priorStart) prior[c.sentiment] += 1;
    });
    const growth: Record<Sentiment, number | null> = {
      positive: null,
      neutral: null,
      negative: null,
      frustrated: null,
    };
    (SENTIMENTS as Sentiment[]).forEach((s) => {
      if (prior[s] > 0) {
        growth[s] = Math.round(((recent[s] - prior[s]) / prior[s]) * 100);
      } else if (recent[s] > 0) growth[s] = 100;
    });
    return growth;
  }, [calls, recentStart, priorStart]);

  return { calls, loading, error, distribution, trendByDay, growthBySentiment };
}

export default function SentimentAnalysis({ mode }: { mode: Mode }) {
  const [selectedSentiment, setSelectedSentiment] = useState<Sentiment | null>(
    null
  );
  const {
    calls,
    loading,
    error,
    distribution,
    trendByDay,
    growthBySentiment,
  } = useSentimentData(mode);

  const filteredCalls = useMemo(() => {
    if (!selectedSentiment) return [];
    return calls
      .filter((c) => c.sentiment === selectedSentiment)
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, 20);
  }, [calls, selectedSentiment]);

  const barData = useMemo(
    () =>
      SENTIMENTS.map((s) => ({
        name: SENTIMENT_LABELS[s],
        value: distribution[s],
        sentiment: s,
      })),
    [distribution]
  );

  if (loading) {
    return <LoadingState label="Loading sentiment data..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Sentiment Analysis"
        description="Calls by sentiment, growth vs prior period, and trends over time."
        action={
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            {calls.length} calls
          </span>
        }
      />

      {/* Summary cards: clickable by sentiment */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SENTIMENTS.map((sentiment) => {
          const count = distribution[sentiment];
          const growth = growthBySentiment[sentiment];
          const isSelected = selectedSentiment === sentiment;
          return (
            <button
              key={sentiment}
              type="button"
              onClick={() =>
                setSelectedSentiment(isSelected ? null : sentiment)
              }
              className={`rounded-2xl border p-4 text-left shadow-card transition ${
                isSelected
                  ? "ring-2 ring-slate-900 border-slate-300 bg-slate-50"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <p
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: SENTIMENT_COLORS[sentiment] }}
              >
                {SENTIMENT_LABELS[sentiment]}
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {count}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {growth !== null ? (
                  <span
                    className={
                      growth >= 0 ? "text-emerald-600" : "text-red-600"
                    }
                  >
                    {growth >= 0 ? "+" : ""}
                    {growth}% vs prior 7 days
                  </span>
                ) : (
                  "No prior period to compare"
                )}
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Sentiment Distribution"
          description="Click a card above to see calls in that category."
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {barData.map((entry) => (
                    <Cell
                      key={entry.sentiment}
                      fill={SENTIMENT_COLORS[entry.sentiment]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Sentiment Trend (last 14 days)"
          description="Daily call count by sentiment."
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                {SENTIMENTS.map((s) => (
                  <Line
                    key={s}
                    type="monotone"
                    dataKey={s}
                    name={SENTIMENT_LABELS[s]}
                    stroke={SENTIMENT_COLORS[s]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {selectedSentiment ? (
        <Panel
          title={`Calls: ${SENTIMENT_LABELS[selectedSentiment]} (recent)`}
          description="Up to 20 most recent calls in this sentiment. Use the reason column to see why each was classified and to identify what to improve. Clear selection by clicking the same card again."
          action={
            <button
              type="button"
              onClick={() => setSelectedSentiment(null)}
              className="rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-300"
            >
              Clear
            </button>
          }
        >
          {filteredCalls.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">
              No calls in this sentiment.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-400">
                  <tr>
                    <th className="py-2">Timestamp</th>
                    <th>MC#</th>
                    <th>Carrier</th>
                    <th>Outcome</th>
                    <th>Duration</th>
                    <th className="min-w-[200px]">Why (reason)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCalls.map((call) => (
                    <tr
                      key={call.id}
                      className="text-slate-600 hover:bg-slate-50"
                    >
                      <td className="py-2 text-slate-900">
                        {formatInPT(call.timestamp)}
                      </td>
                      <td>{call.mc_number}</td>
                      <td>{call.carrier_name}</td>
                      <td className="capitalize">
                        {call.outcome.replace(/_/g, " ")}
                      </td>
                      <td>
                        {Math.floor(call.call_duration_seconds / 60)}m{" "}
                        {call.call_duration_seconds % 60}s
                      </td>
                      <td className="max-w-md text-slate-600">
                        {call.sentiment_reasoning || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
