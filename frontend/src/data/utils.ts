import { CallRecord, CarrierInsights, NegotiationMetrics, OverviewMetrics } from "./types";

/** Pacific Time (San Francisco). Backend sends UTC without "Z", so treat as UTC for correct conversion. */
const PT = "America/Los_Angeles";
const parseAsUTC = (value: string): string => {
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[Z+-]\d{2}:?\d{2}$/.test(s) && !s.endsWith("Z")) return s + "Z";
  return s;
};

export const formatInPT = (value: string | Date | null | undefined): string => {
  if (value == null || value === "") return "—";
  const d = typeof value === "string" ? new Date(parseAsUTC(value)) : value;
  return isNaN(d.getTime()) ? String(value) : d.toLocaleString(undefined, { timeZone: PT });
};

export const formatDateInPT = (value: string | Date | null | undefined): string => {
  if (value == null || value === "") return "—";
  const d = typeof value === "string" ? new Date(parseAsUTC(value)) : value;
  return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(undefined, { timeZone: PT });
};

const round = (value: number, decimals = 1) => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

export const computeOverviewMetrics = (calls: CallRecord[]): OverviewMetrics => {
  const totalCalls = calls.length;
  const booked = calls.filter((call) => call.outcome === "booked").length;
  const verifiedNoDeal = calls.filter((call) => call.outcome === "no_deal").length;
  const failedVerification = calls.filter(
    (call) => call.outcome === "failed_verification"
  ).length;
  const dropped = calls.filter((call) => call.outcome === "dropped").length;
  const conversionRate = totalCalls ? (booked / totalCalls) * 100 : 0;

  const spreads = calls
    .filter((call) => call.negotiation?.final_rate != null && call.load_matched)
    .map((call) =>
      Math.max(0, call.negotiation!.final_rate! - (call.load_matched!.loadboard_rate ?? 0))
    );
  const avgSpread = spreads.length
    ? spreads.reduce((sum, value) => sum + value, 0) / spreads.length
    : 0;

  const now = Date.now();
  const callsToday = calls.filter(
    (call) => new Date(call.timestamp).getTime() > now - 24 * 60 * 60 * 1000
  ).length;

  const sentimentDistribution = calls.reduce<OverviewMetrics["sentiment_distribution"]>(
    (acc, call) => {
      acc[call.sentiment] += 1;
      return acc;
    },
    { positive: 0, neutral: 0, negative: 0, frustrated: 0 }
  );

  return {
    total_calls: totalCalls,
    conversion_rate: round(conversionRate, 1),
    avg_negotiation_spread: round(avgSpread, 0),
    calls_today: callsToday,
    call_outcomes: {
      verified_booked: booked,
      verified_no_deal: verifiedNoDeal,
      failed_verification: failedVerification,
      dropped_incomplete: dropped,
    },
    sentiment_distribution: sentimentDistribution,
  };
};

function effectiveLoadboard(call: CallRecord): number {
  const lb = call.load_matched?.loadboard_rate ?? 0;
  if (lb > 0) return lb;
  return (
    call.negotiation?.initial_offer ??
    call.negotiation?.final_rate ??
    0
  );
}

export const computeNegotiationMetrics = (
  calls: CallRecord[]
): NegotiationMetrics => {
  const negotiations = calls.filter((call) => call.negotiation && call.load_matched);
  const total = negotiations.length;
  const successes = negotiations.filter((call) => call.negotiation?.agreed).length;
  const successRate = total ? (successes / total) * 100 : 0;
  const spreads = negotiations
    .filter((call) => call.negotiation?.final_rate != null)
    .map((call) => {
      const lb = effectiveLoadboard(call);
      const fr = call.negotiation!.final_rate!;
      if (lb <= 0) return 0;
      return fr - lb;
    });
  const avgDiscount = spreads.length
    ? spreads.reduce((sum, value) => sum + value, 0) / spreads.length
    : 0;

  const chartPoints = negotiations
    .filter((call) => call.negotiation?.final_rate != null)
    .map((call) => ({
      call,
      lb: effectiveLoadboard(call),
      fr: call.negotiation!.final_rate!,
    }))
    .filter(({ lb }) => lb > 0)
    .sort((a, b) => new Date(a.call.timestamp).getTime() - new Date(b.call.timestamp).getTime())
    .slice(-24)
    .map(({ call, lb, fr }) => ({
      date: formatDateInPT(call.timestamp),
      loadboard_rate: lb,
      final_rate: fr,
    }));

  const recentNegotiations = negotiations
    .filter((call) => call.negotiation?.final_rate != null || call.negotiation)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 12)
    .map((call) => {
      const lb = effectiveLoadboard(call);
      const fr = call.negotiation?.final_rate ?? 0;
      return {
        date: formatInPT(call.timestamp),
        load_id: call.load_matched?.load_id ?? "—",
        lane: call.load_matched
          ? `${call.load_matched.origin} → ${call.load_matched.destination}`
          : "—",
        loadboard_rate: lb,
        final_rate: fr,
        spread: Math.max(0, fr - lb),
        rounds: call.negotiation?.rounds ?? 0,
        outcome: (call.negotiation?.agreed ? "agreed" : "declined") as
          | "agreed"
          | "declined",
      };
    });

  return {
    total_negotiations: total,
    success_rate: round(successRate, 1),
    avg_discount: round(avgDiscount, 0),
    chart_points: chartPoints,
    recent_negotiations: recentNegotiations,
  };
};

export const computeCarrierInsights = (calls: CallRecord[]): CarrierInsights => {
  const grouped = new Map<
    string,
    { carrier_name: string; count: number; lanes: string[] }
  >();

  calls.forEach((call) => {
    const key = call.mc_number;
    if (!grouped.has(key)) {
      grouped.set(key, { carrier_name: call.carrier_name, count: 0, lanes: [] });
    }
    const entry = grouped.get(key)!;
    entry.count += 1;
    if (call.load_matched) {
      entry.lanes.push(
        `${call.load_matched.origin} → ${call.load_matched.destination}`
      );
    }
  });

  const repeatCallers = Array.from(grouped.entries())
    .filter(([, value]) => value.count > 1)
    .map(([mc_number, value]) => ({
      mc_number,
      carrier_name: value.carrier_name,
      call_count: value.count,
      typical_lanes: Array.from(new Set(value.lanes)).slice(0, 3),
    }))
    .sort((a, b) => b.call_count - a.call_count)
    .slice(0, 8);

  const laneCounts = new Map<string, number>();
  calls.forEach((call) => {
    if (!call.load_matched) return;
    const lane = `${call.load_matched.origin} → ${call.load_matched.destination}`;
    laneCounts.set(lane, (laneCounts.get(lane) ?? 0) + 1);
  });

  const frequentLanes = Array.from(laneCounts.entries())
    .map(([lane, call_count]) => ({ lane, call_count }))
    .sort((a, b) => b.call_count - a.call_count)
    .slice(0, 8);

  return {
    repeat_callers: repeatCallers,
    frequent_lanes: frequentLanes,
  };
};
