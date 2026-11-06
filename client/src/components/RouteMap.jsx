// client/src/components/RouteMap.jsx
import { projector } from '../lib/geo.js';

const COLOR = { pending: '#E0A42E', delivered: '#2F5D3A', failed: '#C0392B', skipped: '#9CA3AF' };

/** Plain SVG: stops sit at their zone centre, joined in route order. No map tiles needed. */
export default function RouteMap({ stops, centers, rider, label }) {
  const pts = stops.map((s) => ({ ...s, c: centers[s.zoneCode] })).filter((s) => s.c);
  if (pts.length === 0) return null;
  const project = projector(rider ? [...pts.map((s) => s.c), rider] : pts.map((s) => s.c));
  const seen = {};

  return (
    <svg viewBox="0 0 320 240" role="img" aria-label={label} className="w-full rounded-lg bg-surface">
      <polyline
        fill="none"
        stroke="#1D6FA3"
        strokeWidth="2"
        strokeDasharray="4 4"
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
        return (
          <g key={s.orderCode}>
            <circle cx={x + n * 16} cy={y} r="11" fill={COLOR[s.status]} />
            <text
              x={x + n * 16}
              y={y}
              dy="4"
              textAnchor="middle"
              className="fill-white text-xs font-semibold"
            >
              {s.sequence}
            </text>
          </g>
        );
      })}
      {rider &&
        (() => {
          const { x, y } = project(rider);
          return <circle cx={x} cy={y} r="7" fill="#1D6FA3" stroke="#fff" strokeWidth="3" />;
        })()}
    </svg>
  );
}
