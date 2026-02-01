# 🚚 How to Log Load Data

## The Missing Piece

Your dashboard is ready, but you need to add a webhook AFTER the "Find loads" node in your HappyRobot workflow to capture load information.

---

## Add This Webhook After "Find loads"

### Event Name:
```
Log loads found
```

### URL:
```
https://offertorial-unprofessionally-yang.ngrok-free.dev/log_event
```

### Headers:
- **Authorization**: `Bearer devkey123`
- **Content-Type**: `application/json`

### Body (JSON tab - use this exact format):
```json
{
  "call_id": "{{Call Id}}",
  "event_type": "loads_found",
  "payload": {
    "loads_count": {{loads.length}},
    "origin": "{{Prefs Origin City}}, {{Prefs Origin State}}",
    "destination": "{{Prefs Destination City}}, {{Prefs Destination State}}",
    "equipment_type": "{{Prefs Equipment Type}}",
    "search_timestamp": "{{timestamp}}",
    "loads": {{loads}}
  }
}
```

**Important Notes:**
- Use `{{loads.length}}` without quotes to get the count as a number
- Use `{{loads}}` without quotes to pass the full array
- All other fields should be in quotes

---

## What This Captures

When the "Find loads" node completes, this webhook will log:
- ✅ How many loads were found
- ✅ What search criteria was used (origin, destination, equipment)
- ✅ The full list of loads (for detailed analysis)
- ✅ Timestamp of the search

---

## Verify It Works

1. **Add the webhook** in your HappyRobot flow after "Find loads"
2. **Run a test call** through your workflow
3. **Watch your dashboard** at:
   ```
   https://offertorial-unprofessionally-yang.ngrok-free.dev/dashboard
   ```
4. **Look for "loads_found" event** in the "Recent Events" section
5. **Check the "Loads Found" table** - it should show the count

---

## Troubleshooting

**If no loads appear:**
- Check the webhook is AFTER "Find loads" node
- Verify Authorization header is set correctly
- Check the dashboard "Recent Events" for any error events
- Make sure `{{loads}}` variable exists in your workflow

**If you see errors:**
- Switch to JSON tab instead of Builder
- Remove quotes around `{{loads.length}}` and `{{loads}}`
- Ensure all variable names match your workflow exactly
