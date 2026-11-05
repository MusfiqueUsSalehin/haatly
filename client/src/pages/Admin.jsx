// client/src/pages/Admin.jsx
import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import Approvals from './admin/Approvals.jsx';
import Dispatch from './admin/Dispatch.jsx';
import Payouts from './admin/Payouts.jsx';
import Riders from './admin/Riders.jsx';
import Staff from './admin/Staff.jsx';

const TABS = ['approvals', 'riders', 'dispatch', 'payouts', 'staff'];

export default function Admin() {
  const { t } = useI18n();
  const [tab, setTab] = useState('approvals');
  const views = {
    approvals: <Approvals />,
    riders: <Riders />,
    dispatch: <Dispatch />,
    payouts: <Payouts />,
    staff: <Staff />,
  };
  return (
    <section>
      <h1 className="font-display text-3xl">{t('admin.title')}</h1>
      <div role="tablist" className="my-4 flex flex-wrap gap-2">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setTab(k)}
          >
            {t(`admin.${k}`)}
          </button>
        ))}
      </div>
      {views[tab]}
    </section>
  );
}
