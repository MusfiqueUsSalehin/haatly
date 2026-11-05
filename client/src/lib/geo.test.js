// client/src/lib/geo.test.js
import { expect, it } from 'vitest';
import { projector } from './geo.js';

it('puts north above south and keeps every point inside the box', () => {
  const pts = [
    { lat: 23.9, lng: 90.3 },
    { lat: 23.7, lng: 90.5 },
  ];
  const project = projector(pts, 320, 240, 24);
  const [north, south] = pts.map(project);
  expect(north.y).toBeLessThan(south.y);
  for (const p of [north, south]) {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(320);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(240);
  }
});

it('survives a single point', () => {
  const { x, y } = projector([{ lat: 23.8, lng: 90.4 }])({ lat: 23.8, lng: 90.4 });
  expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
});
