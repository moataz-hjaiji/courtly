export function Logo() {
  return (
    <span className="brand">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="2" y="5" width="28" height="22" rx="4" fill="var(--primary)" />
        <path d="M16 5v22M2 16h28M8 5v22M24 5v22" stroke="#fff" strokeWidth="1.6" opacity=".9" />
      </svg>
      Courtly
    </span>
  )
}
