// client/src/components/Icon.jsx
const PATHS = {
  leaf: 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19c3-5 6-8 10-10',
  cart: 'M3 4h2l2.2 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20 8H6.2M9 20h.01M17 20h.01',
  truck: 'M2 6h11v10H2zM13 9h4l3 3v4h-7M6 19a1.6 1.6 0 1 0 .01 0M17 19a1.6 1.6 0 1 0 .01 0',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 .01 0',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12a2.2 2.2 0 1 0 .01 0',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
};

export default function Icon({ name, size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
