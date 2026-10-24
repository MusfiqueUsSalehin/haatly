# Boxes and the daily shelf

A box is a recipe: a few produce lines, each with a fixed weight. A box never stores how
many are left or what it costs. Both are worked out live from the lots behind each line.

## Why this cannot oversell

- Every lot feeds exactly one line of one box, so two boxes can never fight over the
  same kilos, and two cities can never sell the same lot.
- Units are the stock of the thinnest line divided by that line's weight. A lot that is
  withdrawn, expired or sold out stops counting at once, with no job needed.
- The price is the live lot prices, weighted by kilos left. Lot prices only go down.

## How a lot reaches a city

A lot goes to the nearest city it can still reach fresh: at least 24 hours of shelf life
must remain after the truck trip (truck times come from the hub's `serves` list).

## Box sizes

| Size   | Lines (max) | Kg per line | Share of stock |
| ------ | ----------- | ----------- | -------------- |
| mini   | 3           | 1           | 30%            |
| family | 4           | 1.5         | 45%            |
| bulk   | 6           | 2           | 25%            |

A box needs at least 2 produce lines, and each line enough stock for 2 boxes. Urgent
produce goes in first, and categories are mixed (at most half the lines from one).

## The shelf

Box codes look like `dhaka-family-2026-10-17` (city, size, Bangladesh date). Rebuilding
updates boxes in place, closes boxes that can no longer be built, and closes yesterday's.

- `npm run shelf:build` rebuilds from the terminal.
- `POST /api/admin/shelf/rebuild` (admin) rebuilds from the API.
- An hourly job will do it automatically in a later step. Lots listed after a rebuild
  appear on the shelf at the next one.

## Endpoints (public)

- `GET /api/boxes?city=dhaka`: today's boxes with live units, price and savings. Sold-out
  boxes are hidden.
- `GET /api/boxes/:code`: one box. A sold-out box answers with `soldOut: true`.
