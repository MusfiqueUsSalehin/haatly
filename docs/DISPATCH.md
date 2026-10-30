# Dispatch and delivery

## From order to rider

1. An admin sets each rider up (`PUT /api/admin/riders/:id`): city, vehicle (bike 40 kg and
   12 stops, van 200 kg and 25 stops) and the zones they cover. Riders must be approved
   first. The rider switches `onDuty` on or off (`POST /api/rider/duty`).
2. Dispatch (`npm run dispatch:run` or `POST /api/admin/dispatch`) takes every waiting
   order that is **cash on delivery or a paid wallet order**, and groups them into runs.
3. The rider starts a run, delivers each stop with the customer's code, and the run
   completes when no stop is pending.

## How dispatch decides

- Orders go to a rider who covers their zone, balanced by load against the vehicle size.
  Orders in a zone nobody covers go to the nearest rider and are counted as off-zone.
- Stops sit at zone centres (orders have a delivery area, not GPS). Stop order is
  nearest-neighbour plus 2-opt, deterministic.
- **Nothing is dropped.** A rider with too much for one trip gets extra trips. An order
  that cannot be placed is returned in `unassigned` with a reason (`no_riders`,
  `too_heavy`, `unknown_zone`) and stays waiting.
- Dispatch claims orders with one atomic update, so an order can never be in two runs,
  even if dispatch runs twice at once. It is safe to run repeatedly.

## Order status during delivery

- `placed` while planned: the customer can still cancel, and a cancelled stop is skipped.
- `out_for_delivery` once the rider starts the run: cancelling is no longer possible.
- `delivered` when the rider enters the right code.

## The delivery code

The customer sees a 6-digit code (see ORDERS.md). The rider enters it to deliver.

- Every attempt is counted atomically before it is checked, so parallel guessing gets no
  extra tries. After 5 wrong codes the stop is locked.
- The rider never sees the code, and a rider can only touch their own runs.
- Delivering a cash order marks its cash payment collected (safe to repeat).

## Failed deliveries

The rider marks the stop failed with a reason. The order returns to `placed` with its
stock still reserved, and the next dispatch picks it up. (Orders that keep failing need an
admin to cancel them. A cap on retries can come later.)

## Limits

One run in progress per rider (the database enforces it). Trip numbers count within one
dispatch. The planned distance is a straight-line estimate.
