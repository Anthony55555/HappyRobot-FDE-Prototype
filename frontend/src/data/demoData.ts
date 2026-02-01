import {
  CallRecord,
  CallSearchPrefs,
  CarrierInsights,
  LoadInfo,
  NegotiationInfo,
  Sentiment,
} from "./types";
import {
  computeCarrierInsights,
  computeNegotiationMetrics,
  computeOverviewMetrics,
} from "./utils";

const cities = [
  "Los Angeles, CA",
  "Phoenix, AZ",
  "Dallas, TX",
  "Houston, TX",
  "Chicago, IL",
  "Atlanta, GA",
  "Savannah, GA",
  "Denver, CO",
  "Las Vegas, NV",
  "Portland, OR",
  "Seattle, WA",
  "Memphis, TN",
  "Nashville, TN",
  "Indianapolis, IN",
  "Charlotte, NC",
  "Orlando, FL",
  "Kansas City, MO",
  "Omaha, NE",
];

const carrierNames = [
  "Blue Horizon Logistics",
  "Summit Freight Co.",
  "Ironwood Transport",
  "Coastal Star Carriers",
  "Pioneer Hauling LLC",
  "Vector Freightlines",
  "Atlas Ridge Transport",
  "Sunline Motor Freight",
  "Prairie Road Logistics",
  "Skyway Transport Group",
];

/** Fixed carrier pool so demo has repeat callers (same MC across multiple calls). */
const demoCarriers: Array<{ mc_number: string; carrier_name: string }> = [
  { mc_number: "112345678", carrier_name: "Blue Horizon Logistics" },
  { mc_number: "223456789", carrier_name: "Summit Freight Co." },
  { mc_number: "334567890", carrier_name: "Ironwood Transport" },
  { mc_number: "445678901", carrier_name: "Coastal Star Carriers" },
  { mc_number: "556789012", carrier_name: "Pioneer Hauling LLC" },
  { mc_number: "667890123", carrier_name: "Vector Freightlines" },
  { mc_number: "778901234", carrier_name: "Atlas Ridge Transport" },
  { mc_number: "889012345", carrier_name: "Sunline Motor Freight" },
  { mc_number: "990123456", carrier_name: "Prairie Road Logistics" },
  { mc_number: "101234567", carrier_name: "Skyway Transport Group" },
];

const commodities = [
  "Beverages",
  "Frozen Foods",
  "Retail Goods",
  "Paper Products",
  "Steel Coils",
  "Automotive Parts",
  "Consumer Electronics",
  "Building Materials",
  "Produce",
  "Pharmaceuticals",
];

const equipmentTypes = ["Van", "Reefer", "Flatbed", "Step Deck"];

const sentiments: Sentiment[] = [
  "positive",
  "neutral",
  "negative",
  "frustrated",
];

/** Fake reasoning per sentiment for demo; pick one to match the gist. */
const sentimentReasons: Record<Sentiment, string[]> = {
  positive: [
    "Caller was cooperative and appreciative of the rate. Said they'd take it and asked about next steps.",
    "Carrier sounded upbeat; agreed to load quickly and mentioned liking the lane.",
    "Tone was friendly throughout. Caller thanked the agent and confirmed booking.",
    "Caller expressed satisfaction with the offer and said they'd run with us again.",
    "Positive tone at summary. Carrier accepted terms and asked when paperwork would come.",
  ],
  neutral: [
    "Caller gave short, factual answers. No strong emotion either way.",
    "Tone was flat but professional. Carrier asked a few clarifying questions and moved on.",
    "Neutral delivery throughout. Caller confirmed details without enthusiasm or frustration.",
    "Businesslike tone. Caller said they'd think about it and call back.",
    "Caller stayed matter-of-fact; provided lane and equipment info without notable tone.",
  ],
  negative: [
    "Caller sounded disappointed with the rate and said it was too low for the lane.",
    "Tone turned negative after counteroffer was rejected. Caller said they'd look elsewhere.",
    "Caller expressed frustration with pickup timing and said dates didn't work.",
    "Negative tone when discussing equipment requirements. Caller said they were misquoted.",
    "Caller sounded unhappy with the load details and declined to book.",
  ],
  frustrated: [
    "Caller became frustrated when put on hold. Said they'd been waiting too long.",
    "Tone was clearly frustrated; caller raised voice and said rates were inconsistent.",
    "Caller expressed frustration with repeated questions and said they'd already given the info.",
    "Frustrated tone after verification delay. Caller threatened to hang up.",
    "Caller was frustrated with the process and said they'd try another broker.",
  ],
};

const mcPrefixes = ["112", "223", "334", "445", "556", "667", "778"];

const loadNotes = [
  "Drop trailer available.",
  "Driver assist required at delivery.",
  "Hazmat endorsement preferred.",
  "Dock high, live load/unload.",
  "Team drivers preferred.",
  "Flexible pickup window.",
];

type Rng = () => number;

const seededRandom = (seed: number): Rng => {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
};

const pick = <T,>(rng: Rng, list: T[]): T => {
  return list[Math.floor(rng() * list.length)];
};

const randomBetween = (rng: Rng, min: number, max: number) => {
  return Math.round(min + (max - min) * rng());
};

const randomTimestamp = (rng: Rng, daysBack: number) => {
  const now = Date.now();
  const offset = randomBetween(rng, 0, daysBack * 24 * 60 * 60 * 1000);
  return new Date(now - offset).toISOString();
};

const buildLoad = (rng: Rng): LoadInfo => {
  const origin = pick(rng, cities);
  let destination = pick(rng, cities);
  while (destination === origin) {
    destination = pick(rng, cities);
  }

  const pickup = new Date();
  pickup.setDate(pickup.getDate() + randomBetween(rng, 1, 5));
  pickup.setHours(randomBetween(rng, 6, 18), 0, 0, 0);
  const delivery = new Date(pickup);
  delivery.setDate(delivery.getDate() + randomBetween(rng, 1, 4));

  const miles = randomBetween(rng, 300, 1800);
  const loadboardRate = Math.round(miles * (2.0 + rng() * 0.8));

  return {
    load_id: `L-${randomBetween(rng, 100000, 999999)}`,
    origin,
    destination,
    pickup_datetime: pickup.toISOString(),
    delivery_datetime: delivery.toISOString(),
    equipment_type: pick(rng, equipmentTypes),
    loadboard_rate: loadboardRate,
    weight: randomBetween(rng, 12000, 45000),
    commodity_type: pick(rng, commodities),
    miles,
  };
};

/** Build demo call search prefs (what carrier requested) from load + rng. */
const buildCallSearchPrefs = (
  rng: Rng,
  load: LoadInfo | null
): CallSearchPrefs | null => {
  if (!load) return null;
  const [originCity, originState] = load.origin.includes(", ")
    ? load.origin.split(", ")
    : [load.origin, ""];
  const [destCity, destState] = load.destination.includes(", ")
    ? load.destination.split(", ")
    : [load.destination, ""];
  const isReefer = load.equipment_type.toLowerCase() === "reefer";
  return {
    origin_city: originCity,
    origin_state: originState || null,
    destination_city: destCity,
    destination_state: destState || null,
    equipment_type: load.equipment_type,
    weight_capacity: load.weight,
    min_temp: isReefer ? randomBetween(rng, -10, 34) : null,
    max_temp: isReefer ? randomBetween(rng, 32, 38) : null,
    notes: rng() > 0.6 ? pick(rng, loadNotes) : null,
    pickup_date: load.pickup_datetime?.slice(0, 10) ?? null,
    departure_date: load.pickup_datetime?.slice(0, 10) ?? null,
    latest_departure_date: load.pickup_datetime
      ? new Date(
          new Date(load.pickup_datetime).getTime() + 2 * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .slice(0, 10)
      : null,
  };
};

const buildNegotiation = (
  rng: Rng,
  load: LoadInfo | null,
  outcome: CallRecord["outcome"]
): NegotiationInfo | null => {
  if (!load || outcome === "failed_verification" || outcome === "dropped") {
    return null;
  }

  const rounds = randomBetween(rng, 0, 3);
  const initial = load.loadboard_rate;
  const counterOffers: number[] = [];

  for (let i = 0; i < rounds; i += 1) {
    const bump = Math.round(initial * (0.02 + rng() * 0.05));
    counterOffers.push(initial + bump + i * 25);
  }

  const agreed =
    outcome === "booked" || outcome === "transferred" || rng() > 0.4;
  const finalRate = agreed
    ? initial + randomBetween(rng, 80, 380)
    : null;

  return {
    rounds,
    initial_offer: initial,
    counter_offers: counterOffers,
    final_rate: finalRate,
    agreed,
  };
};

export const generateDemoCalls = (count = 120): CallRecord[] => {
  const rng = seededRandom(42);
  const calls: CallRecord[] = [];

  for (let i = 0; i < count; i += 1) {
    const verification = rng() > 0.15;
    const dropped = rng() < 0.1;
    const outcome = !verification
      ? "failed_verification"
      : dropped
      ? "dropped"
      : rng() > 0.62
      ? "booked"
      : rng() > 0.4
      ? "no_deal"
      : "transferred";

    const load = verification && !dropped ? buildLoad(rng) : null;
    const negotiation = buildNegotiation(rng, load, outcome);
    const call_search_prefs = buildCallSearchPrefs(rng, load);

    const sentiment = pick(rng, sentiments);
    const reasons = sentimentReasons[sentiment];
    const sentiment_reasoning = pick(rng, reasons);

    const carrier = pick(rng, demoCarriers);
    calls.push({
      id: `call_${randomBetween(rng, 10000, 99999)}`,
      timestamp: randomTimestamp(rng, 14),
      mc_number: carrier.mc_number,
      carrier_name: carrier.carrier_name,
      fmcsa_verified: verification,
      verification_status: verification ? "verified" : "failed",
      load_matched: load,
      negotiation,
      outcome,
      sentiment,
      sentiment_reasoning,
      call_duration_seconds: randomBetween(rng, 240, 980),
      sales_rep_notes: rng() > 0.7 ? pick(rng, loadNotes) : null,
      call_search_prefs: call_search_prefs ?? undefined,
    });
  }

  return calls;
};

export const demoCalls = generateDemoCalls();

export const demoOverview = computeOverviewMetrics(demoCalls);

export const demoNegotiations = computeNegotiationMetrics(demoCalls);

export const demoCarrierInsights: CarrierInsights =
  computeCarrierInsights(demoCalls);
