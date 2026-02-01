# Voice Workflow Builder API

Minimal FastAPI backend for voice workflow webhook endpoints.

## Project Structure

```
├── app/
│   ├── __init__.py
│   ├── main.py      # FastAPI app & endpoints
│   ├── auth.py      # API key authentication
│   └── storage.py   # SQLite event logging
├── requirements.txt
├── Dockerfile
└── README.md
```

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET/POST | `/schema` | No | Example schema for workflow builders |
| POST | `/verify_carrier` | Yes | Verify carrier MC number (legacy) |
| POST | `/verify_mc` | Yes | Verify MC via FMCSA with event logging |
| POST | `/search_loads` | Yes | Search available loads |
| POST | `/negotiate` | Yes | Load rate negotiation |
| POST | `/log_event` | Yes | Log workflow events |
| POST | `/classify_call` | Yes | Classify call outcome & sentiment |
| POST | `/handoff_context` | Yes | Package context for call transfer |
| GET | `/handoff_summary/{call_id}` | Yes | Get email subject + body for sales-rep handoff (use in Send Email step) |
| POST | `/send_handoff_email` | Yes | Email sales rep the call handoff summary (optional SMTP; returns summary if not configured) |
| POST | `/set_carrier_prefs` | Yes | Set carrier preferences (equipment, temps, radii) |
| GET | `/carrier_profile` | Yes | Get carrier profile by MC number |
| POST | `/set_call_search_prefs` | Yes | Set search preferences for a call |
| GET | `/call_search_prefs` | Yes | Get search preferences by call_id |
| GET | `/find_loads` | Yes | Find loads by call search prefs (mock) |
| GET | `/get_best_load` | Yes | Get best matching load for a call (mock) |
| POST | `/submit_load` | Yes | Submit a load for a call (e.g. from TMS/load board) |

## Load Schema

All loads returned by `/search_loads` follow this standardized schema:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `load_id` | string | Yes | Unique identifier for the load |
| `origin` | string | Yes | Starting location (city, state) |
| `destination` | string | Yes | Delivery location (city, state) |
| `pickup_datetime` | string | Yes | ISO 8601 datetime string for pickup |
| `delivery_datetime` | string | Yes | ISO 8601 datetime string for delivery |
| `equipment_type` | string | Yes | Type of equipment needed (e.g., Dry Van, Reefer, Flatbed) |
| `loadboard_rate` | float | Yes | Listed rate for the load in USD |
| `notes` | string | No | Additional information about the load |
| `weight` | integer | No | Load weight in pounds |
| `commodity_type` | string | No | Type of goods being transported |
| `num_of_pieces` | integer | No | Number of items/pallets/pieces |
| `miles` | integer | No | Distance to travel in miles |
| `dimensions` | string | No | Size measurements (e.g., '53x102') |

### Example Load Object

```json
{
  "load_id": "LD-1001",
  "origin": "Chicago, IL",
  "destination": "Dallas, TX",
  "pickup_datetime": "2024-01-15T10:00:00",
  "delivery_datetime": "2024-01-17T10:00:00",
  "equipment_type": "Dry Van",
  "loadboard_rate": 2100.00,
  "notes": "Standard freight, no touch",
  "weight": 38000,
  "commodity_type": "General Merchandise",
  "num_of_pieces": 24,
  "miles": 920,
  "dimensions": "48x102"
}
```

## Run Locally

### 1. Install dependencies

**On macOS/Linux:**
```bash
python3 -m pip install -r requirements.txt
```

**On Windows or if `pip` is available:**
```bash
pip install -r requirements.txt
```

### 2. Configure environment variables

**Option A: Using .env file (Recommended)**

Copy the example file and edit it with your values:
```bash

cp .env.example .env
```

Then edit `.env` and add your API keys:
```
```bash
API_KEY=devkey123
FMCSA_WEBKEY=your-actual-fmcsa-webkey-here

**Option B: Export in terminal**

```bash
export API_KEY="your-secret-api-key"
export FMCSA_WEBKEY="your-fmcsa-webkey"  # Get from https://mobile.fmcsa.dot.gov/QCDevsite/login
```

**Optional:**
```bash
export FMCSA_BASE_URL="https://mobile.fmcsa.dot.gov/qc/services"  # Default, can override
# Sales rep handoff email (POST /send_handoff_email):
export SMTP_HOST=smtp.example.com
export SMTP_PORT=587
export SMTP_USER=your-smtp-user
export SMTP_PASSWORD=your-smtp-password
export SMTP_FROM=noreply@example.com   # optional, defaults to SMTP_USER
export SMTP_USE_TLS=true               # optional, default true
```

> **Note:** The `.env` file is automatically loaded when the server starts. If you use both methods, exported environment variables take precedence over `.env` file values.

### 3. Run the server

**On macOS/Linux:**
```bash
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Or with auto-reload for development:
```bash
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**On Windows or if `uvicorn` is available:**
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Dashboard (React)

A React dashboard in `frontend/` provides **Demo Mode** (offline fake data) and **Live Mode** (data from this API).

### Run the dashboard

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Use the header switch to toggle **Demo** / **Live**.

### Use Live Mode with this backend

1. **Start the FastAPI backend** on port 8000 (see Run Locally above).
2. In `frontend/`, copy the env example and set the API base URL:
   ```bash
   cp .env.example .env
   ```
   Ensure `.env` contains:
   ```
   VITE_API_BASE_URL=http://localhost:8000
   ```
   (Use your actual backend URL if different, e.g. an ngrok URL.)
3. Restart the frontend dev server (`npm run dev`), then switch the dashboard to **Live Mode**.

Live Mode calls these endpoints (no auth):

- `GET /api/calls` – list calls (optional query params: `q`, `outcome`, `sentiment`)
- `GET /api/calls/{call_id}` – single call detail
- `GET /api/metrics/overview` – overview metrics
- `GET /api/metrics/negotiations` – negotiation performance
- `GET /api/carriers/insights` – repeat callers and frequent lanes

Data is built from events in the database: `verify_mc_result`, `negotiation_complete`, `sentiment_classified`, `best_load_retrieved`, etc.

**If a call doesn't show up in the call log:** Ensure every webhook sends a non-empty `call_id` (HappyRobot’s call identifier). If `call_id` is empty, events are still logged under `"unknown"` and appear on the live **[/dashboard](http://localhost:8000/dashboard)** but are excluded from the React call list. Set the `call_id` variable in your workflow for each webhook so the call appears in the dashboard call log.

**Get Data / call_id:** Do **not** use a literal like `"string"` or a schema placeholder as `call_id`. Use the **real call identifier** from your voice session (e.g. the variable HappyRobot provides for the current Web Call / Inbound Voice Agent). The first step (“Get Data” webhook) should return or set that call ID, and every later webhook (verify MC, set prefs, get best load, negotiation, sentiment, log_event, call_output) must send the **same** `call_id`. That way carrier, load, outcome, and sentiment all group under one call and the Latest Call Summary and call log show the full picture. See **WORKFLOW_CALL_ID.md** for details.

### Live testing (sentiment and full workflow)

**Quick checklist to capture and see live data:**

1. **Backend** – From the project root (not `frontend/`):
   ```bash
   python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
2. **Frontend** – In another terminal:
   ```bash
   cd frontend
   npm run dev
   ```
   Ensure `frontend/.env` has `VITE_API_BASE_URL=http://localhost:8000` (or your backend URL). Restart `npm run dev` after changing `.env`.
3. **Dashboard** – Open http://localhost:5173, switch to **Live Mode**.
4. **Workflow** – Use the **same `call_id`** for the whole call (verify, set_call_search_prefs, get_best_load / submit_load, negotiation_complete, sentiment).

**Sales rep handoff email:** When transferring a call to a sales rep, you can email them the full call summary (carrier, load, outcome, sentiment, negotiation) so they have context before taking the call.

- **GET /handoff_summary/{call_id}** (auth required) — Returns `subject` and `body` for the handoff. Use this in a workflow **Send Email** step: call this endpoint, then use the response `body` as the email body and `subject` as the subject. No SMTP config needed on the backend.
- **POST /send_handoff_email** (auth required) — Body: `call_id`, `to_email`, optional `subject`. Builds the same summary and, if `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASSWORD` are set, sends the email. If SMTP is not configured, the response still includes `subject` and `body` so you can send it from your workflow.

Example (get summary only, then send from workflow):
```bash
curl -s -H "Authorization: Bearer devkey123" "https://offertorial-unprofessionally-yang.ngrok-free.dev/handoff_summary/call_abc123"
```
Replace `call_abc123` with a real call_id from your workflow.
Example (send via backend SMTP):
```bash
curl -X POST https://offertorial-unprofessionally-yang.ngrok-free.dev/send_handoff_email \
  -H "Authorization: Bearer devkey123" -H "Content-Type: application/json" \
  -d '{"call_id":"call_abc123","to_email":"rep@example.com"}'
```
Replace `call_abc123` and `rep@example.com` with your call_id and email.

**In the "Accepted: Call ..." path (workflow step-by-step):**

1. **Get webhook** — Add a step that calls your backend to get the email content:
   - **Method:** GET  
   - **URL:** `https://offertorial-unprofessionally-yang.ngrok-free.dev/handoff_summary/YOUR_CALL_ID`  
     Replace `YOUR_CALL_ID` with your workflow’s call_id variable (the same ID you use for verify, sentiment, etc.). Example with a literal id: `https://offertorial-unprofessionally-yang.ngrok-free.dev/handoff_summary/call_abc123`
   - **Headers:** `Authorization: Bearer devkey123` (or your API key).
   - If the builder shows "Variable Schema" / "Not Found": the URL must include the call_id. Map the "Call Id string" variable into the path so the URL is `.../handoff_summary/<call_id>`. With no call_id the backend returns an example so schema discovery works.
   - The response is JSON: `{ "call_id": "...", "subject": "...", "body": "..." }`. Your workflow will expose these as outputs (e.g. `Response Subject`, `Response Body`).

2. **Send email** — Add a "Send email" / "Send a new email message" step right after the Get webhook:
   - **To:** Your email (e.g. yourself for testing).
   - **Subject:** Use the **subject** from the previous step’s response (e.g. map "Response Subject" or the JSON path to the subject field).
   - **Body:** Use the **body** from the previous step’s response (e.g. map "Response Body" or the JSON path to the body field).

The backend builds the full handoff summary (carrier, load, outcome, sentiment, reasoning, negotiation); the workflow only fetches it and sends it. No SMTP config on the backend is required for this flow.

**Alternative (one step):** If your backend has SMTP configured, you can use a single **POST** webhook instead: call **POST /send_handoff_email** with body `{"call_id": "<call_id>", "to_email": "you@example.com"}`. The backend will send the email; you don’t need a separate "Send email" step in the workflow.

**Sentiment:** Send sentiment for a call via **POST /log_event** so it shows in Call Log and **Sentiment Analysis**:

```bash
curl -X POST http://localhost:8000/log_event \
  -H "Authorization: Bearer devkey123" \
  -H "Content-Type: application/json" \
  -d '{"call_id": "YOUR_CALL_ID", "event_type": "sentiment_classified", "payload": {"sentiment": "positive"}}'
```

Use `"sentiment"` or `"sentiment_classification"` in the payload. Values are normalized to: **positive**, **neutral**, **negative**, **frustrated** (e.g. "really positive" → positive, "really negative" → negative).

**Where to see it:** Call Log (Live) → click a call → Sentiment in Outcome card; **Sentiment Analysis** page (counts, trend, drill-down by sentiment); **Overview** → Sentiment Distribution chart.

**Better sentiment with tone:** Classifying on transcript alone can miss how the caller sounded. Add a **tone** variable from a prompt (e.g. “How would you describe the caller’s tone: friendly, flat, annoyed?”) and pass **transcript + tone** into your classifier, then send `sentiment`, `tone`, and optional `sentiment_reasoning` via **POST /classify_call** or **POST /log_event**. See **SENTIMENT_AND_TONE.md** for the full workflow.

## Run with Docker

### Backend only (single container)

**Build:**

```bash
docker build -t voice-api .
```

**Run:**

```bash
docker run -p 8000:8000 -e API_KEY="your-secret-api-key" voice-api
```

### Full solution (backend + frontend with Docker Compose)

Runs the API and the React dashboard together. API at **http://localhost:8000**, dashboard at **http://localhost:5173**. Database is persisted in a Docker volume.

```bash
docker compose up --build
```

Then open **http://localhost:5173** in your browser. Set `API_KEY` (and optionally `FMCSA_WEBKEY`) in a `.env` file or export them; default API key is `devkey123`.

To run in the background:

```bash
docker compose up -d --build
```

## Run with HTTPS (Self-Signed Certs)

### 1. Generate self-signed certificates

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
```

### 2. Run with SSL

```bash
SSL_KEYFILE=./key.pem SSL_CERTFILE=./cert.pem API_KEY="your-secret-api-key" python3 -m app.main
```

Or with uvicorn directly:

```bash
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile ./key.pem --ssl-certfile ./cert.pem
```

### Docker with HTTPS

```bash
docker run -p 8000:8000 \
  -e API_KEY="your-secret-api-key" \
  -e SSL_KEYFILE=/certs/key.pem \
  -e SSL_CERTFILE=/certs/cert.pem \
  -v $(pwd)/certs:/certs \
  voice-api python -m app.main
```

## Example curl Commands

### Health Check (no auth)

```bash
curl http://localhost:8000/health
```

Response:
```json
{"ok": true}
```

### Verify Carrier (Legacy)

Using Bearer token:

```bash
curl -X POST http://localhost:8000/verify_carrier \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{"mc_number": "123456"}'
```

Using X-API-Key header:

```bash
curl -X POST http://localhost:8000/verify_carrier \
  -H "X-API-Key: your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{"mc_number": "123456"}'
```

Response (valid):
```json
{
  "eligible": true,
  "carrier": {"name": "Mock Carrier 123456", "mc_number": "123456"},
  "reason": null
}
```

Response (invalid):
```json
{
  "eligible": false,
  "carrier": {"name": null, "mc_number": "abc"},
  "reason": "MC number must contain only digits"
}
```

### Verify MC (FMCSA with Event Logging)

**Recommended for HappyRobot workflows** - includes automatic event logging.

```bash
curl -X POST http://localhost:8000/verify_mc \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{"call_id": "call-123", "mc_number": "MC-123456"}'
```

Response (eligible):
```json
{
  "ok": true,
  "eligible": true,
  "reason": null,
  "carrier": {
    "name": "ABC Trucking LLC",
    "mc_number": "123456",
    "dot_number": "987654",
    "allowed_to_operate": "Y",
    "out_of_service": "N",
    "safety_rating": "SATISFACTORY",
    "physical_city": "Chicago",
    "physical_state": "IL"
  },
  "raw": { ... }
}
```

Response (not eligible):
```json
{
  "ok": true,
  "eligible": false,
  "reason": "Carrier is currently out of service",
  "carrier": { ... },
  "raw": { ... }
}
```

Response (not found):
```json
{
  "ok": true,
  "eligible": false,
  "reason": "MC not found",
  "carrier": null,
  "raw": null
}
```

### Search Loads

```bash
curl -X POST http://localhost:8000/search_loads \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{"origin": "Chicago", "destination": "Dallas", "equipment_type": "Dry Van"}'
```

Response:
```json
{
  "loads": [
    {
      "load_id": "LD-1001",
      "origin": "Chicago, IL",
      "destination": "Dallas, TX",
      "pickup_datetime": "2024-01-15T10:00:00",
      "delivery_datetime": "2024-01-17T10:00:00",
      "equipment_type": "Dry Van",
      "loadboard_rate": 2100.00,
      "notes": "Standard freight, no touch",
      "weight": 38000,
      "commodity_type": "General Merchandise",
      "num_of_pieces": 24,
      "miles": 920,
      "dimensions": "48x102"
    }
  ]
}
```

### Negotiate

```bash
curl -X POST http://localhost:8000/negotiate \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{"load_id": "LD-1001", "loadboard_rate": 2100, "carrier_counter": 2400, "round": 1}'
```

Response (counter):
```json
{
  "decision": "counter",
  "next_offer": 2275,
  "message": "How about $2275.00? That's the best we can do right now. (2 rounds remaining)"
}
```

Response (accept):
```json
{
  "decision": "accept",
  "next_offer": 2300,
  "message": "We can work with $2300.00. Let's book it!"
}
```

### Log Event

```bash
curl -X POST http://localhost:8000/log_event \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{"call_id": "call-123", "event_type": "negotiation_complete", "payload": {"load_id": "LD-1001", "final_rate": 2250}}'
```

Response:
```json
{"ok": true}
```

### Submit Load (full load for a call)

Send the load you got from your TMS or load board with the call’s `call_id`. All load fields (from the Load Schema) are optional except `call_id`; provide at least `load_id` or `origin`. The load is stored as `best_load_retrieved` and appears in the call log and Call Detail.

```bash
curl -X POST http://localhost:8000/submit_load \
  -H "Authorization: Bearer your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "call_id": "call-123",
    "load_id": "LOAD-319637",
    "origin": "Los Angeles, California",
    "destination": "New York City, New York",
    "equipment_type": "flatbed",
    "loadboard_rate": 1113,
    "pickup_datetime": "2024-01-30T15:00:00",
    "delivery_datetime": "2024-02-02T15:00:00",
    "weight": 42000,
    "commodity_type": "General",
    "miles": 2800,
    "num_of_pieces": 24,
    "dimensions": "53x102",
    "notes": "Standard freight, no touch"
  }'
```

Response:
```json
{"ok": true, "call_id": "call-123", "load": { ... }}
```

### Set Carrier Preferences

```bash
curl -X POST http://localhost:8000/set_carrier_prefs \
  -H "Authorization: Bearer devkey123" \
  -H "Content-Type: application/json" \
  -d '{"mc_number":"402573","equipment_type":"Reefer","reefer_min_temp":32.0,"reefer_max_temp":36.0,"origin_radius_miles":100}'
```

Response:
```json
{
  "ok": true,
  "profile": {
    "id": 1,
    "mc_number": "402573",
    "dot_number": "934932",
    "legal_name": "INLAND TRUCKING INC",
    "physical_city": "MT DORA",
    "physical_state": "FL",
    "equipment_type": "Reefer",
    "reefer_min_temp": 32.0,
    "reefer_max_temp": 36.0,
    "origin_radius_miles": 100,
    "dest_radius_miles": 50,
    "updated_at": "2026-01-29T08:31:13.096027"
  }
}
```

### Get Carrier Profile

```bash
curl -X GET "http://localhost:8000/carrier_profile?mc_number=402573" \
  -H "Authorization: Bearer devkey123"
```

### Set Call Search Preferences

```bash
curl -X POST http://localhost:8000/set_call_search_prefs \
  -H "Authorization: Bearer devkey123" \
  -H "Content-Type: application/json" \
  -d '{"call_id":"test-call-123","mc_number":"402573","origin_city":"Chicago","origin_state":"IL","destination_city":"Dallas","destination_state":"TX","equipment_type":"Reefer"}'
```

Response:
```json
{
  "ok": true,
  "prefs": {
    "id": 1,
    "call_id": "test-call-123",
    "mc_number": "402573",
    "origin_city": "Chicago",
    "origin_state": "IL",
    "destination_city": "Dallas",
    "destination_state": "TX",
    "equipment_type": "Reefer",
    "updated_at": "2026-01-29T08:31:14.319746"
  }
}
```

### Get Call Search Preferences

```bash
curl -X GET "http://localhost:8000/call_search_prefs?call_id=test-call-123" \
  -H "Authorization: Bearer devkey123"
```

## API Docs

FastAPI auto-generates interactive docs:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
