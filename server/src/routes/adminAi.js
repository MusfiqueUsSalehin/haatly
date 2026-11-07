// server/src/routes/adminAi.js
import { Router } from 'express';
import { AiLog } from '../models/AiLog.js';

const DAY_MS = 86_400_000;

/** GET /api/admin/ai/health: the last 24 hours of AI calls, per feature. Mounted under the admin guard. */
export function createAdminAiRouter({ env, now = () => new Date() }) {
  const router = Router();

  router.get('/ai/health', async (_req, res) => {
    const at = now();
    const recent = { createdAt: { $gte: new Date(at.getTime() - DAY_MS) } };

    const [rows, reasons] = await Promise.all([
      AiLog.aggregate([
        { $match: recent },
        {
          $group: {
            _id: '$feature',
            calls: { $sum: 1 },
            modelAnswers: { $sum: { $cond: [{ $eq: ['$source', 'model'] }, 1, 0] } },
            ruleAnswers: { $sum: { $cond: [{ $eq: ['$source', 'rules'] }, 1, 0] } },
            modelCalls: { $sum: { $cond: ['$modelCalled', 1, 0] } },
            avgLatencyMs: { $avg: '$latencyMs' },
            inputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
            outputTokens: { $sum: { $ifNull: ['$outputTokens', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      AiLog.aggregate([
        { $match: { ...recent, source: 'rules' } },
        { $group: { _id: { feature: '$feature', reason: '$fallbackReason' }, n: { $sum: 1 } } },
      ]),
    ]);

    const reasonsByFeature = {};
    for (const r of reasons) {
      (reasonsByFeature[r._id.feature] ??= {})[r._id.reason ?? 'unknown'] = r.n;
    }

    res.json({
      asOf: at.toISOString(),
      provider: env.AI_PROVIDER,
      model: env.AI_PROVIDER === 'anthropic' ? env.AI_MODEL : null,
      budget: { limit: env.AI_MAX_CALLS_PER_DAY, used: rows.reduce((n, r) => n + r.modelCalls, 0) },
      features: rows.map((r) => ({
        feature: r._id,
        calls: r.calls,
        modelAnswers: r.modelAnswers,
        ruleAnswers: r.ruleAnswers,
        fallbackReasons: reasonsByFeature[r._id] ?? {},
        avgLatencyMs: r.avgLatencyMs == null ? null : Math.round(r.avgLatencyMs),
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
      })),
    });
  });

  return router;
}
