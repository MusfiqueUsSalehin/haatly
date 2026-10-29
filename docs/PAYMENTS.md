# Payments

## Methods

- **Cash on delivery** (`cod`): works with no setup. A pending payment record is created
  with the order and settled when the order is delivered.
- **Wallet** (`wallet`): needs a provider. `PAYMENT_PROVIDER=none` (the default) turns it
  off. `sandbox` pretends to be a gateway for development and is refused in production.

## The wallet flow

1. `POST /api/orders` with `"paymentMethod": "wallet"` reserves the stock, asks the
   gateway for a charge, and returns a `payUrl`. The order waits with its stock held.
2. The customer pays at the gateway. **The browser never says "I paid."** The gateway
   sends a signed event to `POST /api/payments/webhook`.
3. The webhook verifies the signature, checks the order and amount, and marks the order
   paid. Only then does the delivery code appear.
4. If nothing arrives within `PAYMENT_WINDOW_MINUTES`, the maintenance job cancels the
   order and puts the stock back.

## Webhook safety

- The signature covers a timestamp plus the exact raw body, with HMAC-SHA256 and
  `PAYMENT_WEBHOOK_SECRET`. Requests older than 5 minutes are rejected, so a captured
  request cannot be replayed.
- Every outcome is safe to repeat: payments only move forward (`pending` to `succeeded`,
  `failed` or `cancelled`, and `succeeded` to `refunded`), each move being one atomic update.
- Money that arrives after the order was cancelled or expired is refunded, once.
- A failure event never undoes a payment that already succeeded.

## Cancelling and refunds

Cancelling an unpaid order cancels its payment. Cancelling a paid wallet order refunds it
in full. If the gateway is down, the order still cancels, and the refund is retried by
`npm run payments:maintain` (the scheduler runs it automatically in a later step). Refund
calls carry the payment code as an idempotency key, so a retry can never refund twice.

## Cash settlement

`settleCashPayment({ orderCode })` marks the cash as collected. It only works on delivered
cash orders and is safe to call twice. The delivery step calls it in a later step.

## Trying it locally

With `PAYMENT_PROVIDER=sandbox`, a customer can "pay" or fail their own payment with
`POST /api/payments/sandbox/complete` (`{ "providerRef": "SBX-...", "outcome": "succeeded" }`).
That route does not exist when the sandbox is off.

## Settings

| Variable                 | Default           | Meaning                                   |
| ------------------------ | ----------------- | ----------------------------------------- |
| `PAYMENT_PROVIDER`       | `none`            | `none` (cash only) or `sandbox`           |
| `PAYMENT_WEBHOOK_SECRET` | from `JWT_SECRET` | Secret the gateway signs webhooks with    |
| `PAYMENT_WINDOW_MINUTES` | `15`              | How long a wallet order waits for payment |
