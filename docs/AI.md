# AI features

Every AI feature goes through one gateway (`server/src/services/ai/gateway.js`).

## How it works

1. The feature's **rules** always produce an answer first.
2. If a provider is configured, the budget allows it and the feature has something to
   show the model, the model is asked.
3. The model's reply is **parsed and clamped by the feature's own safety code** before
   it is used. If anything goes wrong (no key, timeout, bad reply, spent budget), the
   rules answer instead. A feature can never break because of the model.

## Settings (`server/.env`)

| Variable               | Default            | Meaning                                      |
| ---------------------- | ------------------ | -------------------------------------------- |
| `AI_PROVIDER`          | `none`             | `none` (rules only) or `anthropic`           |
| `ANTHROPIC_API_KEY`    | (blank)            | Required when the provider is `anthropic`    |
| `AI_MODEL`             | `claude-haiku-5-5` | Model used for calls                         |
| `AI_TIMEOUT_MS`        | `15000`            | Give up on a model call after this long      |
| `AI_MAX_CALLS_PER_DAY` | `500`              | Hard cap on model calls per rolling 24 hours |

## Crate triage (`POST /api/ai/triage`, approved farmers only)

- Input: produce code, ticked defects, optional photo (base64 JPEG, PNG or WebP, about 1 MB).
- The model only reports **visible defects**. Grade, sellability and shelf life are always
  computed in code from the defect list.
- `rot`, `mould` and `slime` mean the crate is **never sold**, whatever else is true.
- Defects the farmer ticked are never removed by the model.
- Shelf life never exceeds the catalog value for that produce.
- Photos are **not stored**. When `AI_PROVIDER=anthropic`, the photo is sent to Anthropic
  for grading and then discarded.
- Each farmer can grade 30 times per hour.

## Monitoring

Every call writes an `AiLog` row (who answered, fallback reason, latency, tokens). Rows
delete themselves after 90 days. `provider_off` is also logged when a feature has nothing
for the model to look at, such as triage without a photo.
