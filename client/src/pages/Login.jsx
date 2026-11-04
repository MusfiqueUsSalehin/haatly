// client/src/pages/Login.jsx
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { HOME_FOR_ROLE, ROUTES } from '../routes.js';

export default function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const from = useLocation().state?.from?.pathname;
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(form.email, form.password);
      navigate(from ?? HOME_FOR_ROLE[user.role], { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3">
      <h1 className="font-display text-3xl">{t('nav.login')}</h1>
      <input
        className="input"
        type="email"
        required
        placeholder={t('auth.email')}
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      <input
        className="input"
        type="password"
        required
        placeholder={t('auth.password')}
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />
      {error && (
        <p role="alert" className="text-chili">
          {error}
        </p>
      )}
      <button className="btn-primary w-full" disabled={busy}>
        {t('nav.login')}
      </button>
      <p className="text-center text-sm">
        <Link to={ROUTES.register} className="text-crate">
          {t('nav.register')}
        </Link>
      </p>
    </form>
  );
}
