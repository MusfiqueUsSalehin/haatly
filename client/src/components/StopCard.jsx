// client/src/components/StopCard.jsx
import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function StopCard({ stop, canAct, onDeliver, onFail }) {
  const { t, money } = useI18n();
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

  return (
    <li className="rounded-lg bg-white p-3">
      <div className="flex justify-between font-semibold">
        <span>
          {stop.sequence}. {stop.recipientName}
        </span>
        <span>{t(`stopstatus.${stop.status}`)}</span>
      </div>
      <p className="text-sm">
        {stop.address?.line}
        {stop.address?.landmark ? ` (${stop.address.landmark})` : ''}
      </p>
      {stop.phone && (
        <a className="text-sm text-crate" href={`tel:${stop.phone}`}>
          {stop.phone}
        </a>
      )}
      {stop.collectBdt > 0 && (
        <p className="text-sm font-semibold text-chili">
          {t('stop.collect')}: {money(stop.collectBdt)}
        </p>
      )}
      {stop.status === 'failed' && stop.failReason && (
        <p className="text-sm text-chili">{stop.failReason}</p>
      )}

      {canAct && stop.status === 'pending' && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <input
              className="input"
              inputMode="numeric"
              maxLength={6}
              placeholder={t('stop.otp')}
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
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              className="btn-ghost text-chili"
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
