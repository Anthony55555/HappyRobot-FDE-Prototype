# Complete Carrier Data Webhook

## Single Webhook After All Data Collection

After you've collected all carrier information through prompts and tools, send ONE webhook with all the data.

---

## Webhook Configuration

### Event Name:
```
Submit Complete Carrier Data
```

### URL:
```
https://offertorial-unprofessionally-yang.ngrok-free.dev/set_call_search_prefs
```

### Headers:
Click "+ Add field" twice:
- **Authorization**: `Bearer devkey123`
- **Content-Type**: `application/json`

### Body (Use JSON tab, NOT Builder):

```json
{
  "call_id": "{{Call Id}}",
  "mc_number": "{{mc_number}}",
  "origin_city": "{{origin_city}}",
  "origin_state": "{{origin_state}}",
  "destination_city": "{{destination_city}}",
  "destination_state": "{{destination_state}}",
  "equipment_type": "{{equipment_type}}",
  "departure_date": "{{departure_date}}",
  "latest_departure_date": "{{latest_departure_date}}",
  "weight_capacity": "{{weight_capacity}}",
  "min_temp": "{{min_temp}}",
  "max_temp": "{{max_temp}}",
  "notes": "{{notes}}"
}
```

**Note:** Keep all values in quotes - the backend handles string-to-number conversion automatically.

---

## Field Mapping

| Your Variable | Description | Example |
|--------------|-------------|---------|
| `{{origin_city}}` | Where carrier is now | "Los Angeles" |
| `{{origin_state}}` | Origin state | "California" |
| `{{destination_city}}` | Where they're heading | "Phoenix" |
| `{{destination_state}}` | Destination state | "Arizona" |
| `{{equipment_type}}` | Trailer type | "Dry Van", "Reefer", "Flatbed" |
| `{{departure_date}}` | Earliest they can leave | "2026-02-01" or "2026-02-01T08:00:00" |
| `{{latest_departure_date}}` | Latest they can leave | "2026-02-03" |
| `{{weight_capacity}}` | Max weight in lbs | "45000" |
| `{{min_temp}}` | Min temp (reefers only) | "32" |
| `{{max_temp}}` | Max temp (reefers only) | "38" |
| `{{notes}}` | Special requirements | "No hazmat, prefer west coast routes" |

---

## What This Does

1. **Saves all carrier data** to the backend database
2. **Makes it queryable** for load matching
3. **Logs the event** for your dashboard
4. **Returns the complete profile** for confirmation

---

## Next Steps After This Webhook

After this webhook completes:

1. **Option A: Use HappyRobot Broker App "Find loads"**
   - Input the saved preferences
   - Get real load matches

2. **Option B: Call your backend (if implementing search)**
   - `GET /call_search_prefs?call_id={{Call Id}}`
   - Use the data to search your mock loads

3. **Present loads to carrier**
   - Show matching loads
   - Begin negotiation

---

## Test It

```bash
curl -X POST https://offertorial-unprofessionally-yang.ngrok-free.dev/set_call_search_prefs \
  -H "Authorization: Bearer devkey123" \
  -H "Content-Type: application/json" \
  -d '{
    "call_id": "test-complete-123",
    "mc_number": "402573",
    "origin_city": "Los Angeles",
    "origin_state": "CA",
    "destination_city": "Phoenix",
    "destination_state": "AZ",
    "equipment_type": "Reefer",
    "departure_date": "2026-02-01T08:00:00",
    "latest_departure_date": "2026-02-03",
    "weight_capacity": "43000",
    "min_temp": "32",
    "max_temp": "38",
    "notes": "Prefer produce loads"
  }'
```

Then check your dashboard:
```
https://offertorial-unprofessionally-yang.ngrok-free.dev/dashboard
```
