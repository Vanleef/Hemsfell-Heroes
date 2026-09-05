/** Render rule-owned marker amounts directly; never rewrite React text via DOM observers. */
export default function CardMarkerCounter({ count }: { count: number }) {
  const value = Math.trunc(count);
  if (!Number.isFinite(value) || value <= 0) return null;
  const label = `${value} ${value === 1 ? "marcador" : "marcadores"}`;
  return <i className="card-frame-marker" data-marker-count={value} aria-label={label} title={label}>{value}</i>;
}
