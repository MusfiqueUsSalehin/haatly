// client/src/pages/admin/Staff.jsx
import { useState } from 'react';
import { post } from '../../api/client.js';
import { useApi } from '../../api/useApi.js';
import { useI18n } from '../../i18n/I18nContext.jsx';

const EMPTY = {
  name: '',
  email: '',
  phone: '+8801',
  password: '',
  role: 'hub_manager',
  hubCode: '',
};

export default function Staff() {
  const { t, pick } = useI18n();
  const hubs = useApi('/catalog/hubs');
  const [form, setForm] = useState(EMPTY);
  const [fields, setFields] = useState({});
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setMsg('');
    setFields({});
    try {
      const { hubCode, ...rest } = form;
      const { user } = await post(
        '/admin/users',
        form.role === 'hub_manager' ? { ...rest, hubCode } : rest,
      );
      setMsg(`${t('common.saved')}: ${user.email}`);
      setForm(EMPTY);
    } catch (err) {
      setMsg(err.message);
      setFields(err.details ?? {});
    }
  }

  const input = (k, label, props = {}) => (
    <div>
      <input
        className="input"
        required
        placeholder={label}
        value={form[k]}
        onChange={set(k)}
        {...props}
      />
      {fields[k] && <p className="text-sm text-chili">{String(fields[k])}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="crate-card max-w-md space-y-3 p-5">
      {input('name', 'Name')}
      {input('email', 'Email', { type: 'email' })}
      {input('phone', 'Mobile', { inputMode: 'tel' })}
      {input('password', 'Password', { type: 'password', minLength: 10 })}
      <select className="input" value={form.role} onChange={set('role')} aria-label="role">
        <option value="hub_manager">{t('role.hub_manager')}</option>
        <option value="admin">{t('role.admin')}</option>
      </select>
      {form.role === 'hub_manager' && (
        <select
          className="input"
          required
          value={form.hubCode}
          onChange={set('hubCode')}
          aria-label={t('admin.hub')}
        >
          <option value="">{t('admin.hub')}</option>
          {hubs.data?.hubs.map((h) => (
            <option key={h.code} value={h.code}>
              {pick(h.nameBn, h.nameEn)} ({h.kind})
            </option>
          ))}
        </select>
      )}
      <button className="btn-primary w-full">{t('admin.create')}</button>
      {msg && <p role="status">{msg}</p>}
    </form>
  );
}
