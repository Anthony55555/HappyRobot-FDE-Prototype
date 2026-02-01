import {
  CallRecord,
  CarrierInsights,
  NegotiationMetrics,
  OverviewMetrics,
} from "./types";

const apiBase = (): string => {
  // In dev, always use same origin so Vite proxy forwards /api to backend (avoids cross-origin/CORS issues)
  if (import.meta.env.DEV) return "";
  const envBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (envBase) return envBase.replace(/\/$/, "");
  return "";
};

const buildQuery = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    query.append(key, String(value));
  });
  return query.toString();
};

const handleResponse = async <T,>(res: Response): Promise<T> => {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
};

export const fetchCalls = async (params?: {
  query?: string;
  outcome?: string;
  sentiment?: string;
}): Promise<CallRecord[]> => {
  const query = buildQuery({
    q: params?.query,
    outcome: params?.outcome,
    sentiment: params?.sentiment,
  });
  const url = `${apiBase()}/api/calls${query ? `?${query}` : ""}`;
  const res = await fetch(url);
  return handleResponse(res);
};

export const fetchCallById = async (id: string): Promise<CallRecord> => {
  const res = await fetch(`${apiBase()}/api/calls/${id}`);
  return handleResponse(res);
};

export const fetchOverviewMetrics = async (): Promise<OverviewMetrics> => {
  const res = await fetch(`${apiBase()}/api/metrics/overview`);
  return handleResponse(res);
};

export const fetchNegotiationMetrics = async (): Promise<NegotiationMetrics> => {
  const res = await fetch(`${apiBase()}/api/metrics/negotiations`);
  return handleResponse(res);
};

export const fetchCarrierInsights = async (): Promise<CarrierInsights> => {
  const res = await fetch(`${apiBase()}/api/carriers/insights`);
  return handleResponse(res);
};
