import { Hub } from '../../models/Hub.js';
import { Lot } from '../../models/Lot.js';
import { Produce } from '../../models/Produce.js';
import { AppError } from '../../utils/AppError.js';
import { randomCode } from '../../utils/ids.js';
import { buildTriageRequest } from '../ai/triage.js';
import { planLot } from './planLot.js';

/**
 * List a new lot for a farmer: check the produce and hub, grade the crate, refuse it if
 * it is not sellable, then price it and save it.
 */
export async function createLot({ farmer, body, ai, now = new Date() }) {
  const produce = await Produce.findOne({ slug: body.produceSlug, active: true });
  if (!produce) throw new AppError(404, 'produce_not_found', 'Produce item not found');

  const hub = await Hub.findOne({ code: body.hubCode, kind: 'collection', active: true });
  if (!hub) throw new AppError(404, 'hub_not_found', 'Collection hub not found');

  const { result: triage, source } = await ai.run(
    buildTriageRequest({ produce, defectTags: body.defectTags, photo: body.photo }),
  );
  const { fields, quote } = planLot({
    produce,
    triage,
    triageSource: source,
    quantityKg: body.quantityKg,
    now,
  });

  // A random code can in theory collide; the unique index catches it and we retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const lot = await Lot.create({
        ...fields,
        code: randomCode('LOT'),
        farmer: farmer._id,
        hubCode: hub.code,
      });
      return { lot, quote, triage: { ...triage, source } };
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  throw new Error('could not allocate a unique lot code');
}
