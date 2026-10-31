const listeners = new Set();

/** Listen to everything the app publishes. Returns a function that stops listening. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Publish a domain event (order.placed, order.updated, run.created, run.updated).
 * A broken listener can never break the code that published, nor stop other listeners.
 */
export function publish(type, data) {
  for (const listener of [...listeners]) {
    try {
      listener(type, data);
    } catch {
      // Live updates are a convenience: they must never break checkout or delivery.
    }
  }
}
