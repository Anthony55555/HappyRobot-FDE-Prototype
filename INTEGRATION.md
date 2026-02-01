# Integration Guide: Happy Robot + FMCSA

This document explains how to connect your backend API to the Happy Robot workflow builder and the FMCSA carrier verification API.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HAPPY ROBOT PLATFORM                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   Telephony  │───▶│  STT / TTS   │───▶│   Workflow   │              │
│  │   (Inbound)  │    │              │    │   Builder    │              │
│  └──────────────┘    └──────────────┘    └──────┬───────┘              │
│                                                  │                      │
│                                          Webhook Nodes                  │
│                                          (HTTP POST)                    │
└──────────────────────────────────────────────────┼──────────────────────┘
                                                   │
                                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         YOUR BACKEND API                                │
│                                                                         │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │
│  │ /verify_carrier│  │ /search_loads  │  │  /negotiate    │            │
│  │                │  │                │  │                │            │
│  │  Uses FMCSA    │  │  Query loads   │  │  Accept/Counter│            │
│  │  QCMobile API  │  │  database      │  │  /Reject       │            │
│  └───────┬────────┘  └────────────────┘  └────────────────┘            │
│          │                                                              │
│          ▼           ┌────────────────┐  ┌────────────────┐            │
│  ┌────────────────┐  │ /classify_call │  │/handoff_context│            │
│  │   FMCSA API    │  │                │  │                │            │
│  │   (External)   │  │  Log outcome   │  │  Transfer prep │            │
│  └────────────────┘  └────────────────┘  └────────────────┘            │
│                                                                         │
│                      ┌────────────────┐                                │
│                      │   /log_event   │──▶ SQLite DB ──▶ Dashboard     │
│                      └────────────────┘                                │
└─────────────────────────────────────────────────────────────────────────┘
```

## Part 1: FMCSA API Setup

### Step 1: Get an FMCSA WebKey

1. Go to https://mobile.fmcsa.dot.gov/QCDevsite/logingovInfo
2. Create or sign in with a Login.gov account
3. Log in at https://mobile.fmcsa.dot.gov/QCDevsite/login
4. Click "My WebKeys" → "Get a new WebKey"
5. Fill out the form:
   - **Application Name:** "Carrier Sales Automation"
   - **Type:** Commercial
   - **Description:** "Verify carrier eligibility for load booking"
6. Copy your new WebKey

### Step 2: Configure the Backend

Set the environment variable:

```bash
export FMCSA_WEBKEY="your-webkey-here"
```

Or in your `.env` file:

```
FMCSA_WEBKEY=your-webkey-here
```

### Step 3: Test FMCSA Integration

```bash
curl -X POST http://localhost:8000/verify_carrier \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"mc_number": "123456"}'
```

**Response (with FMCSA configured):**
```json
{
  "eligible": true,
  "carrier": {
    "name": "ABC Trucking LLC",
    "mc_number": "123456",
    "dot_number": "987654",
    "allowed_to_operate": true,
    "safety_rating": "SATISFACTORY"
  },
  "reason": null
}
```

**Response (mock mode - no FMCSA key):**
```json
{
  "eligible": true,
  "carrier": {
    "name": "Mock Carrier 123456",
    "mc_number": "123456"
  },
  "reason": "[MOCK MODE] FMCSA_WEBKEY not configured"
}
```

---

## Part 2: Happy Robot Workflow Setup

### Step 1: Deploy Your Backend

Deploy to a publicly accessible URL. Options:
- **Railway:** `railway up`
- **Fly.io:** `fly launch && fly deploy`
- **AWS/GCP/Azure:** Use your preferred method
- **ngrok (for testing):** `ngrok http 8000`

Your backend URL: `https://your-backend.example.com`

### Step 2: Create the Happy Robot Workflow

In the Happy Robot workflow builder, create these webhook nodes:

#### Webhook Node 1: Verify Carrier

**When to use:** After collecting MC number from caller

```
Method: POST
URL: https://your-backend.example.com/verify_carrier
Headers:
  Authorization: Bearer YOUR_API_KEY
  Content-Type: application/json
Body:
{
  "mc_number": "{{mc_number}}"
}
```

**Use the response:**
- If `eligible` is `true`: Continue to load search
- If `eligible` is `false`: Politely explain: "{{reason}}"

#### Webhook Node 2: Search Loads

**When to use:** After carrier is verified

```
Method: POST
URL: https://your-backend.example.com/search_loads
Headers:
  Authorization: Bearer YOUR_API_KEY
  Content-Type: application/json
Body:
{
  "origin": "{{origin_city}}",
  "destination": "{{destination_city}}",
  "equipment_type": "{{equipment_type}}"
}
```

**Use the response:**
- Pitch load details: origin, destination, loadboard_rate, pickup_datetime
- If no loads match: "I don't have any matching loads right now"

#### Webhook Node 3: Negotiate

**When to use:** When carrier makes a counter-offer

```
Method: POST
URL: https://your-backend.example.com/negotiate
Headers:
  Authorization: Bearer YOUR_API_KEY
  Content-Type: application/json
Body:
{
  "load_id": "{{selected_load_id}}",
  "loadboard_rate": {{loadboard_rate}},
  "carrier_counter": {{carrier_counter_offer}},
  "round": {{negotiation_round}}
}
```

**Use the response:**
- If `decision` is `"accept"`: Confirm booking, transfer to rep
- If `decision` is `"counter"`: Say the counter message, increment round
- If `decision` is `"reject"`: "I'm sorry, we can't meet that rate"

#### Webhook Node 4: Log Events

**When to use:** At key conversation points

```
Method: POST
URL: https://your-backend.example.com/log_event
Headers:
  Authorization: Bearer YOUR_API_KEY
  Content-Type: application/json
Body:
{
  "call_id": "{{call_id}}",
  "event_type": "carrier_verified",
  "payload": {
    "mc_number": "{{mc_number}}",
    "eligible": {{eligible}}
  }
}
```

**Event types to log:**
- `call_started`
- `carrier_verified`
- `load_searched`
- `load_pitched`
- `negotiation_round`
- `deal_accepted`
- `deal_rejected`
- `call_transferred`
- `call_ended`

#### Webhook Node 5: Classify Call (End of Call)

**When to use:** Before ending the call

```
Method: POST
URL: https://your-backend.example.com/classify_call
Headers:
  Authorization: Bearer YOUR_API_KEY
  Content-Type: application/json
Body:
{
  "call_id": "{{call_id}}",
  "outcome": "{{call_outcome}}",
  "sentiment": "{{caller_sentiment}}",
  "carrier_mc": "{{mc_number}}",
  "load_id": "{{load_id}}",
  "final_rate": {{final_rate}},
  "negotiation_rounds": {{total_rounds}},
  "summary": "{{call_summary}}"
}
```

**Outcome values:** `booked`, `declined`, `no_match`, `transferred`, `abandoned`
**Sentiment values:** `positive`, `neutral`, `negative`

#### Webhook Node 6: Handoff Context (Before Transfer)

**When to use:** Before transferring to sales rep

```
Method: POST
URL: https://your-backend.example.com/handoff_context
Headers:
  Authorization: Bearer YOUR_API_KEY
  Content-Type: application/json
Body:
{
  "call_id": "{{call_id}}",
  "carrier_name": "{{carrier_name}}",
  "mc_number": "{{mc_number}}",
  "load_id": "{{load_id}}",
  "agreed_rate": {{agreed_rate}},
  "origin": "{{origin}}",
  "destination": "{{destination}}",
  "pickup_datetime": "{{pickup_datetime}}",
  "notes": "{{conversation_notes}}"
}
```

---

## Part 3: Example Conversation Flow

```
1. Call comes in to Happy Robot
   └── Workflow starts

2. AI: "Thanks for calling! Can I get your MC number?"
   └── Carrier: "MC-123456"

3. [Webhook: verify_carrier]
   └── Response: eligible=true, name="ABC Trucking"

4. AI: "Great, I found ABC Trucking. What lanes are you looking for?"
   └── Carrier: "Chicago to Dallas"

5. [Webhook: search_loads]
   └── Response: 3 matching loads

6. AI: "I have a load from Chicago to Dallas, 920 miles, paying $2,100. 
        Pickup tomorrow, delivery in 2 days. Interested?"
   └── Carrier: "I need at least $2,400"

7. [Webhook: negotiate] (round 1)
   └── Response: decision=counter, next_offer=$2,275

8. AI: "How about $2,275? That's the best we can do right now."
   └── Carrier: "Make it $2,300 and we have a deal"

9. [Webhook: negotiate] (round 2)
   └── Response: decision=accept, next_offer=$2,300

10. AI: "Perfect! $2,300 it is. Let me transfer you to a rep to finalize."
    └── [Webhook: handoff_context]
    └── [Webhook: classify_call] outcome=booked, sentiment=positive
    └── Transfer call to sales rep
```

---

## Part 4: Security Checklist

- [ ] Set strong `API_KEY` environment variable
- [ ] Deploy with HTTPS (Let's Encrypt or equivalent)
- [ ] Never expose `FMCSA_WEBKEY` to the client/workflow
- [ ] Use the same API key in all Happy Robot webhook headers
- [ ] Restrict CORS origins in production
- [ ] Monitor `/log_event` for suspicious activity

---

## Part 5: Environment Variables Summary

```bash
# Required
API_KEY=your-secure-api-key-here

# FMCSA Integration (optional - uses mock if not set)
FMCSA_WEBKEY=your-fmcsa-webkey

# HTTPS (optional - runs HTTP if not set)
SSL_KEYFILE=/path/to/key.pem
SSL_CERTFILE=/path/to/cert.pem
```

---

## Part 6: Endpoint Reference

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/health` | GET | No | Health check |
| `/verify_carrier` | POST | Yes | FMCSA carrier lookup |
| `/search_loads` | POST | Yes | Find matching loads |
| `/negotiate` | POST | Yes | Handle counter-offers |
| `/log_event` | POST | Yes | Log events for metrics |
| `/classify_call` | POST | Yes | Record call outcome |
| `/handoff_context` | POST | Yes | Prep transfer context |
