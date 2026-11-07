// client/src/pages/Admin.jsx  (replace)
import { useState } from 'react';
import { useApi } from '../api/useApi.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import Approvals from './admin/Approvals.jsx';
import Dispatch from './admin/Dispatch.jsx';
import Overview from './admin/Overview.jsx';
import Payouts from './admin/Payouts.jsx';
import Riders from './admin/Riders.jsx';
import Staff from './admin/Staff.jsx';

const TABS = ['overview', 'approvals', 'riders', 'dispatch', 'payouts', 'staff'];

export default function Admin() {
  const { t, pick } = useI18n();
  const [tab, setTab] = useState('overview');
  const jobs = useApi('/admin/jobs');
  const running = jobs.data?.schedulerRunsHere;

  const views = {
    overview: <Overview goTo={setTab} />,
    approvals: <Approvals />,
    riders: <Riders />,
    dispatch: <Dispatch />,
    payouts: <Payouts />,
    staff: <Staff />,
  };

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-turmeric-deep">
            {pick('অপারেশনস', 'Operations')}
          </p>
          <h1 className="font-display text-4xl">{pick('কন্ট্রোল রুম', 'Control room')}</h1>
        </div>
        {jobs.data && (
          <span
            className={`chip border px-3 py-1.5 ${running ? 'border-leaf/40 bg-leaf/10 text-leaf-dark' : 'border-turmeric/50 bg-turmeric/10 text-turmeric-deep'}`}
          >
            {running ? `● ${pick('সিস্টেম চালু', 'System running')}` : t('admin.noScheduler')}
          </span>
        )}
      </div>

      <div role="tablist" className="mt-5 flex flex-wrap gap-1 border-b border-jute-deep">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === k ? 'border-leaf text-leaf-dark' : 'border-transparent text-soil-muted hover:text-soil'}`}
          >
            {t(`admin.${k}`)}
          </button>
        ))}
      </div>

      <div className="mt-6">{views[tab]}</div>
    </section>
  );
}
