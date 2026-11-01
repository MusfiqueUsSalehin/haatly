import { Lot } from '../../src/models/Lot.js';
import { dispatchAndDeliverAll, makeProfile, placeOrderFor } from './deliveryFixture.js';
import { setUpShelf } from './shelfFixture.js';

/**
 * Reset the shelf and deliver two family-box orders (one in Mirpur, one in Uttara).
 * LOT-AAAAAAAA (tomato) belongs to `tomatoFarmer`, LOT-DDDDDDDD (cabbage) to `cabbageFarmer`.
 * Each order earns each farmer 120.96 taka, saves the customer 84 taka and rescues 6 kg.
 */
export async function setUpDeliveredOrders({
  tomatoFarmer,
  cabbageFarmer,
  customer,
  rider,
  otpSecret,
}) {
  const { today } = await setUpShelf({ farmer: tomatoFarmer._id });
  await Lot.updateOne({ code: 'LOT-DDDDDDDD' }, { farmer: cabbageFarmer._id });
  await makeProfile(rider, ['dhaka-mirpur', 'dhaka-uttara']);

  const o1 = await placeOrderFor(customer, today, { zoneCode: 'dhaka-mirpur' });
  const o2 = await placeOrderFor(customer, today, { zoneCode: 'dhaka-uttara' });
  await dispatchAndDeliverAll({ rider, otpSecret });
  return { today, o1, o2 };
}
