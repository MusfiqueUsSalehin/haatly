// client/src/pages/admin/Approvals.jsx
import { useState } from 'react';
import { patch } from '../../api/client.js';
import { useApi } from '../../api/useApi.js';
import { useI18n } from '../../i18n/I18nContext.jsx';

export default function Approvals() {
  const { t } = useI18n();
  const pending = useApi('/admin/users?status=pending&limit=50');
  const [error, setError] = useState('');
  const users = pending.data?.users ?? [];

  async function decide(id, status) {
    setError('');
    try {
      await patch(`/admin/users/${id}/status`, { status });
      pending.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-2">
      {users.length === 0 && <p>{t('admin.none')}</p>}
      {users.map((u) => (
        <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3">
          <span className="flex-1">
            {u.name} · {t(`role.${u.role}`)} · {u.email} · {u.phone}
          </span>
          <button className="btn-primary" onClick={() => decide(u.id, 'active')}>
            {t('admin.approve')}
          </button>
          <button className="btn-ghost text-chili" onClick={() => decide(u.id, 'suspended')}>
            {t('admin.suspend')}
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-chili">
          {error}
        </p>
      )}
    </div>
  );
}
