// client/src/pages/SandboxPay.jsx  (development only: the server never produces this link in production)
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { post } from '../api/client.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { ROUTES, path } from '../routes.js';

const ORDER_CODE = /^ORD-[A-HJ-NP-Z2-9]{8}$/;

export default function SandboxPay() {
  const { ref } = useParams();
  const [params] = useSearchParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const order = params.get('order');

  async function finish(outcome) {
    setError('');
    try {
      await post('/payments/sandbox/complete', { providerRef: ref, outcome });
      navigate(ORDER_CODE.test(order ?? '') ? path('order', { code: order }) : ROUTES.orders, {
        replace: true,
      });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-3 text-center">
      <h1 className="font-display text-3xl">{t('sandbox.title')}</h1>
      <button className="btn-primary w-full" onClick={() => finish('succeeded')}>
        {t('sandbox.pay')}
      </button>
      <button className="btn-ghost w-full" onClick={() => finish('failed')}>
        {t('sandbox.fail')}
      </button>
      {error && (
        <p role="alert" className="text-chili">
          {error}
        </p>
      )}
    </div>
  );
}
