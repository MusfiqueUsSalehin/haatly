// client/src/lib/fees.js
// Display estimate only: the server decides the real fee. Keep in step with the API's constants.
export const DELIVERY_FEE_BDT = 40;
export const FREE_DELIVERY_FROM_BDT = 500;
export const deliveryFee = (subtotal) =>
  subtotal >= FREE_DELIVERY_FROM_BDT ? 0 : DELIVERY_FEE_BDT;
