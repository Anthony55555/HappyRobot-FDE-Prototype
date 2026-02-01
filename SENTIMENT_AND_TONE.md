# Sentiment + Tone: Use Tone Across Each Prompt, Then Feed Into the Classifier

The platform’s **built-in classifier** (e.g. Deny Classify, Accept Classify, Neg Classify) is usually trained on or only sees the **transcript**. That doesn’t capture how the caller actually sounded. Tone needs to come from the conversation at each step, then be passed into the classifier.

## The idea

1. **Add a tone variable at each prompt** in the workflow – not just one tone at the end, but a tone rating at each step (e.g. after “Give a summary to the…”, after negotiate output, after accept/deny, etc.).
2. **Collect all those variables** – so you have e.g. `tone_after_summary`, `tone_after_negotiate`, `tone_deny`, `tone_accept`, etc.
3. **Feed all of them into the classifier** – when the classifier runs, its input should include: “This is the tone at each prompt. Use that in your analysis.” So the classifier sees **transcript + tone rating across each prompt**, not just transcript.

That way the classifier is no longer “just on the transcript” – it uses **tone across the conversation** in its analysis.

## 1. Add a tone variable at each prompt

At **every** prompt step where the caller responds (Deny path, Accept path, Negotiate path), add an output that captures **how they sounded in that moment**.

- **In the prompt:**  
  Add something like: “Also rate the caller’s tone in this response in one word: friendly, flat, annoyed, rushed, cooperative, impatient, neutral, frustrated.”
- **Store the answer** in a variable that’s unique to that step, e.g.:
  - After “Give a summary to the…” → `{{tone_after_summary}}` or `{{tone_summary}}`
  - After negotiate output → `{{tone_after_negotiate}}` or `{{tone_negotiate}}`
  - On Deny path → `{{tone_deny}}`
  - On Accept path → `{{tone_accept}}`

So you end up with **one tone variable per prompt** (or per branch), e.g.:

- `{{tone_summary}}`
- `{{tone_negotiate}}`
- `{{tone_deny}}`
- `{{tone_accept}}`

## 2. Pass all tone variables into the classifier

When the **classifier** runs (Deny Classify, Accept Classify, Neg Classify), its input should include **all** of those tone variables, not just the transcript.

- **Classifier input should include:**
  - The transcript (or summary), **and**
  - A clear block of tone data, e.g.:
    - “Tone after summary: {{tone_summary}}. Tone after negotiate: {{tone_negotiate}}. Tone at deny: {{tone_deny}}. Tone at accept: {{tone_accept}}. Use these tone ratings across each prompt in your analysis.”
- **Classifier instruction (idea):**  
  “Given the transcript and the tone rating at each prompt above, choose one overall sentiment: **positive**, **neutral**, **negative**, **frustrated**. Use the tone across each prompt, not just the words.”

So the classifier sees:

- What was said (transcript).
- How they sounded at each step (tone at summary, tone at negotiate, tone at deny/accept, etc.).

That’s what “add a tone variable right across each one of the individual prompts, then add all those variables and say this is the tone, this is the rating of the tone across each prompt – use that in your analysis” means in practice.

## 3. Send the result to the backend

After the classifier runs, send the **same `call_id`** and the classifier’s output (e.g. sentiment, and optionally a single combined tone or short reasoning) to the backend via **POST /classify_call** or **POST /log_event** with `event_type: "sentiment_classified"`. The backend accepts:

- `sentiment` (required)
- `tone` (optional) – e.g. the final tone or “friendly, then annoyed”
- `sentiment_reasoning` (optional) – e.g. “Tone was friendly at summary, frustrated after negotiate → negative.”

The dashboard will show Sentiment, Tone, and Reason in Call Detail.

## 4. Quick checklist

1. **At each prompt** in the workflow (summary, negotiate, deny, accept, etc.), add a tone output and store it in its own variable.
2. **When the classifier runs**, pass **transcript + all those tone variables** into it, with a clear instruction: “This is the tone at each prompt; use that in your analysis.”
3. Send the classifier’s **sentiment** (and optional tone/reasoning) to the backend with the same `call_id`.

So: tone variable at each prompt → collect all of them → feed them all into the classifier so it uses “tone across each prompt” in its analysis, not just the transcript.
