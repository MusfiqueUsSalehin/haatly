// client/src/components/StopCard.jsx
import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function StopCard({ stop, canAct, isNext, onDeliver, onFail }) {
  const { t, pick, money } = useI18n();
  const [otp, setOtp] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  async function go(fn) {
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    }
  }

  const done = stop.status === 'delivered';
  const dot = done
    ? 'bg-leaf text-jute-light'
    : stop.status === 'failed'
      ? 'bg-chili text-jute-light'
      : isNext
        ? 'bg-turmeric text-jute-light'
        : 'bg-jute text-soil-muted';

  return (
    <li
      className={`crate-card p-4 ${isNext ? '!border-turmeric/60' : ''} ${done ? 'opacity-75' : ''}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-semibold ${dot}`}
        >
          {stop.sequence}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono font-semibold">{stop.orderCode}</p>
            {isNext && (
              <span className="chip border border-turmeric/50 bg-turmeric/10 text-turmeric-deep">
                {pick('এখন', 'Now')}
              </span>
            )}
          </div>
          <p className="text-sm">{stop.recipientName}</p>
          <p className="text-sm text-soil-muted">
            {stop.address?.line}
            {stop.address?.landmark ? ` (${stop.address.landmark})` : ''}
          </p>
          {stop.collectBdt > 0 && (
            <p className="mt-1 text-sm font-semibold text-chili">
              {t('stop.collect')}: {money(stop.collectBdt)}
            </p>
          )}
          {done && <p className="mt-1 text-sm text-leaf-dark">✓ {t('stopstatus.delivered')}</p>}
          {stop.status === 'failed' && (
            <p className="mt-1 text-sm text-chili">
              {t('stopstatus.failed')}
              {stop.failReason ? `: ${stop.failReason}` : ''}
            </p>
          )}
        </div>
      </div>

      {canAct && stop.status === 'pending' && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              className="input"
              inputMode="numeric"
              maxLength={6}
              placeholder={t('stop.otp')}
              aria-label={t('stop.otp')}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            />
            <button
              className="btn-primary"
              disabled={otp.length !== 6}
              onClick={() => go(() => onDeliver(stop.orderCode, otp))}
            >
              {t('stop.deliver')}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder={t('stop.reason')}
              aria-label={t('stop.reason')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              className="btn-ghost !border-chili/40 !text-chili"
              disabled={reason.trim().length < 2}
              onClick={() => go(() => onFail(stop.orderCode, reason.trim()))}
            >
              {t('stop.fail')}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-chili">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
