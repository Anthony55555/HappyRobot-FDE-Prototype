# Sentiment Classification Setup

## Overview
This guide explains how to add **Call Outcome** and **Sentiment Classification** to your HappyRobot negotiation workflow.

---

## 1. Call Outcome Classification (Automatic)

The backend **automatically classifies** call outcomes based on the data you send:

| Outcome | Criteria |
|---------|----------|
| `MC_NOT_VERIFIED` | MC verification failed |
| `ACCEPTED` | Carrier accepted the offer |
| `REJECTED` | Carrier declined initial offer (0 negotiation rounds) |
| `NEGOTIATED_DECLINED` | Carrier negotiated but ultimately declined |

**No action needed** - this happens automatically when you send data to `/log_event`.

---

## 2. Sentiment Classification (HappyRobot Classify Tool)

### Step 1: Add Classify Tool to Your Workflow

After the negotiation completes (before the transfer), add a **Classify** tool node:

1. In HappyRobot workflow builder, click **"+ Add Node"**
2. Select **"AI" → "Classify"**
3. Configure the tool:

**Tool Name:** `Classify Sentiment`

**Prompt:**
```
Based on the entire conversation, classify the carrier's overall sentiment and demeanor.

Consider:
- Their tone throughout the call
- How they responded to the offer
- Their level of patience or frustration
- Their professionalism and courtesy
```

**Categories (Tags):**
- `Professional & Satisfied`
- `Neutral`
- `Impatient`
- `Frustrated`
- `Dismissive`
- `Friendly & Cooperative`

**Output Variable Name:** `sentiment`

---

### Step 2: Extract the Sentiment Classification

After the Classify tool, add an **Extract** tool to get the classification result:

**Tool Name:** `Get Sentiment Result`

**Prompt:**
```
Extract the sentiment classification from the previous classification result.
```

**Fields to Extract:**
- Field name: `carrier_sentiment`
- Type: `string`
- Description: "The classified sentiment of the carrier"

**Output Variable:** `sentiment_result`

---

### Step 3: Send Sentiment to Backend

In your final POST webhook to `/log_event`, add the sentiment field to the JSON body:

**URL:**
```
https://offertatorial-unprofessionally-yang.ngrok-free.dev/log_event
```

**Method:** `POST`

**Headers:**
- `Authorization`: `Bearer devkey123`

**Body (JSON tab):**
```json
{
  "call_id": "{{call_id}}",
  "event_type": "negotiation_complete",
  "payload": {
    "accepted": "{{negotiation.accepted}}",
    "final_price": "{{negotiation.final_price}}",
    "original_rate": "{{load.loadboard_rate}}",
    "negotiation_rounds": "{{negotiation.negotiation_rounds}}",
    "lowest_carrier_offer": "{{negotiation.lowest_carrier_offer}}",
    "load_id": "{{load.load_id}}",
    "origin": "{{load.origin}}",
    "destination": "{{load.destination}}",
    "equipment_type": "{{load.equipment_type}}",
    "commodity": "{{load.commodity_type}}",
    "miles": "{{load.miles}}",
    "sentiment": "{{sentiment_result.carrier_sentiment}}"
  }
}
```

---

## 3. View Results

Open the negotiation results page:
```
https://offertatorial-unprofessionally-yang.ngrok-free.dev/negotiation_results
```

You'll see:
- **📊 Outcome:** Auto-classified (ACCEPTED, REJECTED, NEGOTIATED_DECLINED, MC_NOT_VERIFIED)
- **😊 Sentiment:** The carrier's sentiment from the Classify tool (if provided)

---

## Alternative: Simpler Sentiment Approach

If you don't want to use a separate Classify + Extract step, you can:

1. **Use Extract directly** after the negotiation with a prompt like:
   ```
   Based on the carrier's responses during this call, describe their sentiment in 2-3 words 
   (e.g., "Professional and cooperative", "Impatient", "Frustrated", "Friendly")
   ```

2. **Extract field:** `carrier_sentiment` (string)

3. **Send to backend** in the same way as above

---

## Testing

1. Make a test call to your negotiation agent
2. Go through the full workflow (accept, negotiate, or decline)
3. Check the `/negotiation_results` page to see:
   - The outcome classification
   - The sentiment classification

Both will appear in a highlighted box right under the timestamp!

---

## Troubleshooting

**Sentiment not showing up?**
- Make sure the field name in your Extract/Classify tool matches what you're sending (`sentiment` or `carrier_sentiment`)
- Check the `/log_event` payload in your ngrok logs to verify the sentiment is being sent
- The backend accepts both `sentiment` and `carrier_sentiment` field names

**Outcome classification looks wrong?**
- The backend uses these fields to classify:
  - `mc_verified` (boolean)
  - `accepted` (boolean/string)
  - `negotiation_rounds` (number)
- Make sure these are being sent correctly in your payload
