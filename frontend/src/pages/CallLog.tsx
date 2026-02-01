import React, { useEffect, useMemo, useState } from "react";
import Panel from "../components/Panel";
import LoadingState from "../components/LoadingState";
import ErrorState from "../components/ErrorState";
import Modal from "../components/Modal";
import { demoCalls } from "../data/demoData";
import { fetchCallById, fetchCalls } from "../data/api";
import { CallRecord } from "../data/types";

type Mode = "demo" | "live";

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m ${rem}s`;
};

const outcomeLabel = (outcome: CallRecord["outcome"]) => {
  switch (outcome) {
    case "booked":
      return "Verified & Booked";
    case "no_deal":
      return "Verified & No Deal";
    case "failed_verification":
      return "Failed Verification";
    case "dropped":
      return "Dropped/Incomplete";
    case "transferred":
      return "Transferred";
    default:
      return outcome;
  }
};

/** Pacific Time (San Francisco). Backend sends UTC without "Z", so treat as UTC for correct conversion. */
const PT = "America/Los_Angeles";
const parseAsUTC = (value: string): string => {
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !/[Z+-]\d{2}:?\d{2}$/.test(s) && !s.endsWith("Z")) return s + "Z";
  return s;
};
const formatDate = (value: string | null | undefined): string => {
  if (value == null || value === "") return "—";
  const d = new Date(parseAsUTC(String(value)));
  return isNaN(d.getTime()) ? String(value) : d.toLocaleString(undefined, { timeZone: PT });
};

export default function CallLog({ mode }: { mode: Mode }) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(mode === "live");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CallRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
    fetchCalls({ query, outcome: outcomeFilter, sentiment: sentimentFilter })
      .then((res) => {
        if (!active) return;
        setCalls(res);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "Failed to load call log.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, query, outcomeFilter, sentimentFilter]);

  const filteredCalls = useMemo(() => {
    const base = mode === "demo" ? demoCalls : calls;
    return base.filter((call) => {
      if (outcomeFilter && call.outcome !== outcomeFilter) return false;
      if (sentimentFilter && call.sentiment !== sentimentFilter) return false;
      if (!query) return true;
      const haystack = [
        call.mc_number,
        call.carrier_name,
        call.load_matched?.load_id ?? "",
        call.load_matched?.origin ?? "",
        call.load_matched?.destination ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query.toLowerCase());
    });
  }, [mode, calls, query, outcomeFilter, sentimentFilter]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    if (mode === "demo") {
      setDetail(demoCalls.find((call) => call.id === selectedId) ?? null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    fetchCallById(selectedId)
      .then((res) => {
        if (!active) return;
        setDetail(res);
      })
      .catch(() => {
        if (!active) return;
        setDetail(null);
      })
      .finally(() => {
        if (!active) return;
        setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId, mode]);

  if (loading) {
    return <LoadingState label="Loading call log..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Call Log"
        description="Search and filter inbound carrier call records."
        action={
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            {filteredCalls.length} calls
          </span>
        }
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search MC, carrier, load, or lane"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={outcomeFilter}
            onChange={(event) => setOutcomeFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">All Outcomes</option>
            <option value="booked">Verified & Booked</option>
            <option value="no_deal">Verified & No Deal</option>
            <option value="failed_verification">Failed Verification</option>
            <option value="dropped">Dropped/Incomplete</option>
            <option value="transferred">Transferred</option>
          </select>
          <select
            value={sentimentFilter}
            onChange={(event) => setSentimentFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">All Sentiments</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
            <option value="frustrated">Frustrated</option>
          </select>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">Timestamp</th>
                <th>MC Number</th>
                <th>Carrier Name</th>
                <th>Load Matched</th>
                <th>Outcome</th>
                <th>Sentiment</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCalls.map((call) => (
                <tr
                  key={call.id}
                  className="cursor-pointer text-slate-600 hover:bg-slate-50"
                  onClick={() => setSelectedId(call.id)}
                >
                  <td className="py-2 text-slate-900">
                    {formatDate(call.timestamp)}
                  </td>
                  <td>{call.mc_number}</td>
                  <td>{call.carrier_name}</td>
                  <td>{call.load_matched?.load_id ?? "—"}</td>
                  <td>{outcomeLabel(call.outcome)}</td>
                  <td className="capitalize">{call.sentiment}</td>
                  <td>{formatDuration(call.call_duration_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title="Call Detail"
      >
        {detailLoading ? (
          <LoadingState label="Loading call detail..." />
        ) : detail ? (
          <div className="space-y-6 text-sm text-slate-700">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-900">
                  Carrier Info
                </h4>
                <div className="mt-2 space-y-1">
                  <p>MC#: {detail.mc_number}</p>
                  <p>Carrier: {detail.carrier_name}</p>
                  <p>
                    Verification:{" "}
                    {detail.fmcsa_verified ? "Verified" : "Failed"}
                  </p>
                  {(detail.call_search_prefs?.equipment_type ||
                    detail.load_matched?.equipment_type) && (
                    <p>
                      Equipment:{" "}
                      {detail.call_search_prefs?.equipment_type ||
                        detail.load_matched?.equipment_type}
                    </p>
                  )}
                  {(detail.call_search_prefs?.min_temp != null ||
                    detail.call_search_prefs?.max_temp != null) && (
                    <p>
                      Refrigeration:{" "}
                      {[
                        detail.call_search_prefs?.min_temp != null
                          ? `${detail.call_search_prefs.min_temp}°F`
                          : null,
                        detail.call_search_prefs?.max_temp != null
                          ? `${detail.call_search_prefs.max_temp}°F`
                          : null,
                      ]
                        .filter((x): x is string => x != null)
                        .join(" – ") || "—"}
                    </p>
                  )}
                  {detail.call_search_prefs &&
                    (detail.call_search_prefs.origin_city != null ||
                      detail.call_search_prefs.origin_state != null) && (
                      <p>
                        Origin:{" "}
                        {[
                          detail.call_search_prefs.origin_city,
                          detail.call_search_prefs.origin_state,
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </p>
                    )}
                  {detail.call_search_prefs &&
                    (detail.call_search_prefs.destination_city != null ||
                      detail.call_search_prefs.destination_state != null) && (
                      <p>
                        Destination:{" "}
                        {[
                          detail.call_search_prefs.destination_city,
                          detail.call_search_prefs.destination_state,
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </p>
                    )}
                  {detail.call_search_prefs?.weight_capacity != null && (
                    <p>
                      Weight capacity:{" "}
                      {detail.call_search_prefs.weight_capacity.toLocaleString()}{" "}
                      lb
                    </p>
                  )}
                  {detail.call_search_prefs &&
                    (detail.call_search_prefs.pickup_date != null ||
                      detail.call_search_prefs.departure_date != null ||
                      detail.call_search_prefs.latest_departure_date != null) && (
                      <>
                        {detail.call_search_prefs.pickup_date != null && (
                          <p>
                            Pickup date:{" "}
                            {formatDate(detail.call_search_prefs.pickup_date)}
                          </p>
                        )}
                        {detail.call_search_prefs.departure_date != null && (
                          <p>
                            Departure:{" "}
                            {formatDate(
                              detail.call_search_prefs.departure_date
                            )}
                          </p>
                        )}
                        {detail.call_search_prefs.latest_departure_date !=
                          null && (
                          <p>
                            Latest departure:{" "}
                            {formatDate(
                              detail.call_search_prefs.latest_departure_date
                            )}
                          </p>
                        )}
                      </>
                    )}
                  {detail.call_search_prefs?.notes != null &&
                    detail.call_search_prefs.notes !== "" && (
                      <p>Notes: {detail.call_search_prefs.notes}</p>
                    )}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-900">
                  Outcome
                </h4>
                <p className="mt-2">{outcomeLabel(detail.outcome)}</p>
                <p className="capitalize">Sentiment: {detail.sentiment}</p>
                {detail.sentiment_tone && (
                  <p className="capitalize">Tone: {detail.sentiment_tone}</p>
                )}
                <p className="text-slate-600">
                  Reasoning:{" "}
                  {(() => {
                    const r =
                      detail.sentiment_reasoning != null
                        ? String(detail.sentiment_reasoning).trim()
                        : "";
                    return r || "No reasoning provided.";
                  })()}
                </p>
                <p
                  title={
                    detail.call_duration_seconds > 7200
                      ? "Time between first and last event for this call (event span). Send call_duration_seconds in classify_call for actual call length."
                      : undefined
                  }
                >
                  Duration: {formatDuration(detail.call_duration_seconds)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-900">
                Load matched (offered)
              </h4>
              {detail.load_matched ? (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <p>Load ID: {detail.load_matched.load_id}</p>
                  <p>
                    Lane: {detail.load_matched.origin} →{" "}
                    {detail.load_matched.destination}
                  </p>
                  <p>Equipment: {detail.load_matched.equipment_type}</p>
                  <p>
                    Pickup:{" "}
                    {detail.load_matched.origin || "—"}
                    {detail.load_matched.pickup_datetime
                      ? ` — ${formatDate(detail.load_matched.pickup_datetime)}`
                      : ""}
                  </p>
                  <p>
                    Delivery:{" "}
                    {detail.load_matched.destination || "—"}
                    {detail.load_matched.delivery_datetime
                      ? ` — ${formatDate(detail.load_matched.delivery_datetime)}`
                      : ""}
                  </p>
                  <p>
                    Rate: $
                    {(
                      detail.load_matched.loadboard_rate ||
                      (detail.negotiation?.initial_offer ??
                        detail.negotiation?.final_rate ??
                        0)
                    ).toLocaleString()}
                  </p>
                  {detail.load_matched.weight > 0 && (
                    <p>Weight: {detail.load_matched.weight.toLocaleString()} lb</p>
                  )}
                  {detail.load_matched.commodity_type && (
                    <p>Commodity: {detail.load_matched.commodity_type}</p>
                  )}
                  {(detail.load_matched.miles ?? 0) > 0 && (
                    <p>Miles: {detail.load_matched.miles?.toLocaleString()}</p>
                  )}
                  {detail.load_matched.num_of_pieces != null && detail.load_matched.num_of_pieces > 0 && (
                    <p>Pieces: {detail.load_matched.num_of_pieces}</p>
                  )}
                  {detail.load_matched.dimensions && (
                    <p>Dimensions: {detail.load_matched.dimensions}</p>
                  )}
                  {detail.load_matched.notes && (
                    <p className="md:col-span-2">Notes: {detail.load_matched.notes}</p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-slate-500">No load matched.</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-900">
                Negotiation Summary
              </h4>
              {detail.negotiation ? (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <p>
                    Starting Rate: $
                    {detail.negotiation.initial_offer.toLocaleString()}
                  </p>
                  <p>Rounds: {detail.negotiation.rounds}</p>
                  <p>
                    Counter Offers:{" "}
                    {detail.negotiation.counter_offers.length
                      ? detail.negotiation.counter_offers
                          .map((value) => `$${value}`)
                          .join(", ")
                      : "—"}
                  </p>
                  <p>
                    Final Rate:{" "}
                    {detail.negotiation.final_rate
                      ? `$${detail.negotiation.final_rate.toLocaleString()}`
                      : "—"}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-slate-500">No negotiation recorded.</p>
              )}
            </div>

            {detail.sales_rep_notes ? (
              <div className="rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-900">
                  Sales Rep Notes
                </h4>
                <p className="mt-2 text-slate-600">{detail.sales_rep_notes}</p>
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 p-4 text-slate-500">
              Sales rep handoff: {detail.outcome === "transferred" || detail.outcome === "booked" ? "Yes" : "No"}
            </div>
          </div>
        ) : (
          <ErrorState message="Unable to load call detail." />
        )}
      </Modal>
    </div>
  );
}
