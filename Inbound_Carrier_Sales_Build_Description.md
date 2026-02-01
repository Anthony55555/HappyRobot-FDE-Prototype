Inbound Carrier Sales Automation — Build Description (HappyRobot POC)
=====================================================================


Client: Acme Logistics (freight brokerage)
Use case: Automate inbound carrier load sales calls (authenticate → match loads → pitch → negotiate → handoff)
Version: Proof of Concept
Last updated: 2026-01-31




What this build does




This build automates inbound carrier calls so Acme's carrier sales team only spends time on the highest-intent, highest-value conversations.


When a carrier calls in, the AI agent:


1. Authenticates the carrier (MC verification + eligibility).
2. Collects lane and equipment requirements.
3. Searches available loads and pitches the best match(es).
4. Routes the conversation into one of three outcomes:
* Declined (carrier not interested / not a fit)
* Accepted (carrier agrees to take the load at the offered price)
* Negotiation (carrier counteroffers; agent negotiates up to 3 rounds)
5. If a deal is reached, the agent transfers the call to a sales rep with a structured summary of the negotiated terms and call context.
6. Logs the call outcome and sentiment for operational visibility and iteration.


This directly addresses the inbound automation requirements and deliverables outlined in the technical challenge.






Primary user flow (carrier experience)


1.  Call entry and authentication


* The carrier calls via web-call trigger (no phone number purchase required for POC).
* The agent greets the caller and requests an MC number.
* The agent verifies eligibility using FMCSA lookup (or a verification proxy that calls FMCSA).
* If verification fails → outcome = "Failed Verification"; the call is ended politely.


2. Requirements intake (minimal questions to match a load)


* Where are you looking to run? (origin, destination, or preferred lanes)
* Pickup timing constraints (earliest/latest, date window)
* Equipment type (e.g., dry van, reefer, flatbed)
* Any constraints (weight limits, commodity restrictions, team driver needs, etc.)


3. Load search + pitch
* Using the details the carrier entered, it can then search for a given load that matches the characteristics of this case 
* The agent queries the load store/API and returns the top matches.
* For each suggested load, it pitches:
   * Origin → destination
   * Pickup & delivery datetime
   * Equipment type
   * Weight / commodity / notes
   * Loadboard rate (initial offer)
* The agent explicitly asks: "Do you want to take this load at $X?"


4. Outcome routing


1. Declined
* The carrier declines the load(s) or indicates no interest.
* Agent closes the call and logs "Declined" (or "Verified & No Deal").


2. Accepted
* The carrier accepts at the offered price.
* Agent confirms key details (load_id, pickup time, equipment, any notes).
* The agent initiates a warm transfer to a sales rep and passes structured details.


3. Negotiation (up to 3 rounds)
* If the carrier counteroffers, the agent evaluates and responds.
* The agent can accept, counter, or decline based on configured guardrails.
* After 3 back-and-forth attempts, agent either:
   * Accepts (if within limits) → transfer to rep
   * Declines (if outside limits) → logs outcome




Data flow: call-centric model (how everything ties together)




Every call is identified by a single call_id from the moment the carrier connects. All data collected during the call is stored in separate datasets but linked by that same call_id. That gives you one coherent record per call and lets the dashboard track across carrier, load, negotiation, and sentiment.


Flow:


1. Call starts — The voice platform assigns a call_id (e.g. from the web-call or inbound-voice trigger). Every later step sends this same call_id so events attach to the same call.
2. Carrier data (verify) — When the agent verifies the carrier (MC lookup / FMCSA), the result is stored and associated with the call_id: carrier name, MC number, eligibility, verification status. So each call is pre-loaded (or populated) with "who is this carrier?"
3. Carrier dataset (carrier profile) — We capture carrier details on every call: where they're going, where they're coming from, equipment, dates, preferences, etc. Each call is updated with its own full set of this carrier information, so each call has a unique record of what the carrier said that time. That matters because details often change (empty lane today, different equipment next week). For the demo and current MVP we react to and store these details every single time; we don't rely on pre-filled profiles to skip questions. In the future, this per-call data could power saved carrier profiles (e.g. keyed by MC number) so we don't have to re-ask the same carrier about lanes, equipment, and preferences on every call — but for the MVP we only capture per call. Separately, the verify step (MC lookup / FMCSA) populates a carrier profile keyed by MC number with: legal name, physical location (city/state), and when available equipment type or notes. When the same carrier calls again we look up that profile by MC so the agent and dashboard know "who is this carrier?" without re-asking. That profile is updated (upsert) whenever verify runs successfully and FMCSA returns data, so it stays current.
4. Load data (its own dataset) — Search preferences (lane, equipment, dates) are stored per call_id. When the agent finds a load (from the load API or load board), the matched load — load_id, origin, destination, rate, pickup/delivery, equipment, etc. — is stored in its own dataset and linked to the call_id. So you have a clear "what load was offered / accepted" for that call.
5. Negotiation data — If the carrier counteroffers, each round (initial offer, counteroffers, final rate, agreed yes/no) is stored and linked to the call_id. So you have "how did pricing evolve" and "did we close?" for that call.
6. Sentiment — After the call (or at classification), the agent sends a sentiment label (positive, neutral, negative, frustrated) and optional reasoning, again keyed by call_id. So you have "how did the carrier feel?" for that call.


Why this matters: Because carrier, load, negotiation, and sentiment all share the same call_id, the dashboard can show one row per call with carrier name, matched load, outcome, negotiation summary, and sentiment in one place. You can filter by outcome, sentiment, or lane and still see the full picture for each call. That cross-cutting view is what makes the call log, negotiation metrics, and sentiment analysis useful together instead of siloed.


-------------------------------------------------------------------------------


Data model (what the agent searches)
--------------------------------------


Loads are stored behind a simple API or DB table. Each load contains:


  load_id          - Unique identifier
  origin           - Starting location
  destination      - Delivery location
  pickup_datetime  - Date/time for pickup
  delivery_datetime - Date/time for delivery
  equipment_type   - Required equipment
  loadboard_rate   - Listed rate
  notes            - Additional info
  weight           - Load weight
  commodity_type   - Type of goods
  num_of_pieces    - Number of items
  miles            - Distance to travel
  dimensions       - Size measurements


These are the required fields for the POC load dataset.


-------------------------------------------------------------------------------


Negotiation logic (guardrails)
---------------------------------


The negotiation module is intentionally simple and configurable.


Inputs:
* loadboard_rate (initial offer)
* carrier counteroffer(s)
* negotiation ceiling (e.g., max premium over loadboard)
* max rounds (default: 3)


Default policy example (configurable):
* Allow counteroffers up to +25% over loadboard_rate.
* Try to settle by countering toward the midpoint when outside target.
* If counteroffer exceeds ceiling → decline politely and offer best-and-final within ceiling.
* If carrier agrees to best-and-final within 3 rounds → treat as "Agreed" and transfer.


The goal is not "perfect pricing," but a consistent, safe policy that filters low-intent calls, converts reasonable counteroffers, and escalates only when likely to close.


-------------------------------------------------------------------------------


Handoff to sales rep (what gets extracted and sent)
------------------------------------------------------


When the call results in "Agreed" (accepted or negotiated), the system generates a structured payload for the sales rep. This can be sent via email, Slack, CRM note, or internal queue.


Example extracted fields:
* carrier: MC number + carrier name (if available)
* verification_result: eligible / not eligible + reason codes
* load: load_id + lane + pickup/delivery datetimes + equipment type 
* pricing: loadboard_rate, final_rate (agreed), premium/spread, negotiation_rounds
* operational notes: constraints mentioned by carrier, urgency/timing, objections raised
* call metadata: timestamp, duration, transcript link (optional), sentiment label


This gives the rep everything needed to close quickly without re-asking basics.


How the rep receives the handoff (POC): The structured payload is available via API (e.g. GET handoff summary by call_id). Email delivery to the rep is supported when SMTP is configured; otherwise the workflow can call the API and use a "Send Email" step with the returned subject and body. Production can add CRM/Slack connectors using the same payload shape. NOT implemented in the MVP, but easily implemented if needed. 


-------------------------------------------------------------------------------


Call classification (outcome taxonomy)
----------------------------------------


Calls are classified into clear operational buckets (used in dashboard + QA):
* Failed Verification
* Dropped / Incomplete
* Verified & No Deal (declined or no matching load)
* Verified & Booked (agreed and transferred)
* Transferred (if transfer is tracked separately)


-------------------------------------------------------------------------------


Sentiment analysis (why it's included)
-----------------------------------------


We label each call as one of: Positive, Neutral, Negative, Frustrated.


Even if conversion is high, a poor carrier experience can reduce future call-ins, increase escalations to human reps, and create reputation risk. By tracking sentiment over time, Acme can iterate on script phrasing, question order, and negotiation tone and guardrails.


-------------------------------------------------------------------------------


Custom dashboard (operations + product metrics)
--------------------------------------------------


The build includes a lightweight ops dashboard for the health of inbound automation.


1. Overview
* Total inbound calls, verification pass rate, load match rate, transfer rate


2. Negotiation Performance
* Total negotiations, success rate, average premium (final rate – loadboard rate)
* Trend line: loadboard vs final rates over time
* Recent negotiations table: load_id, lane, loadboard rate, final rate, spread, rounds, outcome


3. Call Log
* Search/filter by MC, carrier, load, lane
* Table: timestamp, MC number, carrier name, matched load, outcome, sentiment, call duration
* Drill-in per call: full summary, negotiation steps


4. Sentiment Analysis
* Volume by sentiment bucket, change vs prior period, trend over time
* Click-through to calls in each sentiment category


5. Carrier Insights (beta)
* Repeat callers: multiple calls, typical lanes, outcomes
* Frequently requested lanes: prioritize which lanes to keep "hot"


Note: Demo mode uses representative/fake data. In live mode, calls stream into the same schema and update charts/tables automatically.


-------------------------------------------------------------------------------


 Deployment, security, and reproducibility
---------------------------------------------


* Containerized with Docker for consistent local and cloud deployment.
* API endpoints protected with API key authentication.
* HTTPS supported (self-signed locally; production can use managed TLS).
* Runbook: build container → run API → point HappyRobot workflow/webhooks to API base URL → use web-call trigger to test end-to-end.




Compliance and carrier verification
--------------------------------------


* FMCSA checks: The agent verifies carrier authority status (active/revoked) and insurance via FMCSA lookup. Carriers with out-of-service or ineligible status are marked "Failed Verification" and the call is ended politely. This is for eligibility only; it is not legal or insurance advice.
* Recording and consent: If calls are recorded, carrier consent and disclosure will be implemented before production (or per Acme's policy).
* Disclaimer: The agent does not provide legal or insurance advice; verification is used only to determine eligibility to proceed with load matching.


-------------------------------------------------------------------------------


Other Important Details:

Load source and freshness
-----------------------------


* POC: Loads are supplied via the build's load API (mock or static dataset).
* Production: Load source can be TMS, load board, or manual entry; the API contract supports the same load fields.
* Staleness: For POC, load data is assumed current. For production, integration with TMS/load board should refresh loads and the agent should confirm availability before closing a deal (e.g., "load may already be covered" handling).
* Responsibility: Load data accuracy and freshness are the responsibility of the system feeding the API (Acme or integrated vendor).


-------------------------------------------------------------------------------


Rate and pricing clarity
----------------------------


* Who sets rates: Loadboard rate and negotiation ceilings are configurable; for POC they can be set per load or globally. Production can tie to Acme's lane/customer rules.
* All-in vs. line-haul: POC rates are treated as all-in (line-haul). If Acme uses separate fuel surcharge or accessorials, those can be documented and handled in a later phase.
* Payment terms: Not part of the POC agent flow; assumed standard Acme terms unless otherwise agreed.






Security and data
--------------------


* PII: The system captures MC number, carrier name (from FMCSA when available), and call/event data. Data is stored in the API's persistence layer (e.g., SQLite for POC). PII handling should align with Acme's policies and any DPA for production.
* Data retention and ownership: Retention period and ownership (Acme vs. vendor) should be defined in a production agreement. The build does not auto-purge data.
* Integrations: Handoff payload is structured for easy integration with TMS/CRM; specific connectors are post-POC.


-------------------------------------------------------------------------------


 Scope: web call vs. phone (POC vs. production)
-------------------------------------------------


* POC: The build is demonstrated using a web-call trigger (no purchased phone number). The same API and workflow support inbound voice; the only difference is how the call is initiated.
* Production: A PSTN (phone) number can be added via the voice platform so carriers call a real number; the same agent, verification, load search, negotiation, and handoff logic apply.


-------------------------------------------------------------------------------


Success criteria and POC length
-----------------------------------


* POC success metrics (example):
   * X% of calls complete MC verification.
   * Y% receive at least one load pitch.
   * Z% transfer to a rep (accepted or negotiated).
* Target: N completed calls with outcome and sentiment logged.
* POC duration: e.g., 2-week pilot or 30-day evaluation (to be agreed with Acme).
* Go/no-go: Decision to move to production based on conversion rate, rep feedback, and carrier sentiment (e.g., threshold on "Frustrated" share).


-------------------------------------------------------------------------------


Support and ownership
-------------------------


* Who supports what:
   * Agent logic, prompts, and workflow: HappyRobot / build owner
   * API, FMCSA integration, and dashboard: Build owner (or Acme IT if handed off).
   * Load data and TMS: Acme (or load source owner).
* Escalation: Define a single channel (e.g., Slack or ticketing) for rep or ops to report carrier complaints, wrong outcomes, or technical errors so they can be triaged and fixed.


-------------------------------------------------------------------------------


Known limitations (POC)
---------------------------


* Pricing policy is rules-based (not ML-optimized). Intentional for safety and transparency.
* Load matching is basic (top-N heuristic). Can be upgraded to scoring with lane history and equipment constraints.
* Sentiment labeling is coarse; can be improved with better prompts or an evaluation set.
* Handoff integration (email/CRM/Slack) depends on client stack; payload is already structured for easy integration.


-------------------------------------------------------------------------------


Next steps (if Acme moves forward)
-------------------------------------




* Increase human feeling. Make conversation feel more human like and less automated / outcome driven 
* Tighten verification logic and edge cases (carrier name resolution, partial MC input, retries).
* Add configurable business rules per lane/equipment (premium caps, priority lanes, after-hours behavior).
* Build feedback loop from rep outcomes (booked/not booked after transfer) into the dashboard.
* Add QA tooling: call replay and rubric scoring for negotiation quality and compliance.


-------------------------------------------------------------------------------


Glossary
------------


  MC number      - Motor Carrier number assigned by FMCSA; used to identify and verify carriers.
  Loadboard rate - The listed or initial offer rate for a load (e.g., from a load board or TMS).
  Lane           - Origin → destination pair (e.g., Los Angeles, CA → Dallas, TX).
  FMCSA          - Federal Motor Carrier Safety Administration; source for carrier authority and insurance verification.
  Handoff        - Structured transfer of the call and context to a human sales rep.
  Transfer       - Redirecting the live call to a rep (e.g., warm transfer to a phone number).


-------------------------------------------------------------------------------


Contact and appendix
------------------------


- For technical or scope questions: Anthony Radke, Forward Deployed lead anthony@happyrobot.com, .
- API: Endpoints are documented in the project README; auth is API key (Bearer token).
- Sample handoff payload (JSON): The GET /handoff_summary/{call_id} response returns { "call_id": "...", "subject": "...", "body": "..." } where body is a plain-text summary of carrier, outcome, load, negotiation, and sentiment for use in email or other channels.


-------------------------------------------------------------------------------