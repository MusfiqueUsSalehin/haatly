import { ORDER_STATUS } from '../../constants/orders.js';
import { PAYMENT_STATUS } from '../../constants/payments.js';
import { BOX_STATUS, Box } from '../../models/Box.js';
import { City } from '../../models/City.js';
import { Lot } from '../../models/Lot.js';
import { Order } from '../../models/Order.js';
import { Payment } from '../../models/Payment.js';
import { Zone } from '../../models/Zone.js';
import { AppError } from '../../utils/AppError.js';
import { bangladeshDate } from '../../utils/dates.js';
import { randomCode } from '../../utils/ids.js';
import { newOtpSalt } from '../../utils/otp.js';
import { orderTotals } from './orderPolicy.js';
import { planAllocations } from './planAllocations.js';
import { releaseStock, reserveStock } from './stock.js';

const MAX_ATTEMPTS = 3;
const MINUTE_MS = 60 * 1000;

/** Work out, from live data, which kilos fill each box and what each box costs now. */
async function planItems({ items, cityCode, date, now }) {
  const boxes = await Box.find({
    code: { $in: items.map((item) => item.boxCode) },
    cityCode,
    date,
    status: BOX_STATUS.LIVE,
  }).lean();
  const boxMap = new Map(boxes.map((box) => [box.code, box]));

  const missing = items.find((item) => !boxMap.has(item.boxCode));
  if (missing) {
    throw new AppError(404, 'box_not_found', 'Box not found', { boxCode: missing.boxCode });
  }

  const lotCodes = [...new Set(boxes.flatMap((box) => box.lines.flatMap((l) => l.lotCodes)))];
  const lots = await Lot.find({ code: { $in: lotCodes } }).lean();
  const lotMap = new Map(lots.map((lot) => [lot.code, lot]));

  return items.map((item) => {
    const box = boxMap.get(item.boxCode);
    const { allocations, unitPriceBdt } = planAllocations({ box, qty: item.qty, lotMap, now });

    // Prices only ever go down, so a higher price means the box changed under the customer.
    if (unitPriceBdt > item.seenUnitPriceBdt) {
      throw new AppError(409, 'price_changed', 'The price of a box has changed', {
        boxCode: box.code,
        seenPriceBdt: item.seenUnitPriceBdt,
        currentPriceBdt: unitPriceBdt,
      });
    }
    return {
      boxCode: box.code,
      tier: box.tier,
      qty: item.qty,
      unitPriceBdt, // the customer pays the live price, which is never above what they saw
      lines: box.lines.map(({ produceSlug, kgPerBox }) => ({ produceSlug, kgPerBox })),
      allocations,
    };
  });
}

/**
 * Save the order and its payment record. A wallet order first asks the gateway to create
 * a charge. If the payment record cannot be saved, the order is removed again (the
 * customer has not seen it yet).
 */
async function saveOrderAndPayment({ customer, body, zone, items, provider, windowMinutes, now }) {
  const orderCode = randomCode('ORD');
  const totals = orderTotals(items);
  const wallet = body.paymentMethod === 'wallet';

  const charge = wallet
    ? await provider.createCharge({ orderCode, amountBdt: totals.totalBdt })
    : null;

  const order = await Order.create({
    code: orderCode,
    customer: customer._id,
    recipientName: body.recipientName,
    phone: body.phone,
    cityCode: zone.cityCode,
    zoneCode: zone.code,
    address: body.address,
    items,
    ...totals,
    paymentMethod: body.paymentMethod,
    status: ORDER_STATUS.PLACED,
    statusHistory: [{ status: ORDER_STATUS.PLACED, at: now }],
    otpSalt: newOtpSalt(),
  });

  try {
    const payment = await Payment.create({
      code: randomCode('PAY'),
      orderCode,
      customer: customer._id,
      method: body.paymentMethod,
      provider: wallet ? provider.name : 'cod',
      amountBdt: totals.totalBdt,
      ...(wallet && {
        providerRef: charge.providerRef,
        expiresAt: new Date(now.getTime() + windowMinutes * MINUTE_MS),
      }),
      history: [{ status: PAYMENT_STATUS.PENDING, at: now }],
    });
    return { order, payment, payUrl: charge?.payUrl ?? null };
  } catch (err) {
    await Order.deleteOne({ code: orderCode });
    throw err;
  }
}

/**
 * Place an order: plan the stock from live data, reserve it atomically, then save the
 * order and its payment. If stock moves between planning and reserving, plan again (up
 * to 3 times). If saving fails after stock was taken, the stock is put back.
 * Returns { order, payment, payUrl }.
 */
export async function checkout({
  customer,
  body,
  provider = null,
  paymentWindowMinutes = 15,
  now = new Date(),
}) {
  if (body.paymentMethod === 'wallet' && !provider) {
    throw new AppError(400, 'payment_unavailable', 'Wallet payment is not available right now');
  }

  const zone = await Zone.findOne({ code: body.zoneCode, active: true }).lean();
  const city = zone && (await City.findOne({ code: zone.cityCode, active: true }).lean());
  if (!zone || !city) throw new AppError(404, 'zone_not_found', 'Delivery area not found');

  const date = bangladeshDate(now);

  for (let attempt = 1; ; attempt++) {
    const items = await planItems({ items: body.items, cityCode: city.code, date, now });
    const allocations = items.flatMap((item) => item.allocations);

    try {
      await reserveStock(allocations, now);
    } catch (err) {
      if (err.code === 'stock_changed' && attempt < MAX_ATTEMPTS) continue;
      throw err;
    }

    try {
      return await saveOrderAndPayment({
        customer,
        body,
        zone,
        items,
        provider,
        windowMinutes: paymentWindowMinutes,
        now,
      });
    } catch (err) {
      await releaseStock(allocations, now);
      throw err;
    }
  }
}

/** Same as checkout(), returning only the order. */
export async function placeOrder(args) {
  return (await checkout(args)).order;
}
