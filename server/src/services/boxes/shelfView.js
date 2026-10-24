import { Lot } from '../../models/Lot.js';
import { Produce } from '../../models/Produce.js';
import { describeBox } from './describeBox.js';

/** Load the lots and produce behind some boxes and describe each one with live numbers. */
export async function describeBoxes(boxes, now = new Date()) {
  const lotCodes = [...new Set(boxes.flatMap((box) => box.lines.flatMap((l) => l.lotCodes)))];
  const slugs = [...new Set(boxes.flatMap((box) => box.lines.map((line) => line.produceSlug)))];

  const [lots, produce] = await Promise.all([
    Lot.find({ code: { $in: lotCodes } }).lean(),
    Produce.find({ slug: { $in: slugs } }).lean(),
  ]);
  const lotMap = new Map(lots.map((lot) => [lot.code, lot]));
  const produceBySlug = Object.fromEntries(produce.map((item) => [item.slug, item]));

  return boxes.map((box) => describeBox(box, lotMap, produceBySlug, now));
}
