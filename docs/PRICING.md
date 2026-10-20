# Pricing

All money rules live in `server/src/services/pricing/policy.js`. Change a number there
and every price and payout follows.

## The farmer guarantee

| Rule               | Value | Meaning                                                                 |
| ------------------ | ----- | ----------------------------------------------------------------------- |
| `farmerShare`      | 72%   | Share of the consumer price the farmer is paid                          |
| `farmerFloorRatio` | 40%   | The farmer is always paid at least this share of the bazar price per kg |

The floor applies to **what the farmer is paid**, not just the shelf price.

- Farmer floor = 40% of the bazar price.
- Lowest consumer price = floor / 0.72, rounded up to a whole taka (about 56% of bazar).
- So the biggest discount is about **44%** off the bazar price.
- If a price ever fell below that, the farmer would still be paid the floor and the
  platform would cover the difference from its own margin.

Example, tomato at 70 taka bazar: farmer floor 28, lowest shelf price 39, farmer
receives 28.08 at that price.

## Markdown ladder

Each lot gets a spoilage-risk score from 0 (fresh) to 1 (about to spoil):

    risk = time used + grade (A 0, B 0.1, C 0.2) + peak season (0.1)

The score picks the discount from the bazar price:

| Risk       | Discount     |
| ---------- | ------------ |
| below 0.25 | 20%          |
| below 0.50 | 28%          |
| below 0.75 | 36%          |
| 0.75+      | at the floor |

Guarantees (all covered by tests):

- a price is never below the consumer floor and never above the bazar price
- prices are whole taka
- a lot's price only goes down as time passes
- the farmer is never paid less than the floor

## Endpoints

- `GET /api/pricing/policy` (public): the numbers above, for the app to explain.
- `POST /api/pricing/quote` (approved farmers): price, farmer payout and a schedule of how
  the price falls. The shelf life cannot exceed the catalog value for the produce.

## Keeping prices honest

The bazar price per produce item is kept current by an admin through
`PATCH /api/admin/produce/:slug`. Prices follow it automatically.
