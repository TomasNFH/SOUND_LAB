// Lab flask with a sine wave inside: sound under study.
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <path
        d="M12.5 3h9M14 3v9.5L5.2 27.6C4.2 29.6 5.3 31 7.4 31h19.2c2.1 0 3.2-1.4 2.2-3.4L20 12.5V3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        className="logo-wave"
        d="M8.6 24c1.6-3.6 3.2-3.6 4.8 0s3.2 3.6 4.8 0 3.2-3.6 4.8 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
