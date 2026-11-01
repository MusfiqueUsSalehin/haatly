# Earnings and impact

## The earnings ledger

When a delivery completes, one ledger entry is written for each lot the order drew from.
It is built from the exact kilos and prices the order recorded, using the payout rules in
PRICING.md (the farmer gets 72 percent of the sale price, and never less than the
guaranteed floor). Entries are never recalculated, so later price or policy changes
cannot rewrite history.

- One entry per (order, lot): the database enforces it, so recording twice is harmless.
- The floor is checked when an entry is saved: it cannot be stored if the farmer would be
  paid less than the guaranteed minimum for those kilos.
- `platformBdt` can be negative: that is the platform topping up the farmer's floor.
- If recording ever fails, the delivery still succeeds. `npm run earnings:backfill`
  records anything that was missed and reports orders it could not record. Run it
  regularly (the scheduler does this in a later step).

## Farmers (approved farmers only)

- `GET /api/earnings`: totals (kilos, earned, unpaid, paid).
- `GET /api/earnings/entries`: history, newest first, filterable by `status`.

Farmers see only their own money. They never see the platform's margin or customer details.

## Payouts (admins only)

- `GET /api/admin/earnings`: who is owed money, and how much.
- `POST /api/admin/earnings/:farmerId/payout` with `{ "payoutRef": "..." }`: marks everything
  that farmer is owed as paid, with your reference for the transfer (for example a bKash
  transaction id). Each entry is claimed by one atomic update, so it can never be paid
  twice, even if two payouts run at once. Money is sent outside this system for now.

## Impact

For each delivered order: **kilos rescued**, **taka saved** (the bazar value of the kilos
minus what the customer paid, never negative; a lot that cannot be found counts as no
saving) and **CO2e avoided**.

CO2e is an estimate, not a measurement. It uses two stated assumptions, both in
`server/src/constants/impact.js` and returned with every response: 0.5 kg CO2e embodied
per kg of produce, and only 70 percent of rescued produce counted as truly wasted
otherwise.

- `GET /api/impact/me` (customers): your own totals.
- `GET /api/impact` (public): platform totals (orders delivered, kilos rescued, taka
  saved, CO2e, farmer earnings, number of farmers earning). Numbers only. It scans every
  delivered order, so it is cached for 5 minutes.
