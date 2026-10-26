# Orders

## Placing an order (`POST /api/orders`, customers only)

The customer sends the delivery details and, for each box, the quantity and the price
they were shown (`seenUnitPriceBdt`).

1. The delivery area decides the city. Boxes must be live, from today's shelf, for that city.
2. The server plans which kilos of which lots fill each box (urgent lots first), from live data.
3. If a box now costs MORE than the customer saw, the order is refused (`price_changed`).
   If it costs less, the customer pays the lower price. Prices only go down.
4. Stock is reserved lot by lot. Each lot is updated in one atomic step that only works
   while the lot is listed, unexpired and still holds enough. If any lot cannot supply
   its share, everything already taken is put back and the order re-plans (up to 3 tries).
5. The order is saved with the exact lot allocations. If saving fails, the stock is put back.

Two orders can therefore never take the same kilos, and a failed order never leaves
stock stuck.

## Delivery code (OTP)

- Six digits, derived from `JWT_SECRET`, the order code and a per-order salt. It is
  never stored, so a database leak reveals nothing.
- Shown only to the customer who owns the order, only while delivery is still to come
  (`placed` or `out_for_delivery`), and only in the place response and the detail view.
  The order list never shows it.
- Rotating `JWT_SECRET` changes the codes of orders still waiting for delivery.

## Cancelling (`POST /api/orders/:code/cancel`)

Allowed only while the order is `placed`. The status change is one atomic step, so of two
simultaneous cancels exactly one wins, and only the winner puts the kilos back.

## Statuses

`placed` -> `out_for_delivery` -> `delivered`, or `placed` -> `cancelled`. Riders and
delivery come in a later step.

## Limits

Up to 5 different boxes per order, 10 of each. Delivery costs 40 taka, free from 500.
Payment is cash on delivery only for now. Each customer can place 20 orders per hour.
