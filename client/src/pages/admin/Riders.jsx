// client/src/pages/admin/Riders.jsx
import { useState } from 'react';
import { put } from '../../api/client.js';
import { useApi } from '../../api/useApi.js';
import { useCity } from '../../city/CityContext.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';

function RiderRow({ user, profile, cities, onSaved }) {
  const { t, pick } = useI18n();
  const [cityCode, setCityCode] = useState(profile?.cityCode ?? cities[0]?.code ?? '');
  const [vehicle, setVehicle] = useState(profile?.vehicle ?? 'bike');
  const [zones, setZones] = useState(profile?.zoneCodes ?? []);
  const [msg, setMsg] = useState('');
  const city = cities.find((c) => c.code === cityCode);
  const toggle = (code) =>
    setZones((z) => (z.includes(code) ? z.filter((x) => x !== code) : [...z, code]));

  async function save() {
    setMsg('');
    try {
      await put(`/admin/riders/${user.id}`, { cityCode, vehicle, zoneCodes: zones });
      setMsg(t('common.saved'));
      onSaved();
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div className="space-y-2 rounded-lg bg-white p-3">
      <p className="font-semibold">
        {user.name} · {user.phone}
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          className="input w-auto"
          aria-label="city"
          value={cityCode}
          onChange={(e) => {
            setCityCode(e.target.value);
            setZones([]);
          }}
        >
          {cities.map((c) => (
            <option key={c.code} value={c.code}>
              {pick(c.nameBn, c.nameEn)}
            </option>
          ))}
        </select>
        <select
          className="input w-auto"
          aria-label={t('admin.vehicle')}
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
        >
          <option value="bike">bike</option>
          <option value="van">van</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        {city?.zones.map((z) => (
          <label
            key={z.code}
            className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${zones.includes(z.code) ? 'border-leaf bg-leaf text-white' : 'border-soil/20'}`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={zones.includes(z.code)}
              onChange={() => toggle(z.code)}
            />
            {pick(z.nameBn, z.nameEn)}
          </label>
        ))}
      </div>
      <button className="btn-primary" onClick={save}>
        {t('admin.save')}
      </button>
      {msg && <span className="ml-2 text-sm">{msg}</span>}
    </div>
  );
}

export default function Riders() {
  const { t } = useI18n();
  const { cities } = useCity();
  const users = useApi('/admin/users?role=rider&status=active&limit=100');
  const profiles = useApi('/admin/riders');
  const byId = Object.fromEntries((profiles.data?.riders ?? []).map((r) => [r.userId, r]));
  const list = users.data?.users ?? [];

  return (
    <div className="space-y-3">
      {list.length === 0 && <p>{t('admin.none')}</p>}
      {cities.length > 0 &&
        list.map((u) => (
          <RiderRow
            key={u.id}
            user={u}
            profile={byId[u.id]}
            cities={cities}
            onSaved={profiles.reload}
          />
        ))}
    </div>
  );
}
