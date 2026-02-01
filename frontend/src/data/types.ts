export type CallOutcome =
  | "booked"
  | "no_deal"
  | "failed_verification"
  | "dropped"
  | "transferred";

export type Sentiment = "positive" | "neutral" | "negative" | "frustrated";

export interface LoadInfo {
  load_id: string;
  origin: string;
  destination: string;
  pickup_datetime: string;
  delivery_datetime: string;
  equipment_type: string;
  loadboard_rate: number;
  weight: number;
  commodity_type: string;
  miles: number;
  notes?: string | null;
  num_of_pieces?: number | null;
  dimensions?: string | null;
}

export interface NegotiationInfo {
  rounds: number;
  initial_offer: number;
  counter_offers: number[];
  final_rate: number | null;
  agreed: boolean;
}

/** Call search preferences from the workflow (what the carrier requested). */
export interface CallSearchPrefs {
  origin_city?: string | null;
  origin_state?: string | null;
  destination_city?: string | null;
  destination_state?: string | null;
  equipment_type?: string | null;
  weight_capacity?: number | null;
  min_temp?: number | null;
  max_temp?: number | null;
  notes?: string | null;
  pickup_date?: string | null;
  departure_date?: string | null;
  latest_departure_date?: string | null;
}

export interface CallRecord {
  id: string;
  timestamp: string;
  mc_number: string;
  carrier_name: string;
  fmcsa_verified: boolean;
  verification_status: "verified" | "failed" | "pending";
  load_matched: LoadInfo | null;
  negotiation: NegotiationInfo | null;
  outcome: CallOutcome;
  sentiment: Sentiment;
  /** Caller tone (e.g. friendly, flat, annoyed). From workflow. */
  sentiment_tone?: string | null;
  /** Why this sentiment was chosen (e.g. transcript + tone). */
  sentiment_reasoning?: string | null;
  call_duration_seconds: number;
  sales_rep_notes: string | null;
  /** What the carrier requested (from workflow call search prefs). */
  call_search_prefs?: CallSearchPrefs | null;
}

export interface OverviewMetrics {
  total_calls: number;
  conversion_rate: number;
  avg_negotiation_spread: number;
  calls_today: number;
  call_outcomes: {
    verified_booked: number;
    verified_no_deal: number;
    failed_verification: number;
    dropped_incomplete: number;
  };
  sentiment_distribution: Record<Sentiment, number>;
}

export interface NegotiationMetrics {
  total_negotiations: number;
  success_rate: number;
  avg_discount: number;
  chart_points: Array<{
    date: string;
    loadboard_rate: number;
    final_rate: number;
  }>;
  recent_negotiations: Array<{
    date: string;
    load_id: string;
    lane: string;
    loadboard_rate: number;
    final_rate: number;
    spread: number;
    rounds: number;
    outcome: "agreed" | "declined";
  }>;
}

export interface CarrierInsights {
  repeat_callers: Array<{
    mc_number: string;
    carrier_name: string;
    call_count: number;
    typical_lanes: string[];
  }>;
  frequent_lanes: Array<{
    lane: string;
    call_count: number;
  }>;
}
