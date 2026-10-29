/** A payment as the customer sees it. `payUrl` is only known when the charge is created. */
export function describePayment(payment, payUrl = null) {
  return {
    code: payment.code,
    method: payment.method,
    amountBdt: payment.amountBdt,
    status: payment.status,
    expiresAt: payment.expiresAt ?? null,
    ...(payUrl && { payUrl }),
  };
}
