# Call ID in Your HappyRobot Workflow

Each call must have a **single, unique `call_id`** that is used for every webhook in that call. The backend uses `call_id` to group carrier verification, load search prefs, best load, negotiation, and sentiment so the **Latest Call Summary** and **Call Log** show one coherent record per call.

## The problem with "Get Data" / schema placeholders

If your first step is a "Get Data" (or similar) webhook and you use a **literal value** like `"string"` or a schema placeholder as `call_id`:

- All webhooks that send `call_id: "string"` will be stored under that same fake ID.
- The **Latest Call Summary** is now keyed by the **primary** call (from `verify_mc_result` or `negotiation_complete`), so you still see carrier/load/outcome for the real call.
- **Sentiment** might be sent with `call_id: "string"` while verify/negotiation use a different ID → sentiment was missing from the summary. The backend now has a **fallback**: if no sentiment is found for the primary call_id, it uses the most recent `sentiment_classified` event within 30 minutes so sentiment still shows.
- The **Call Log** (React dashboard) excludes `call_id` values like `"string"` and `"unknown"`, so those calls don’t appear in the list.

So even with the fallbacks, **you should fix the workflow** so every step uses the real call ID.

## What to do in HappyRobot

1. **Get the real call ID**  
   Use the variable HappyRobot provides for the **current call** (e.g. from the Web Call / Inbound Voice Agent trigger). That is your `call_id`. It should be a unique value per call (e.g. a UUID or session ID), not the word `"string"` or an example from a schema.

2. **Use it in every webhook**  
   For **every** webhook in the flow (Get Data, Send MC number and validate, Set call search prefs, Get best load, Log event, Call output, Sentiment, etc.), send that **same** `call_id` in the request body (or query param where applicable).

3. **Don’t use schema examples as call_id**  
   If a tool shows a placeholder like `"string"` for `call_id`, replace it with the actual call ID variable (e.g. `{{call_id}}` or whatever your platform uses), not the literal `"string"`.

## How the backend uses call_id

- **Latest Call Summary** (`/api/call-summary`): Picks the **primary** call from the most recent `verify_mc_result` or `negotiation_complete` event, then loads carrier, load, outcome, and sentiment for that `call_id`. If sentiment was sent with a different `call_id`, the backend still tries to show it via the 30‑minute fallback.
- **Call Log** (`/api/calls`): Lists one row per distinct `call_id` (excluding empty and `"unknown"`). Each row is built from all events for that `call_id`.
- **Dashboard hint**: If the primary call_id is `"string"`, `"unknown"`, or empty, the live dashboard shows a short message suggesting you use the real call identifier from the voice session.

Once every webhook sends the same real `call_id`, the Latest Call Summary and Call Log will stay in sync and sentiment will show under the correct call.
