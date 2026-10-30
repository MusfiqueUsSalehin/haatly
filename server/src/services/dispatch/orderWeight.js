const round3 = (n) => Math.round(n * 1000) / 1000;

/** Total kilos a rider carries for an order: every box times its quantity. */
export function orderWeightKg(order) {
  const total = order.items.reduce(
    (sum, item) => sum + item.qty * item.lines.reduce((kg, line) => kg + line.kgPerBox, 0),
    0,
  );
  return round3(total);
}
