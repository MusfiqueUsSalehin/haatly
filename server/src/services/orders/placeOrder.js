import { ORDER_STATUS } from '../../constants/orders.js';
import { BOX_STATUS, Box } from '../../models/Box.js';
import { City } from '../../models/City.js';
import { Lot } from '../../models/Lot.js';
import { Order } from '../../models/Order.js';
import { Zone } from '../../models/Zone.js';
import { AppError } from '../../utils/AppError.js';
import { bangladeshDate } from '../../utils/dates.js';
import { randomCode } from '../../utils/ids.js';
import { newOtpSalt } from '../../utils/otp.js';
import { orderTotals } from './orderPolicy.js';
import { planAllocations } from './planAllocations.js';
import { releaseStock, reserveStock } from './stock.js';

const MAX_ATTEMPTS = 3;

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

async function saveOrder({ customer, body, zone, items, now }) {
  // A random code can in theory collide; the unique index catches it and we retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await Order.create({
        code: randomCode('ORD'),
        customer: customer._id,
        recipientName: body.recipientName,
        phone: body.phone,
        cityCode: zone.cityCode,
        zoneCode: zone.code,
        address: body.address,
        items,
        ...orderTotals(items),
        paymentMethod: body.paymentMethod,
        status: ORDER_STATUS.PLACED,
        statusHistory: [{ status: ORDER_STATUS.PLACED, at: now }],
        otpSalt: newOtpSalt(),
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  throw new Error('could not allocate a unique order code');
}

/**
 * Place an order: plan the stock from live data, reserve it atomically, save the order.
 * If stock moves between planning and reserving, plan again (up to 3 times). If saving
 * fails after stock was taken, the stock is put back.
 */
export async function placeOrder({ customer, body, now = new Date() }) {
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
      return await saveOrder({ customer, body, zone, items, now });
    } catch (err) {
      await releaseStock(allocations, now);
      throw err;
    }
  }
}
