// client/src/components/StatCard.jsx
export default function StatCard({ label, value, color = 'text-leaf-dark', hint }) {
  return (
    <div className="crate-card p-4">
      <p className="text-xs text-soil-muted">{label}</p>
      <p className={`mt-1 font-display text-3xl ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-soil-muted">{hint}</p>}
    </div>
  );
}
