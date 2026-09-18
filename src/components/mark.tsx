export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M5 9.5h22M5 16h16.5M5 22.5h12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M21 18.5c3.2.2 6 2.4 6 5.2 0 2.4-1.8 4.3-4.1 4.3-2.6 0-4.4-2.1-4.4-4.6 0-1.2.4-2.3 1.2-3.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="26.2" cy="22.4" r="0.9" fill="currentColor" />
    </svg>
  );
}
