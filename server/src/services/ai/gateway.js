const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ERROR_LENGTH = 300;

const truncate = (message = '') => String(message).slice(0, MAX_ERROR_LENGTH);

/**
 * Every AI feature runs through here. The rules always produce an answer first, so a
 * missing key, a timeout, a bad reply or a spent budget can never break a feature.
 * A model answer is only used after it has been parsed AND clamped by the feature's own
 * safety code, so model output is never trusted as it arrives.
 *
 * run({ feature, input, rules, model? }) -> { result, source, fallbackReason? }
 *   rules(input)                 deterministic answer, always available
 *   model.system / model.content what to ask the model
 *   model.parse(text)            turn the reply into data, throw if it is invalid
 *   model.clamp(parsed, rulesResult, input)   enforce the feature's safety rules
 */
export function createAiGateway({ env, logger, provider = null, store }) {
  async function record(entry) {
    try {
      await store.log(entry);
    } catch (err) {
      logger.warn({ err }, 'could not write ai log');
    }
  }

  async function run({ feature, input, rules, model }) {
    if (model && typeof model.clamp !== 'function') {
      throw new Error(`ai feature "${feature}" must provide model.clamp`);
    }
    const rulesResult = rules(input);

    const answerFromRules = async (fallbackReason, extra = {}) => {
      await record({ feature, source: 'rules', fallbackReason, ...extra });
      return { result: rulesResult, source: 'rules', fallbackReason };
    };

    if (!provider || !model) return answerFromRules('provider_off');

    try {
      const used = await store.countModelCalls(new Date(Date.now() - DAY_MS));
      if (used >= env.AI_MAX_CALLS_PER_DAY) return answerFromRules('budget');
    } catch (err) {
      logger.warn({ err }, 'could not check the ai budget');
      return answerFromRules('error', { error: truncate(err?.message) });
    }

    const startedAt = Date.now();
    let reply;
    try {
      reply = await provider.complete({
        system: model.system,
        content: model.content,
        maxTokens: model.maxTokens ?? 600,
      });
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      return answerFromRules(timedOut ? 'timeout' : 'error', {
        modelCalled: true,
        model: provider.model,
        latencyMs: Date.now() - startedAt,
        error: truncate(err?.message),
      });
    }

    const usage = {
      modelCalled: true,
      model: provider.model,
      latencyMs: Date.now() - startedAt,
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
    };

    let result;
    try {
      result = model.clamp(model.parse(reply.text), rulesResult, input);
    } catch (err) {
      return answerFromRules('invalid_output', { ...usage, error: truncate(err?.message) });
    }

    await record({ feature, source: 'model', ...usage });
    return { result, source: 'model' };
  }

  return { run };
}
