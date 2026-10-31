# Realtime (Socket.IO)

The API server also serves Socket.IO on the same port.

## Connecting

Send your session token in the handshake (never in the URL, which ends up in logs):

    io('https://api.example.com', { auth: { token } })

A connection is refused for a missing or invalid token, or a suspended account. The error's
`data.code` says why (`unauthenticated`, `invalid_token`, `account_suspended`). A session
ends when its token expires: the server sends `session:expired` and disconnects.

## What you receive

| Event            | Who gets it                                              | Payload                                |
| ---------------- | -------------------------------------------------------- | -------------------------------------- |
| `order:update`   | Whoever follows that order                               | `{ orderCode, status, paymentStatus }` |
| `orders:changed` | The order's customer (their own room)                    | `{ orderCode }`: refresh your list     |
| `rider:location` | Customers following an order whose stop is still pending | `{ orderCode, lat, lng, at, ... }`     |
| `run:assigned`   | The rider                                                | `{ runCode, stopCount }`               |
| `run:update`     | The rider                                                | `{ runCode, status, counts }`          |
| `admin:order`    | Admins                                                   | `{ type, orderCode, ... }`             |
| `admin:run`      | Admins                                                   | `{ type, runCode, riderId, ... }`      |
| `run:location`   | Admins                                                   | `{ runCode, riderId, lat, lng, at }`   |

Messages carry no phone numbers, addresses or delivery codes. When you hear that an order
is paid, fetch it over HTTP (`GET /api/orders/:code`) to see its delivery code.

## What you can send

- `order:subscribe` `{ orderCode }` to follow an order. Only its customer or an admin may.
  "Not yours" and "does not exist" get the same answer (`not_found`). Up to 20 orders per
  connection.
- `order:unsubscribe` `{ orderCode }`.
- `rider:location` `{ lat, lng, accuracyM?, heading?, speedKmh? }` (riders with a run in
  progress). Coordinates must be inside Bangladesh, the server stamps the time itself,
  and sends are limited to one per 2 seconds.

Each request gets an acknowledgement `{ ok: true }` or `{ ok: false, error }`. Each
connection may make 30 requests per minute.

## Good to know

- Events only reach clients that are connected. There is no history, so after a
  reconnect, fetch current state over HTTP.
- A suspension takes effect on an open connection the next time it asks for something.
- Publishing is fire-and-forget: if realtime has a problem, checkout, payments and
  delivery are not affected.
- The event bus lives inside one server process. Running several servers would need a
  shared adapter (for example Redis) so events reach every instance.
