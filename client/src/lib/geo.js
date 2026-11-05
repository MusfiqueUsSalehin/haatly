// client/src/lib/geo.js
/** Returns a function that fits lat/lng points into a w×h box. North is up (SVG y points down). */
export function projector(points, w = 320, h = 240, pad = 24) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats),
    maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs),
    maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 0.01;
  const spanLng = maxLng - minLng || 0.01;
  const scale = Math.min((w - 2 * pad) / spanLng, (h - 2 * pad) / spanLat);
  const offX = (w - spanLng * scale) / 2;
  const offY = (h - spanLat * scale) / 2;
  return (p) => ({ x: offX + (p.lng - minLng) * scale, y: offY + (maxLat - p.lat) * scale });
}
