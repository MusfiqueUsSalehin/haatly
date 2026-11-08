// client/src/pages/Home.jsx
import { Link } from 'react-router-dom';
import { useApi } from '../api/useApi.js';
import { useCity } from '../city/CityContext.jsx';
import Icon from '../components/Icon.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { ROUTES, path } from '../routes.js';

const STEPS = [
  {
    icon: 'leaf',
    bn: ['ক্ষেতে বাছাই', 'কৃষক ফসলের ধরন ও ত্রুটি জানান; সিস্টেম গ্রেড আর কতদিন টিকবে ঠিক করে।'],
    en: [
      'Graded at the farm',
      'The farmer reports the produce and its defects; the system sets a grade and shelf life.',
    ],
  },
  {
    icon: 'truck',
    bn: ['রাতের ট্রাক', 'ফসল হাব থেকে শহরের ডিপোতে পৌঁছায়, ভোরে বক্স তৈরি হয়।'],
    en: [
      'On the night truck',
      'Produce travels from the farm hub to the city depot, and boxes are built in the morning.',
    ],
  },
  {
    icon: 'clock',
    bn: ['দাম নামে ঘণ্টায়', 'যত কম সময় বাকি, তত কম দাম — কৃষকের নিশ্চিত দর ছোঁয়া পর্যন্ত।'],
    en: [
      'Priced against the clock',
      'Less time left, lower price, but never below the farmer’s floor.',
    ],
  },
  {
    icon: 'pin',
    bn: ['দরজায় পৌঁছায়', 'এলাকাভিত্তিক ক্লাস্টারে রাইডার যায়: কম কিলোমিটারে বেশি ডেলিভারি।'],
    en: ['At your door', 'Riders deliver in area clusters: more drops, fewer kilometres.'],
  },
];

export default function Home() {
  const { t, pick, money, lang } = useI18n();
  const { city } = useCity();
  const boxes = useApi(city ? `/boxes?city=${city.code}` : null);
  const impact = useApi('/impact');

  const list = boxes.data?.boxes ?? [];
  const open = list.filter((b) => !b.soldOut);
  const from = open.length ? Math.min(...open.map((b) => b.priceBdt)) : null;
  const i = impact.data?.impact;
  const num = (n) =>
    Number(n ?? 0).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US', { maximumFractionDigits: 1 });

  const stats = [
    [pick('বক্স শুরু', 'Boxes from'), from != null ? money(from) : '–', 'text-leaf-dark'],
    [pick('রক্ষা পেয়েছে', 'Rescued'), `${num(i?.kgRescued)} kg`, 'text-turmeric-deep'],
    [pick('ডেলিভারি হয়েছে', 'Delivered'), num(i?.ordersDelivered), 'text-crate'],
  ];
  const tiles = [
    ['CO₂e', `${num(i?.co2eKg)} kg`, 'text-leaf-dark'],
    [pick('ক্রেতার সাশ্রয়', 'Saved by customers'), money(i?.savedBdt ?? 0), 'text-crate'],
    [pick('আয় করা কৃষক', 'Farmers earning'), num(i?.farmersEarning), 'text-turmeric-deep'],
    [pick('কৃষকের আয়', 'Paid to farmers'), money(i?.farmerEarningsBdt ?? 0), 'text-turmeric-deep'],
  ];

  return (
    <>
      <section className="grid items-start gap-10 py-6 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <h1 className="font-display text-4xl leading-[1.12] md:text-6xl">
            <span className="block text-soil">{pick('ফসল বাঁচান,', 'Save the harvest.')}</span>
            <span className="block text-leaf-dark">{pick('টাকা বাঁচান।', 'Save your money.')}</span>
          </h1>
          <p className="mt-3 text-lg font-semibold text-turmeric-deep">{t('app.tagline')}</p>
          <p className="mt-5 max-w-prose text-lg leading-relaxed text-soil-muted">
            {pick(
              'ক্ষেতে যে সবজি ফেলে দেওয়া হতো — আকারে অসমান, গায়ে দাগ — সেটাই সরাসরি আপনার দরজায়, কাঁচাবাজারের চেয়ে কমে।',
              'Produce that used to be dumped at the farm gate, delivered to your door below kacha bazar prices.',
            )}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to={ROUTES.market} className="btn-primary">
              {pick('আজকের বক্স দেখুন', 'See today’s boxes')}
            </Link>
            <Link to={ROUTES.register} className="btn-ghost">
              {pick('কৃষক হিসেবে যোগ দিন', 'Join as a farmer')}
            </Link>
          </div>
          <dl className="mt-9 grid max-w-lg grid-cols-3 gap-3">
            {stats.map(([label, value, color]) => (
              <div key={label} className="crate-card p-3">
                <dt className="text-xs text-soil-muted">{label}</dt>
                <dd className={`mt-1 text-xl font-semibold ${color}`}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="crate-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-jute-deep bg-jute px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-2 w-2 rounded-full bg-chili" />
              {pick('আজকের বক্স', 'Today’s boxes')}
            </h2>
            <Link to={ROUTES.market} className="text-sm font-semibold text-leaf-dark">
              {pick('সব দেখুন →', 'See all →')}
            </Link>
          </div>
          {open.length === 0 && (
            <p className="p-8 text-center text-sm text-soil-muted">
              {pick('এখন কোনো বক্স নেই', 'No boxes right now')}
            </p>
          )}
          <ul className="divide-y divide-jute-deep">
            {open.slice(0, 3).map((b) => (
              <li key={b.code}>
                <Link
                  to={path('box', { code: b.code })}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-jute/60"
                >
                  <span className="font-display text-xl capitalize">
                    {b.tier} · {b.weightKg} kg
                  </span>
                  <span className="text-right">
                    <span className="block text-xl font-semibold text-leaf-dark">
                      {money(b.priceBdt)}
                    </span>
                    <span className="block text-xs text-soil-muted">
                      <s>{money(b.bazarValueBdt)}</s> · {b.savingsPct}%
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-10">
        <h2 className="font-display text-3xl">
          {pick('একটা ক্রেট যেভাবে আসে', 'How a crate travels')}
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, n) => {
            const [title, body] = pick(s.bn, s.en);
            return (
              <li key={s.icon} className="crate-card p-5">
                <div className="flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-leaf/15 text-leaf-dark">
                    <Icon name={s.icon} />
                  </span>
                  <span className="font-mono text-xs text-soil-muted">0{n + 1}</span>
                </div>
                <h3 className="mt-3 font-display text-xl">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-soil-muted">{body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="grid overflow-hidden rounded-crate border border-jute-deep bg-surface md:grid-cols-[1fr_1.4fr]">
        <div className="bg-leaf/15 p-6 md:p-8">
          <p className="text-xs font-semibold tracking-wide text-turmeric-deep">
            {pick('এ পর্যন্ত নেটওয়ার্ক', 'Network so far')}
          </p>
          <p className="mt-2 font-display text-4xl text-leaf-dark">
            {num(i?.kgRescued)} {pick('কেজি রক্ষা পেয়েছে', 'kg rescued')}
          </p>
          <p className="mt-3 text-sm text-soil-muted">
            {pick(
              'প্রতিটি হিসাব আনুমানিক, এবং শুধু ডেলিভারি নিশ্চিত হলেই গোনা হয়।',
              'Every figure is an estimate and only counts once delivery is confirmed.',
            )}
          </p>
          <Link to={ROUTES.impact} className="btn-ghost mt-4">
            {pick('হিসাবের পদ্ধতি দেখুন', 'See how we count')}
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 md:p-6">
          {tiles.map(([label, value, color]) => (
            <div key={label} className="rounded-lg border border-jute-deep p-3">
              <p className="text-xs text-soil-muted">{label}</p>
              <p className={`mt-1 font-display text-2xl ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
