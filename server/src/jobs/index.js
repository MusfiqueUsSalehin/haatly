import { createJobs } from './definitions.js';
import { createJobStore } from './jobStore.js';
import { createScheduler } from './scheduler.js';

/** Build the scheduler from config. It is only created here, never inside the web app. */
export function createAppScheduler({ logger, payments }) {
  return createScheduler({
    jobs: createJobs({ payments }),
    store: createJobStore(),
    logger,
  });
}
