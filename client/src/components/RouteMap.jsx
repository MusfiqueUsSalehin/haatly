// client/src/components/RouteMap.jsx
import { projector } from '../lib/geo.js';

/** Plain SVG: stops sit at their zone centre, joined in route order. Colours come from the theme. */
export default function RouteMap({ stops, centers, rider, label }) {
  const pts = stops.map((s) => ({ ...s, c: centers[s.zoneCode] })).filter((s) => s.c);
  if (pts.length === 0) return null;
  const project = projector(rider ? [...pts.map((s) => s.c), rider] : pts.map((s) => s.c));
  const nextCode = pts.find((s) => s.status === 'pending')?.orderCode;
  const seen = {};

  const fillFor = (s) => {
    if (s.status === 'delivered') return ['fill-leaf', 'fill-jute-light'];
    if (s.status === 'failed') return ['fill-chili', 'fill-jute-light'];
    if (s.status === 'skipped') return ['fill-soil-muted', 'fill-jute-light'];
    if (s.orderCode === nextCode) return ['fill-turmeric', 'fill-jute-light'];
    return ['fill-sunken stroke-soil-muted', 'fill-soil-muted'];
  };

  return (
    <svg
      viewBox="0 0 320 240"
      role="img"
      aria-label={label}
      className="w-full rounded-lg border border-jute-deep bg-sunken"
    >
      <defs>
        <pattern id="rm-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" className="stroke-jute-deep" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect width="320" height="240" fill="url(#rm-grid)" opacity="0.7" />
      <polyline
        fill="none"
        className="stroke-crate"
        strokeWidth="2"
        strokeDasharray="5 4"
        points={pts
          .map((s) => {
            const { x, y } = project(s.c);
            return `${x},${y}`;
          })
          .join(' ')}
      />
      {pts.map((s) => {
        const { x, y } = project(s.c);
        const n = (seen[s.zoneCode] = (seen[s.zoneCode] ?? -1) + 1); // spread stops sharing a zone
        const [circle, text] = fillFor(s);
        return (
          <g key={s.orderCode}>
            {s.orderCode === nextCode && (
              <circle
                cx={x + n * 18}
                cy={y}
                r="17"
                className="fill-none stroke-turmeric"
                strokeWidth="1.5"
                opacity="0.6"
              />
            )}
            <circle cx={x + n * 18} cy={y} r="12" strokeWidth="1.5" className={circle} />
            <text
              x={x + n * 18}
              y={y}
              dy="4"
              textAnchor="middle"
              className={`${text} text-xs font-semibold`}
            >
              {s.sequence}
            </text>
          </g>
        );
      })}
      {rider &&
        (() => {
          const { x, y } = project(rider);
          return (
            <circle cx={x} cy={y} r="7" className="fill-crate stroke-jute-light" strokeWidth="3" />
          );
        })()}
    </svg>
  );
}
