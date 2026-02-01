"""
FastAPI app for Voice Workflow Builder API.
/schema returns a unique call_id per request so Get Data gives one ID per call for grouping.
"""
import os
import sqlite3
import random
import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

load_dotenv(override=True)

from app.auth import verify_api_key
from app.storage import (
    DB_PATH,
    log_event as db_log_event,
    upsert_carrier_profile,
    get_carrier_profile,
    upsert_call_search_prefs,
    get_call_search_prefs,
    get_distinct_call_ids,
    get_events_by_call_id,
)
from app.fmcsa import lookup_carrier_by_mc, is_carrier_eligible
from app.schemas import (
    Load,
    LoadsResponse,
    SubmitLoadRequest,
    VerifyMcRequest,
    VerifyMcResponse,
    LogEventRequest,
    CallOutputRequest,
    SetCallSearchPrefsRequest,
    HandoffContextRequest,
    SendHandoffEmailRequest,
    ClassifyCallRequest,
)

app = FastAPI(title="Voice Workflow Builder API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _effective_call_id(call_id: Optional[str]) -> str:
    """Use for logging: empty/missing call_id becomes 'unknown' so events still show on live dashboard."""
    return (call_id or "").strip() or "unknown"


def safe_number_convert(value, target_type=float):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return target_type(value)
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        try:
            return target_type(value)
        except (ValueError, TypeError):
            return None
    return None


@app.get("/health")
async def health():
    return {"ok": True}


@app.get("/schema")
@app.post("/schema")
async def get_schema():
    """
    Return schema + a unique call_id for this request. Use as your "Get Data" webhook:
    each call to /schema gets a new call_id; use that same call_id in every later webhook
    so all events for that call group together. No auth required.
    """
    call_id = f"call_{uuid.uuid4().hex[:12]}"
    return {
        "call_id": call_id,
        "verified": False,
        "mc_number": "",
        "carrier": {"legal_name": "", "dot_number": ""},
        "lane": {"origin": "", "destination": "", "pickup_datetime": "", "equipment_type": ""},
        "load": {"load_id": "", "rate": 0, "call_id": call_id},
        "outcome": "",
    }


@app.post("/verify_mc", response_model=VerifyMcResponse)
async def verify_mc(req: VerifyMcRequest, _: bool = Depends(verify_api_key)):
    import httpx
    mc_normalized = req.mc_number.strip().upper().replace("MC", "").replace("-", "").strip()
    cid = _effective_call_id(req.call_id)
    db_log_event(cid, "verify_mc_requested", {"mc_number": mc_normalized, "original_input": req.mc_number})
    fmcsa_webkey = os.getenv("FMCSA_WEBKEY", "")
    if not fmcsa_webkey:
        result = {"ok": True, "eligible": False, "reason": "FMCSA_WEBKEY not configured", "carrier": None, "raw": None}
        db_log_event(cid, "verify_mc_result", result)
        return VerifyMcResponse(**result)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{os.getenv('FMCSA_BASE_URL', 'https://mobile.fmcsa.dot.gov/qc/services')}/carriers/docket-number/{mc_normalized}"
            response = await client.get(url, params={"webKey": fmcsa_webkey})
            if response.status_code == 404:
                result = {"ok": True, "eligible": False, "reason": "MC not found", "carrier": None, "raw": None}
                db_log_event(cid, "verify_mc_result", result)
                return VerifyMcResponse(**result)
            if response.status_code != 200:
                result = {"ok": True, "eligible": False, "reason": f"FMCSA API error: {response.status_code}", "carrier": None, "raw": None}
                db_log_event(cid, "verify_mc_result", result)
                return VerifyMcResponse(**result)
            data = response.json()
            content = data.get("content", [])
            if not content:
                result = {"ok": True, "eligible": False, "reason": "MC not found", "carrier": None, "raw": data}
                db_log_event(cid, "verify_mc_result", result)
                return VerifyMcResponse(**result)
            carrier_raw = content[0].get("carrier", {})
            allowed_to_operate = carrier_raw.get("allowedToOperate", "N")
            out_of_service = carrier_raw.get("outOfService", "N")
            eligible = (allowed_to_operate == "Y") and (out_of_service != "Y")
            reason = None
            if not eligible:
                reason = "Carrier is not allowed to operate" if allowed_to_operate != "Y" else "Carrier is currently out of service"
            carrier_obj = {
                "name": carrier_raw.get("legalName") or carrier_raw.get("dbaName"),
                "mc_number": mc_normalized,
                "dot_number": carrier_raw.get("dotNumber"),
                "allowed_to_operate": allowed_to_operate,
                "out_of_service": out_of_service,
                "safety_rating": carrier_raw.get("safetyRating"),
                "physical_city": carrier_raw.get("phyCity"),
                "physical_state": carrier_raw.get("phyState"),
            }
            upsert_carrier_profile(mc_normalized, {
                "dot_number": carrier_raw.get("dotNumber"),
                "legal_name": carrier_raw.get("legalName") or carrier_raw.get("dbaName"),
                "physical_city": carrier_raw.get("phyCity"),
                "physical_state": carrier_raw.get("phyState"),
            })
            result = {"ok": True, "eligible": eligible, "reason": reason, "carrier": carrier_obj, "raw": carrier_raw}
            db_log_event(cid, "verify_mc_result", {"mc_number": mc_normalized, "eligible": eligible, "reason": reason, "carrier": carrier_obj})
            return VerifyMcResponse(**result)
    except Exception as e:
        result = {"ok": True, "eligible": False, "reason": str(e), "carrier": None, "raw": None}
        db_log_event(cid, "verify_mc_result", result)
        return VerifyMcResponse(**result)


@app.post("/log_event")
async def log_event(req: LogEventRequest, _: bool = Depends(verify_api_key)):
    if req.payload is None:
        return {"ok": True, "schema_probe": True, "expected_body": {"call_id": "string", "event_type": "string", "payload": {}}}
    call_id = (req.call_id or "").strip() or "unknown"
    if not (req.event_type or "").strip():
        db_log_event(call_id, "log_event", req.payload)
        return {"ok": True, "warning": "event_type was empty; payload logged under event_type 'log_event'"}
    db_log_event(call_id, (req.event_type or "").strip(), req.payload)
    out = {"ok": True}
    if call_id == "unknown":
        out["warning"] = "call_id was empty; event logged with call_id 'unknown'. Set call_id in your workflow so this call appears in the call log."
    return out


@app.post("/call_output")
async def call_output(req: CallOutputRequest, _: bool = Depends(verify_api_key)):
    cid = _effective_call_id(req.call_id)
    db_log_event(cid, (req.event_type or "").strip() or "call_output", req.payload)
    return {"ok": True, "call_id": req.call_id, "event_type": req.event_type, "payload": req.payload}


@app.post("/handoff_context")
async def handoff_context(req: HandoffContextRequest, _: bool = Depends(verify_api_key)):
    db_log_event(_effective_call_id(req.call_id), "handoff_initiated", req.model_dump())
    parts = [f"Carrier: {req.carrier_name}", f"MC#: {req.mc_number}", f"Load: {req.load_id}", f"Route: {req.origin} → {req.destination}", f"Agreed Rate: ${req.agreed_rate}", f"Pickup: {req.pickup_datetime}", f"Notes: {req.notes}"]
    return {"ok": True, "summary": " | ".join(p for p in parts if p), "context": req.model_dump()}


@app.post("/classify_call")
async def classify_call(req: ClassifyCallRequest, _: bool = Depends(verify_api_key)):
    db_log_event(_effective_call_id(req.call_id), "call_classified", req.model_dump())
    return {"ok": True, "call_id": req.call_id}


@app.post("/set_call_search_prefs")
async def set_call_search_prefs(req: SetCallSearchPrefsRequest, _: bool = Depends(verify_api_key)):
    cid = _effective_call_id(req.call_id)
    updates = {k: v for k, v in req.model_dump().items() if k != "call_id" and v is not None}
    if req.origin_city is not None: updates["origin_city"] = req.origin_city
    if req.origin_state is not None: updates["origin_state"] = req.origin_state
    if req.destination_city is not None: updates["destination_city"] = req.destination_city
    if req.destination_state is not None: updates["destination_state"] = req.destination_state
    if req.equipment_type is not None: updates["equipment_type"] = req.equipment_type
    if req.weight_capacity is not None: updates["weight_capacity"] = safe_number_convert(req.weight_capacity, int)
    if req.min_temp is not None: updates["min_temp"] = safe_number_convert(req.min_temp, float)
    if req.max_temp is not None: updates["max_temp"] = safe_number_convert(req.max_temp, float)
    if req.notes is not None: updates["notes"] = req.notes
    if req.pickup_date is not None: updates["pickup_date"] = req.pickup_date
    if req.departure_date is not None: updates["departure_date"] = req.departure_date
    if req.latest_departure_date is not None: updates["latest_departure_date"] = req.latest_departure_date
    prefs = upsert_call_search_prefs(cid, updates)
    db_log_event(cid, "call_search_prefs_updated", updates)
    return {"ok": True, "prefs": prefs}


@app.get("/call_search_prefs")
async def get_call_search_prefs_endpoint(call_id: str, _: bool = Depends(verify_api_key)):
    prefs = get_call_search_prefs(call_id)
    if not prefs:
        raise HTTPException(status_code=404, detail="Call search preferences not found")
    return {"ok": True, "prefs": prefs}


def generate_fake_loads(prefs: dict) -> list:
    origin = f"{prefs.get('origin_city') or 'Los Angeles'}, {prefs.get('origin_state') or 'CA'}"
    dest = f"{prefs.get('destination_city') or 'Phoenix'}, {prefs.get('destination_state') or 'AZ'}"
    eq = prefs.get("equipment_type") or "Van"
    weight = prefs.get("weight_capacity") or 45000
    miles = random.randint(400, 1200)
    loads = []
    for i in range(3):
        rate = round(miles * (2.0 + random.random() * 0.5))
        pickup = datetime.utcnow() + timedelta(days=random.randint(1, 5))
        delivery = pickup + timedelta(days=random.randint(1, 3))
        loads.append({
            "load_id": f"LOAD-{random.randint(100000, 999999)}",
            "origin": origin,
            "destination": dest,
            "pickup_datetime": pickup.isoformat(),
            "delivery_datetime": delivery.isoformat(),
            "equipment_type": eq,
            "loadboard_rate": rate,
            "weight": weight,
            "commodity_type": "General",
            "miles": miles,
        })
    loads.sort(key=lambda x: x["loadboard_rate"], reverse=True)
    return loads


@app.get("/find_loads")
async def find_loads(call_id: str = Query(...), _: bool = Depends(verify_api_key)):
    prefs = get_call_search_prefs(call_id)
    if not prefs:
        raise HTTPException(status_code=404, detail="Call search preferences not found")
    prefs = dict(prefs)
    loads = generate_fake_loads(prefs)
    db_log_event(_effective_call_id(call_id), "loads_found", {"count": len(loads), "origin_city": prefs.get("origin_city"), "destination_city": prefs.get("destination_city"), "equipment_type": prefs.get("equipment_type")})
    return {"ok": True, "call_id": call_id, "loads": loads}


@app.get("/get_best_load")
async def get_best_load(call_id: str = Query(...), _: bool = Depends(verify_api_key)):
    prefs = get_call_search_prefs(call_id)
    if not prefs:
        prefs = {"origin_city": "Los Angeles", "origin_state": "CA", "destination_city": "Phoenix", "destination_state": "AZ", "equipment_type": "Van", "weight_capacity": 45000}
    else:
        prefs = dict(prefs)
    loads = generate_fake_loads(prefs)
    best = loads[0] if loads else None
    if not best:
        raise HTTPException(status_code=404, detail="No loads found")
    db_log_event(_effective_call_id(call_id), "best_load_retrieved", {"load_id": best["load_id"], "rate": best["loadboard_rate"], "origin": best["origin"], "destination": best["destination"]})
    return {"ok": True, "call_id": call_id, "load": best}


@app.post("/submit_load")
async def submit_load(req: SubmitLoadRequest, _: bool = Depends(verify_api_key)):
    """
    Submit a load for a call (e.g. from your TMS or load board).
    Send the full load with call_id; it is stored as best_load_retrieved and surfaces in the call log.
    """
    payload = req.model_dump(exclude={"call_id"}, exclude_none=True)
    if "rate" not in payload and "loadboard_rate" in payload:
        payload["rate"] = payload["loadboard_rate"]
    if not payload.get("load_id") and not payload.get("origin"):
        raise HTTPException(status_code=400, detail="Provide at least load_id or origin")
    db_log_event(_effective_call_id(req.call_id), "best_load_retrieved", payload)
    return {"ok": True, "call_id": req.call_id, "load": payload}


# ---------- Live data & call summary ----------

@app.get("/api/live-data")
async def get_live_data():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT id, call_id, event_type, payload, timestamp FROM events ORDER BY id DESC LIMIT 20")
    events = [dict(row) for row in cursor.fetchall()]
    cursor.execute("SELECT call_id, mc_number, origin_city, origin_state, destination_city, destination_state, equipment_type, departure_date, updated_at FROM call_search_prefs ORDER BY id DESC LIMIT 10")
    calls = [dict(row) for row in cursor.fetchall()]
    cursor.execute("SELECT mc_number, legal_name, physical_city, physical_state, equipment_type, updated_at FROM carrier_profiles ORDER BY id DESC LIMIT 10")
    carriers = [dict(row) for row in cursor.fetchall()]
    cursor.execute("SELECT COUNT(*) as total FROM events")
    total_events = cursor.fetchone()["total"]
    cursor.execute("SELECT COUNT(*) as total FROM call_search_prefs")
    total_calls = cursor.fetchone()["total"]
    conn.close()
    return {"timestamp": datetime.utcnow().isoformat(), "stats": {"total_events": total_events, "total_calls": total_calls, "total_carriers": len(carriers)}, "recent_events": events, "active_calls": calls, "carriers": carriers}


def _parse_payload(payload_str):
    if not payload_str:
        return None
    try:
        return json.loads(payload_str)
    except Exception:
        return None


def _payload_as_dict(raw):
    """Normalize stored payload to a dict. Handles double-encoded JSON (payload sent as string)."""
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        parsed = _parse_payload(raw)
        if isinstance(parsed, dict):
            return parsed
        if isinstance(parsed, str):
            return _payload_as_dict(parsed)  # one more level of encoding
        return {}
    return {}


@app.get("/api/call-summary")
async def get_call_summary():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT call_id FROM events WHERE event_type IN ('verify_mc_result', 'negotiation_complete') ORDER BY id DESC LIMIT 1")
    primary = cursor.fetchone()
    if primary:
        call_id = primary["call_id"]
    else:
        cursor.execute("SELECT call_id FROM events ORDER BY id DESC LIMIT 1")
        latest = cursor.fetchone()
        if not latest:
            conn.close()
            return {"ok": True, "call_id": None, "carrier_summary": "No calls yet.", "load_summary": "No load data yet.", "outcome_summary": "No negotiation outcome yet.", "sentiment_summary": "No sentiment captured yet."}
        call_id = latest["call_id"]

    def get_latest_event(event_type: str):
        cursor.execute("SELECT payload, timestamp FROM events WHERE call_id = ? AND (event_type = ? OR event_type = ?) ORDER BY id DESC LIMIT 1", (call_id, event_type, f'"{event_type}"'))
        return cursor.fetchone()

    verify_row = get_latest_event("verify_mc_result")
    verify_payload = _parse_payload(verify_row["payload"]) if verify_row else {}
    carrier = verify_payload.get("carrier") or {}
    eligible = verify_payload.get("eligible")
    mc_number = carrier.get("mc_number") or verify_payload.get("mc_number") or "Unknown"
    carrier_name = carrier.get("name") or carrier.get("legal_name") or carrier.get("legalName") or ""
    if not carrier_name and mc_number:
        prof = get_carrier_profile(mc_number)
        carrier_name = (prof or {}).get("legal_name") or ""
    carrier_name = carrier_name or "Unknown carrier"
    dot_number = carrier.get("dot_number")
    carrier_summary = f"Carrier {carrier_name} (MC {mc_number}" + (f", DOT {dot_number}" if dot_number else "") + f"). Eligible: {eligible}." if eligible is not None else "Eligibility not recorded."

    negotiation_row = get_latest_event("negotiation_complete")
    negotiation_payload = _parse_payload(negotiation_row["payload"]) if negotiation_row else {}
    best_load_row = get_latest_event("best_load_retrieved")
    best_load_payload = _parse_payload(best_load_row["payload"]) if best_load_row else {}
    load_data = negotiation_payload if negotiation_payload else best_load_payload
    load_summary = "No load data yet."
    if load_data:
        parts = [f"Load from {load_data.get('origin', 'Unknown')} to {load_data.get('destination', 'Unknown')} with {load_data.get('equipment_type', 'Unknown')}."]
        if load_data.get("loadboard_rate") or load_data.get("rate"): parts.append(f"Listed rate ${load_data.get('loadboard_rate') or load_data.get('rate')}.")
        if load_data.get("miles"): parts.append(f"~{load_data.get('miles')} miles.")
        if load_data.get("commodity") or load_data.get("commodity_type"): parts.append(f"Commodity: {load_data.get('commodity') or load_data.get('commodity_type')}.")
        load_summary = " ".join(parts)
    prefs = get_call_search_prefs(call_id)
    if prefs and (prefs.get("min_temp") is not None or prefs.get("max_temp") is not None):
        min_t, max_t = prefs.get("min_temp"), prefs.get("max_temp")
        temp_parts = [str(min_t) if min_t is not None else "", str(max_t) if max_t is not None else ""]
        temp_str = " to ".join(p for p in temp_parts if p)
        if temp_str:
            load_summary += f" Refrigeration: {temp_str}°F."
    outcome_summary = "No negotiation outcome yet."
    if negotiation_payload:
        outcome_summary = f"Outcome: accepted={negotiation_payload.get('accepted')}. Final price ${negotiation_payload.get('final_price')}. Rounds: {negotiation_payload.get('negotiation_rounds')}."
    sentiment_row = get_latest_event("sentiment_classified")
    sentiment_payload = _parse_payload(sentiment_row["payload"]) if sentiment_row else None
    if not sentiment_payload or not (sentiment_payload.get("sentiment_classification") or sentiment_payload.get("sentiment")):
        cursor.execute("SELECT payload, timestamp FROM events WHERE event_type = ? OR event_type = ? ORDER BY id DESC LIMIT 1", ("sentiment_classified", '"sentiment_classified"'))
        orphan = cursor.fetchone()
        if orphan:
            try:
                sentiment_payload = _parse_payload(orphan["payload"])
            except Exception:
                pass
    sentiment = (sentiment_payload or {}).get("sentiment_classification") or (sentiment_payload or {}).get("sentiment")
    reasoning = (sentiment_payload or {}).get("sentiment_reasoning")
    sentiment_summary = f"Sentiment: {sentiment}. Reason: {reasoning}" if sentiment else "No sentiment captured yet."
    conn.close()
    call_id_hint = None
    if call_id in ("string", "unknown", "") or (isinstance(call_id, str) and call_id.strip() in ("string", "unknown", "")):
        call_id_hint = "Use the real call identifier from your voice session (e.g. from Web Call / Get Data), not a literal like 'string'."
    return {"ok": True, "call_id": call_id, "carrier_summary": carrier_summary, "load_summary": load_summary, "outcome_summary": outcome_summary, "sentiment_summary": sentiment_summary, "call_id_hint": call_id_hint}


def _normalize_sentiment(raw):
    if not raw:
        return "neutral"
    s = (raw or "").strip().lower()
    if s in ("positive", "professional & satisfied", "friendly & cooperative", "really positive", "very positive"):
        return "positive"
    if s in ("neutral",):
        return "neutral"
    if s in ("negative", "unprofessional", "really negative", "very negative"):
        return "negative"
    if s in ("frustrated", "impatient", "dismissive", "angry"):
        return "frustrated"
    if "positive" in s:
        return "positive"
    if "negative" in s:
        return "negative"
    if "frustrat" in s or "angry" in s or "impatient" in s:
        return "frustrated"
    return "neutral"


def _build_call_record(call_id: str):
    events = get_events_by_call_id(call_id)
    if not events:
        return None
    by_type = {}
    for e in events:
        key = (e["event_type"] or "").strip().strip('"')
        if key:
            by_type[key] = {"payload": _parse_payload(e["payload"]), "timestamp": e["timestamp"]}
    first_ts = events[0]["timestamp"]
    last_ts = events[-1]["timestamp"]
    try:
        duration_seconds = max(0, int((datetime.fromisoformat(last_ts.replace("Z", "+00:00")) - datetime.fromisoformat(first_ts.replace("Z", "+00:00"))).total_seconds()))
    except Exception:
        duration_seconds = 0
    # Prefer workflow-reported call length (e.g. from classify_call) over event span
    classified = (by_type.get("call_classified") or {}).get("payload") or {}
    if classified.get("call_duration_seconds") is not None:
        reported = safe_number_convert(classified.get("call_duration_seconds"), int)
        if reported is not None and reported >= 0:
            duration_seconds = reported
    verify = (by_type.get("verify_mc_result") or {}).get("payload") or {}
    carrier = verify.get("carrier") or {}
    eligible = verify.get("eligible")
    mc_number = carrier.get("mc_number") or verify.get("mc_number") or ""
    carrier_name = carrier.get("name") or carrier.get("legal_name") or ""
    if not carrier_name and mc_number:
        carrier_name = (get_carrier_profile(mc_number) or {}).get("legal_name") or ""
    carrier_name = carrier_name or "Unknown"
    fmcsa_verified = eligible is True
    verification_status = "failed" if eligible is False else ("verified" if eligible is True else "pending")
    neg = (by_type.get("negotiation_complete") or {}).get("payload") or {}
    best_load = (by_type.get("best_load_retrieved") or {}).get("payload") or {}
    load_data = neg if neg.get("load_id") or neg.get("origin") else best_load
    load_matched = None
    if load_data and (load_data.get("load_id") or load_data.get("origin")):
        load_matched = {
            "load_id": load_data.get("load_id") or "—",
            "origin": load_data.get("origin") or "Unknown",
            "destination": load_data.get("destination") or "Unknown",
            "pickup_datetime": load_data.get("pickup_datetime") or "",
            "delivery_datetime": load_data.get("delivery_datetime") or "",
            "equipment_type": load_data.get("equipment_type") or "Van",
            "loadboard_rate": safe_number_convert(load_data.get("loadboard_rate") or load_data.get("rate")) or 0,
            "weight": safe_number_convert(load_data.get("weight")) or 0,
            "commodity_type": load_data.get("commodity_type") or load_data.get("commodity") or "",
            "miles": safe_number_convert(load_data.get("miles")) or 0,
            "notes": load_data.get("notes") or "",
            "num_of_pieces": safe_number_convert(load_data.get("num_of_pieces"), int),
            "dimensions": load_data.get("dimensions") or "",
        }
    rounds = neg.get("negotiation_rounds") or 0
    if not isinstance(rounds, int):
        try:
            rounds = int(rounds)
        except (ValueError, TypeError):
            rounds = 0
    initial_offer = safe_number_convert(neg.get("loadboard_rate") or neg.get("original_rate") or (load_matched or {}).get("loadboard_rate"))
    counter_offers = [safe_number_convert(x) or 0 for x in neg.get("counter_offers") or []]
    final_rate = safe_number_convert(neg.get("final_price") or neg.get("final_rate"))
    accepted = neg.get("accepted") in (True, "true", "True")
    negotiation = {"rounds": rounds, "initial_offer": initial_offer or (load_matched or {}).get("loadboard_rate") or 0, "counter_offers": counter_offers, "final_rate": final_rate, "agreed": accepted} if (load_matched or neg) else None
    # When load_data came from negotiation_complete without rate/loadboard_rate, show offered rate in load_matched
    if load_matched and (load_matched.get("loadboard_rate") or 0) == 0 and negotiation:
        fallback_rate = negotiation.get("initial_offer") or negotiation.get("final_rate")
        if fallback_rate is not None and fallback_rate > 0:
            load_matched["loadboard_rate"] = fallback_rate
    if not fmcsa_verified and eligible is False:
        outcome = "failed_verification"
    elif not neg:
        outcome = "dropped"
    elif accepted:
        outcome = "booked"
    else:
        outcome = "no_deal"
    # Normalize so we always have dicts (handles payload stored as double-encoded JSON string)
    sentiment_row = _payload_as_dict((by_type.get("sentiment_classified") or {}).get("payload"))
    classified_row = _payload_as_dict((by_type.get("call_classified") or {}).get("payload"))
    sentiment = _normalize_sentiment(
        sentiment_row.get("sentiment_classification")
        or sentiment_row.get("sentiment")
        or classified_row.get("sentiment")
    )
    sentiment_tone = sentiment_row.get("tone") or classified_row.get("tone")
    # Extract reasoning from many possible keys (webhook "Response Reasoning" → sentiment_reasoning, etc.)
    _reasoning_keys = (
        "sentiment_reasoning", "reasoning", "response_reasoning", "sentimentReasoning",
        "reason", "why", "explanation", "Response Reasoning", "Sentiment_Reasoning"
    )
    def _first_reasoning(d: dict) -> Optional[str]:
        if not isinstance(d, dict):
            return None
        for k in _reasoning_keys:
            v = d.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        # Nested payload (e.g. payload.payload from some webhook builders)
        for nested in ("payload", "data", "body"):
            sub = d.get(nested)
            if sub is None:
                continue
            if isinstance(sub, dict):
                found = _first_reasoning(sub)
                if found:
                    return found
            if isinstance(sub, str):
                try:
                    parsed = json.loads(sub)
                    if isinstance(parsed, dict):
                        found = _first_reasoning(parsed)
                        if found:
                            return found
                except Exception:
                    pass
        return None
    sentiment_reasoning = _first_reasoning(sentiment_row) or _first_reasoning(classified_row)
    prefs_row = get_call_search_prefs(call_id)
    call_search_prefs = None
    if prefs_row and isinstance(prefs_row, dict):
        call_search_prefs = {"origin_city": prefs_row.get("origin_city"), "origin_state": prefs_row.get("origin_state"), "destination_city": prefs_row.get("destination_city"), "destination_state": prefs_row.get("destination_state"), "equipment_type": prefs_row.get("equipment_type"), "weight_capacity": safe_number_convert(prefs_row.get("weight_capacity"), int), "min_temp": safe_number_convert(prefs_row.get("min_temp")), "max_temp": safe_number_convert(prefs_row.get("max_temp")), "notes": prefs_row.get("notes"), "pickup_date": prefs_row.get("pickup_date"), "departure_date": prefs_row.get("departure_date"), "latest_departure_date": prefs_row.get("latest_departure_date")}
    return {"id": call_id, "timestamp": first_ts, "mc_number": mc_number or "—", "carrier_name": carrier_name, "fmcsa_verified": fmcsa_verified, "verification_status": verification_status, "load_matched": load_matched, "negotiation": negotiation, "outcome": outcome, "sentiment": sentiment, "sentiment_tone": sentiment_tone, "sentiment_reasoning": sentiment_reasoning, "call_duration_seconds": duration_seconds, "sales_rep_notes": None, "call_search_prefs": call_search_prefs}


def _format_handoff_email(rec: dict) -> tuple:
    """Build subject and plain-text body for a sales-rep handoff email from a call record."""
    call_id = rec.get("id") or rec.get("call_id") or "unknown"
    carrier = rec.get("carrier_name") or "Unknown"
    mc = rec.get("mc_number") or "—"
    outcome = rec.get("outcome") or "—"
    sentiment = (rec.get("sentiment") or "—").capitalize()
    load = rec.get("load_matched") or {}
    neg = rec.get("negotiation") or {}
    lane = f"{load.get('origin') or '—'} → {load.get('destination') or '—'}" if load else "—"
    rate = load.get("loadboard_rate") or neg.get("final_rate") or neg.get("initial_offer")
    rate_str = f"${rate:,.0f}" if rate is not None else "—"
    duration = rec.get("call_duration_seconds")
    duration_str = f"{duration // 60}m {duration % 60}s" if isinstance(duration, (int, float)) and duration >= 0 else "—"
    reasoning = rec.get("sentiment_reasoning") or "No reasoning provided."
    subject = f"Call handoff: {carrier} ({outcome}) — {call_id}"
    lines = [
        f"Call handoff summary — {call_id}",
        "",
        "— Carrier —",
        f"Carrier: {carrier}",
        f"MC#: {mc}",
        f"Verification: {rec.get('verification_status') or '—'}",
        "",
        "— Outcome —",
        f"Outcome: {outcome}",
        f"Sentiment: {sentiment}",
        f"Duration: {duration_str}",
        f"Reasoning: {reasoning}",
        "",
        "— Load —",
        f"Lane: {lane}",
        f"Load ID: {load.get('load_id') or '—'}",
        f"Rate: {rate_str}",
        f"Equipment: {load.get('equipment_type') or '—'}",
        f"Pickup: {load.get('pickup_datetime') or '—'}",
        f"Delivery: {load.get('delivery_datetime') or '—'}",
        "",
        "— Negotiation —",
        f"Rounds: {neg.get('rounds') or 0}",
        f"Final rate: ${neg['final_rate']:,.0f}" if neg.get("final_rate") is not None else "Final rate: —",
        f"Agreed: {neg.get('agreed')}",
        "",
        "View full details in the Call Log.",
    ]
    body = "\n".join(lines)
    return subject, body


@app.get("/handoff_summary/{call_id}")
async def handoff_summary(call_id: str, _: bool = Depends(verify_api_key)):
    """Return subject and body for a sales-rep handoff email. Use in workflow Send Email step."""
    # Empty or placeholder call_id: return example so workflow builders can infer output schema (avoids "Not Found" on schema probe)
    if not (call_id and call_id.strip()) or call_id.strip().lower() in ("schema", "example", "_"):
        return {
            "call_id": "call_example",
            "subject": "Call handoff: Example Carrier (booked) — call_example",
            "body": "Call handoff summary — call_example\n\n— Carrier —\nCarrier: Example Carrier\nMC#: 123456\nVerification: verified\n\n— Outcome —\nOutcome: booked\nSentiment: Positive\nDuration: 2m 30s\nReasoning: Example reasoning.\n\n— Load —\nLane: Los Angeles, CA → New York, NY\nLoad ID: LOAD-123\nRate: $1,500\nEquipment: Van\n\n— Negotiation —\nRounds: 2\nFinal rate: $1,500\nAgreed: True\n\nView full details in the Call Log.",
        }
    rec = _build_call_record(call_id)
    if not rec:
        # Call not in DB yet (e.g. workflow ran before events logged): return example so workflow doesn't get "Details not found"
        return {
            "call_id": call_id,
            "subject": f"Call handoff: (call not found) — {call_id}",
            "body": f"Call handoff summary — {call_id}\n\nNo call record found for this call_id yet (events may not be logged). View full details in the Call Log once data is available.",
        }
    subject, body = _format_handoff_email(rec)
    return {"call_id": call_id, "subject": subject, "body": body}


@app.post("/send_handoff_email")
async def send_handoff_email(req: SendHandoffEmailRequest, _: bool = Depends(verify_api_key)):
    """Build handoff summary and optionally send to sales rep. Set SMTP_* env vars to send."""
    rec = _build_call_record(req.call_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Call not found")
    subject, body = _format_handoff_email(rec)
    subject = (req.subject or "").strip() or subject
    out = {"ok": True, "call_id": req.call_id, "to_email": req.to_email, "subject": subject, "body": body, "sent": False}
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASSWORD")
    if smtp_host and smtp_user and smtp_pass:
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            port = int(os.environ.get("SMTP_PORT", "587"))
            from_addr = os.environ.get("SMTP_FROM") or smtp_user
            use_tls = os.environ.get("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = from_addr
            msg["To"] = req.to_email
            msg.attach(MIMEText(body, "plain"))
            with smtplib.SMTP(smtp_host, port) as smtp:
                if use_tls:
                    smtp.starttls()
                smtp.login(smtp_user, smtp_pass)
                smtp.sendmail(from_addr, [req.to_email], msg.as_string())
            out["sent"] = True
        except Exception as e:
            out["error"] = str(e)
    else:
        out["message"] = "SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASSWORD). Summary returned for use in workflow."
    return out


@app.get("/api/calls")
async def api_list_calls(q: Optional[str] = Query(None), outcome: Optional[str] = Query(None), sentiment: Optional[str] = Query(None)):
    call_ids = get_distinct_call_ids()
    records = []
    for cid in call_ids:
        try:
            rec = _build_call_record(cid)
        except Exception:
            continue
        if not rec:
            continue
        if outcome and rec.get("outcome") != outcome:
            continue
        if sentiment and rec.get("sentiment") != sentiment:
            continue
        if q:
            prefs = rec.get("call_search_prefs") or {}
            haystack = " ".join([str(rec.get("mc_number") or ""), str(rec.get("carrier_name") or ""), str((rec.get("load_matched") or {}).get("load_id") or ""), str((rec.get("load_matched") or {}).get("origin") or ""), str((rec.get("load_matched") or {}).get("destination") or ""), str(prefs.get("origin_city") or ""), str(prefs.get("destination_city") or ""), str(prefs.get("equipment_type") or "")]).lower()
            if q.lower() not in haystack:
                continue
        records.append(rec)
    return records


@app.get("/api/calls/{call_id}")
async def api_get_call(call_id: str):
    rec = _build_call_record(call_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Call not found")
    return rec


def _parse_timestamp_safe(ts) -> Optional[datetime]:
    """Return timezone-aware UTC datetime or None if ts is missing or invalid."""
    if ts is None or (isinstance(ts, str) and not ts.strip()):
        return None
    try:
        s = str(ts).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


@app.get("/api/metrics/overview")
async def api_metrics_overview():
    call_ids = get_distinct_call_ids()
    records = []
    for cid in call_ids:
        try:
            rec = _build_call_record(cid)
            if rec:
                records.append(rec)
        except Exception:
            continue
    total = len(records)
    verified_booked = sum(1 for r in records if r.get("outcome") == "booked")
    verified_no_deal = sum(1 for r in records if r.get("outcome") == "no_deal")
    failed_verification = sum(1 for r in records if r.get("outcome") == "failed_verification")
    dropped_incomplete = sum(1 for r in records if r.get("outcome") == "dropped")
    conversion_rate = round((verified_booked / total * 100), 1) if total else 0
    spreads = []
    for r in records:
        neg, load = r.get("negotiation") or {}, r.get("load_matched") or {}
        lb = safe_number_convert(load.get("loadboard_rate") or load.get("rate"))
        fr = safe_number_convert(neg.get("final_rate"))
        if lb is not None and fr is not None:
            # Premium = final rate above loadboard (positive when carrier negotiated up)
            spreads.append(max(0, float(fr) - float(lb)))
    avg_spread = round(sum(spreads) / len(spreads), 0) if spreads else 0
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=1)
    calls_today = 0
    for r in records:
        dt = _parse_timestamp_safe(r.get("timestamp"))
        if dt is not None and dt > cutoff:
            calls_today += 1
    sentiment_distribution = {"positive": 0, "neutral": 0, "negative": 0, "frustrated": 0}
    for r in records:
        s = r.get("sentiment") or "neutral"
        if s in sentiment_distribution:
            sentiment_distribution[s] += 1
    return {"total_calls": total, "conversion_rate": conversion_rate, "avg_negotiation_spread": avg_spread, "calls_today": calls_today, "call_outcomes": {"verified_booked": verified_booked, "verified_no_deal": verified_no_deal, "failed_verification": failed_verification, "dropped_incomplete": dropped_incomplete}, "sentiment_distribution": sentiment_distribution}


def _effective_loadboard_rate(load: dict, neg: dict) -> float:
    """Loadboard rate with fallback to negotiation initial/final when missing or zero."""
    lb = safe_number_convert(load.get("loadboard_rate") or load.get("rate")) or 0
    if lb > 0:
        return lb
    return safe_number_convert(neg.get("loadboard_rate") or neg.get("original_rate") or neg.get("initial_offer") or neg.get("final_rate")) or 0


@app.get("/api/metrics/negotiations")
async def api_metrics_negotiations():
    call_ids = get_distinct_call_ids()
    records = []
    for cid in call_ids:
        try:
            r = _build_call_record(cid)
            if r and r.get("negotiation") and r.get("load_matched"):
                records.append(r)
        except Exception:
            continue
    total = len(records)
    successes = sum(1 for r in records if (r.get("negotiation") or {}).get("agreed"))
    success_rate = round((successes / total * 100), 1) if total else 0
    spreads_raw = []
    for r in records:
        neg, load = r.get("negotiation") or {}, r.get("load_matched") or {}
        fr = safe_number_convert(neg.get("final_rate"))
        if fr is None:
            continue
        lb = _effective_loadboard_rate(load, neg)
        if lb > 0:
            spreads_raw.append(fr - lb)
    avg_discount = round(sum(spreads_raw) / len(spreads_raw), 0) if spreads_raw else 0
    chart_points = []
    for r in sorted(records, key=lambda x: x.get("timestamp") or ""):
        neg, load = r.get("negotiation") or {}, r.get("load_matched") or {}
        fr = safe_number_convert(neg.get("final_rate"))
        lb = _effective_loadboard_rate(load, neg)
        if fr is not None and lb > 0:
            chart_points.append({"date": (r.get("timestamp") or "")[:10], "loadboard_rate": lb, "final_rate": fr})
    chart_points = chart_points[-24:]
    recent = []
    for r in sorted(records, key=lambda x: x.get("timestamp") or "", reverse=True)[:12]:
        neg, load = r.get("negotiation") or {}, r.get("load_matched") or {}
        lb = _effective_loadboard_rate(load, neg)
        fr = safe_number_convert(neg.get("final_rate")) or 0
        lane = f"{load.get('origin', '')} → {load.get('destination', '')}" if load else "—"
        spread = max(0, fr - lb)
        recent.append({"date": (r.get("timestamp") or "")[:19].replace("T", " "), "load_id": load.get("load_id") or "—", "lane": lane, "loadboard_rate": lb, "final_rate": fr, "spread": spread, "rounds": neg.get("rounds") or 0, "outcome": "agreed" if neg.get("agreed") else "declined"})
    return {"total_negotiations": total, "success_rate": success_rate, "avg_discount": avg_discount, "chart_points": chart_points, "recent_negotiations": recent}


@app.get("/api/carriers/insights")
async def api_carriers_insights():
    call_ids = get_distinct_call_ids()
    records = []
    for cid in call_ids:
        try:
            r = _build_call_record(cid)
            if r:
                records.append(r)
        except Exception:
            continue
    mc_counts, mc_name, mc_lanes = {}, {}, {}
    for r in records:
        mc = r.get("mc_number") or "—"
        mc_counts[mc] = mc_counts.get(mc, 0) + 1
        mc_name[mc] = r.get("carrier_name") or "Unknown"
        load = r.get("load_matched") or {}
        if load.get("origin") and load.get("destination"):
            lane = f"{load['origin']} → {load['destination']}"
            mc_lanes.setdefault(mc, []).append(lane)
    repeat_callers = [{"mc_number": mc, "carrier_name": mc_name[mc], "call_count": n, "typical_lanes": list(dict.fromkeys(mc_lanes.get(mc, [])))[:3]} for mc, n in sorted(mc_counts.items(), key=lambda x: -x[1]) if n > 1][:8]
    lane_counts = {}
    for r in records:
        load = r.get("load_matched") or {}
        if load.get("origin") and load.get("destination"):
            lane = f"{load['origin']} → {load['destination']}"
            lane_counts[lane] = lane_counts.get(lane, 0) + 1
    frequent_lanes = [{"lane": k, "call_count": v} for k, v in sorted(lane_counts.items(), key=lambda x: -x[1])[:8]]
    return {"repeat_callers": repeat_callers, "frequent_lanes": frequent_lanes}


@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard():
    return """
<!DOCTYPE html>
<html>
<head>
    <title>Live Call Monitor</title>
    <meta charset="utf-8">
    <style>
        body { font-family: system-ui; background: #0a0e27; color: #e4e4e7; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px; margin-bottom: 30px; }
        .section { background: #1e1e2e; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #2e2e3e; }
        .section-title { font-size: 18px; margin-bottom: 15px; color: #667eea; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
        .summary-card { background: #2e2e3e; padding: 15px; border-radius: 8px; }
        .summary-card h3 { font-size: 12px; text-transform: uppercase; color: #a1a1aa; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #2e2e3e; }
        .badge { background: #667eea; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
        code { background: #2e2e3e; padding: 2px 6px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="header"><h1>Live Call Monitor</h1><p>Real-time visibility into carrier calls</p></div>
    <div class="section">
        <div class="section-title">Latest Call Summary</div>
        <div class="summary-grid">
            <div class="summary-card"><h3>Carrier</h3><p id="summary-carrier">Loading...</p></div>
            <div class="summary-card"><h3>Load</h3><p id="summary-load">Loading...</p></div>
            <div class="summary-card"><h3>Outcome</h3><p id="summary-outcome">Loading...</p></div>
            <div class="summary-card"><h3>Sentiment</h3><p id="summary-sentiment">Loading...</p></div>
        </div>
        <div id="summary-call-id-hint" style="display:none; margin-top:12px; padding:10px; background:#1e3a5f; border-radius:8px; font-size:13px; color:#93c5fd;"></div>
    </div>
    <div class="section">
        <div class="section-title">Recent Events (Last 20)</div>
        <table><thead><tr><th>Event Type</th><th>Call ID</th><th>Data</th><th>Timestamp</th></tr></thead><tbody id="events-table"></tbody></table>
    </div>
    <script>
        async function fetchData() {
            try {
                const [data, summary] = await Promise.all([fetch('/api/live-data').then(r => r.json()), fetch('/api/call-summary').then(r => r.json())]);
                document.getElementById('total-events').textContent = data.stats?.total_events ?? 0;
                document.getElementById('total-calls').textContent = data.stats?.total_calls ?? 0;
                document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
                document.getElementById('events-table').innerHTML = (data.recent_events || []).map(e => '<tr><td><span class="badge">' + e.event_type + '</span></td><td><code>' + e.call_id + '</code></td><td style="font-size:12px">' + (typeof e.payload === 'string' ? e.payload.substring(0, 80) : JSON.stringify(e.payload).substring(0, 80)) + '</td><td>' + new Date(e.timestamp).toLocaleString() + '</td></tr>').join('');
                const carrier = document.getElementById('summary-carrier'), load = document.getElementById('summary-load'), outcome = document.getElementById('summary-outcome'), sentiment = document.getElementById('summary-sentiment'), hint = document.getElementById('summary-call-id-hint');
                if (summary && summary.call_id) {
                    carrier.textContent = summary.carrier_summary || 'No carrier data yet.';
                    load.textContent = summary.load_summary || 'No load data yet.';
                    outcome.textContent = summary.outcome_summary || 'No negotiation outcome yet.';
                    sentiment.textContent = summary.sentiment_summary || 'No sentiment captured yet.';
                    if (summary.call_id_hint && hint) { hint.textContent = '⚠️ ' + summary.call_id_hint; hint.style.display = 'block'; } else if (hint) hint.style.display = 'none';
                } else {
                    carrier.textContent = 'No calls yet.';
                    load.textContent = 'No load data yet.';
                    outcome.textContent = 'No negotiation outcome yet.';
                    sentiment.textContent = 'No sentiment captured yet.';
                    if (hint) hint.style.display = 'none';
                }
            } catch (e) { console.error(e); }
        }
        setInterval(fetchData, 2000);
        fetchData();
    </script>
    <div class="section" style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
        <div><div class="section-title">Total Events</div><div id="total-events">0</div></div>
        <div><div class="section-title">Active Calls</div><div id="total-calls">0</div></div>
        <div><div class="section-title">Last Update</div><div id="last-update">--:--:--</div></div>
    </div>
</body>
</html>
"""
