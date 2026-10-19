import { createAnthropicProvider } from './anthropicProvider.js';
import { createAiGateway } from './gateway.js';
import { createAiStore } from './store.js';

/** Build the gateway from config. With AI_PROVIDER=none every feature uses its rules. */
export function createAiGatewayFromEnv({ env, logger }) {
  const provider =
    env.AI_PROVIDER === 'anthropic'
      ? createAnthropicProvider({
          apiKey: env.ANTHROPIC_API_KEY,
          model: env.AI_MODEL,
          timeoutMs: env.AI_TIMEOUT_MS,
        })
      : null;
  return createAiGateway({ env, logger, provider, store: createAiStore() });
}
