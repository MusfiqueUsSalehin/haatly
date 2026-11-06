// client/src/pages/admin/Payouts.jsx
import { useState } from 'react';
import { post } from '../../api/client.js';
import { useApi } from '../../api/useApi.js';
import { useI18n } from '../../i18n/I18nContext.jsx';

function Row({ farmer, onPaid }) {
  const { t, money } = useI18n();
  const [ref, setRef] = useState('');
  const [error, setError] = useState('');

  async function pay() {
    setError('');
    try {
      await post(`/admin/earnings/${farmer.farmerId}/payout`, { payoutRef: ref.trim() });
      onPaid();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3">
      <span className="flex-1">
        {farmer.name} · {farmer.phone} · {t('admin.owed')} {money(farmer.unpaidBdt)}
      </span>
      <input
        className="input w-48"
        placeholder={t('admin.payoutRef')}
        value={ref}
        onChange={(e) => setRef(e.target.value)}
      />
      <button className="btn-primary" disabled={ref.trim().length < 3} onClick={pay}>
        {t('admin.markPaid')}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-chili">
          {error}
        </p>
      )}
    </div>
  );
}

export default function Payouts() {
  const { t } = useI18n();
  const owed = useApi('/admin/earnings');
  const farmers = owed.data?.farmers ?? [];
  return (
    <div className="space-y-2">
      {farmers.length === 0 && <p>{t('admin.none')}</p>}
      {farmers.map((f) => (
        <Row key={f.farmerId} farmer={f} onPaid={owed.reload} />
      ))}
    </div>
  );
}
