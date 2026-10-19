import { AiLog } from '../../models/AiLog.js';

/** Where the gateway keeps its call log and reads its daily budget. */
export function createAiStore() {
  return {
    log: (entry) => AiLog.create(entry),
    countModelCalls: (since) =>
      AiLog.countDocuments({ modelCalled: true, createdAt: { $gte: since } }),
  };
}
