// client/src/pages/Register.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { HOME_FOR_ROLE } from '../routes.js';

const ROLES = ['customer', 'farmer', 'rider']; // staff accounts are created by admins

export default function Register() {
  const { register } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '+8801',
    password: '',
    role: 'customer',
  });
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [pending, setPending] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setFields({});
    try {
      const user = await register(form);
      if (user.status === 'pending') setPending(true);
      else navigate(HOME_FOR_ROLE[user.role], { replace: true });
    } catch (err) {
      setError(err.message);
      setFields(err.details ?? {});
    }
  }

  if (pending) return <p className="mx-auto max-w-sm text-center">{t('auth.pending')}</p>;

  const field = (k, label, props = {}) => (
    <div>
      <input
        className="input"
        required
        placeholder={label}
        value={form[k]}
        onChange={set(k)}
        {...props}
      />
      {fields[k] && <p className="text-sm text-chili">{fields[k]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3">
      <h1 className="font-display text-3xl">{t('nav.register')}</h1>
      {field('name', t('auth.name'))}
      {field('email', t('auth.email'), { type: 'email' })}
      {field('phone', t('auth.phone'), { inputMode: 'tel' })}
      {field('password', t('auth.password'), { type: 'password' })}
      <select
        className="input"
        value={form.role}
        onChange={set('role')}
        aria-label={t('auth.role')}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {t(`role.${r}`)}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-chili">
          {error}
        </p>
      )}
      <button className="btn-primary w-full">{t('nav.register')}</button>
    </form>
  );
}
