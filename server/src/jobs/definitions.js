import { buildShelf } from '../services/boxes/buildShelf.js';
import { backfillEarnings } from '../services/earnings/recordEarnings.js';
import { runLotMaintenance } from '../services/lots/maintenance.js';
import { runPaymentMaintenance } from '../services/payments/maintenance.js';

const MIN = 60 * 1000;

/**
 * Every scheduled job. Each one only calls a function that is already safe to repeat, so a
 * late, doubled or half-finished run can never do harm. `payments` is the configured
 * payment provider (or null), needed to retry failed refunds.
 */
export function createJobs({ payments = null } = {}) {
  return [
    {
      // Build the shelf at 05:30 Bangladesh time, when the day's boxes should be ready.
      name: 'shelf-morning',
      schedule: { dailyAt: '05:30' },
      timeoutMs: 5 * MIN,
      run: async ({ now }) => {
        const result = await buildShelf({ now });
        return { built: result.built.length, closed: result.closed };
      },
    },
    {
      // Rebuild during the day, so newly listed lots reach the shelf and sold-out boxes close.
      name: 'shelf-refresh',
      schedule: { everyMinutes: 15 },
      timeoutMs: 5 * MIN,
      run: async ({ now }) => {
        const result = await buildShelf({ now });
        return { built: result.built.length, closed: result.closed };
      },
    },
    {
      // Expire finished lots and mark prices down as the time runs out.
      name: 'lot-upkeep',
      schedule: { everyMinutes: 60 },
      timeoutMs: 5 * MIN,
      run: ({ now }) => runLotMaintenance(now),
    },
    {
      // Release unpaid orders and finish refunds that failed earlier.
      name: 'payment-upkeep',
      schedule: { everyMinutes: 5 },
      timeoutMs: 2 * MIN,
      run: ({ now, logger }) => runPaymentMaintenance({ provider: payments, now, logger }),
    },
    {
      // Record earnings for any delivered order whose ledger entry was missed.
      name: 'earnings-backfill',
      schedule: { dailyAt: '02:00' },
      timeoutMs: 10 * MIN,
      run: async () => {
        const result = await backfillEarnings();
        return { checked: result.checked, recorded: result.recorded, failed: result.failed.length };
      },
    },
  ];
}
