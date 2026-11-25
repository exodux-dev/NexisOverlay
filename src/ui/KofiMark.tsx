import { useId } from "react";

/** Nexis × Ko-fi: the Nexis hexagon (teal → Ko-fi coral) holding a coffee cup with a heart. */
export function KofiMark({ size = 56, className = "" }: { size?: number; className?: string }) {
  const id = `kf${useId().replace(/:/g, "")}`;
  return (
    <svg className={`kofi-mark ${className}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5eead4" />
          <stop offset="0.55" stopColor="#a99bff" />
          <stop offset="1" stopColor="#ff5e5b" />
        </linearGradient>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5eead4" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ff5e5b" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <path d="M32 3l25.1 14.5v29L32 61 6.9 46.5v-29z" fill={`url(#${id}f)`} stroke={`url(#${id}s)`} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M26 15c-1.4 2 1.4 3.4 0 5.4M32 13.5c-1.4 2 1.4 3.4 0 5.4M38 15c-1.4 2 1.4 3.4 0 5.4" fill="none" stroke="#a99bff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19 25h24v10.5c0 6.4-5.2 11.5-11.5 11.5h-1C24.2 47 19 41.9 19 35.5z" fill="#fff" />
      <path d="M43 27.5h2.2a5 5 0 0 1 0 10H42" fill="none" stroke="#fff" strokeWidth="3.2" />
      <path d="M31 41s-6-3.4-6-7.3a3.2 3.2 0 0 1 6-1.6 3.2 3.2 0 0 1 6 1.6c0 3.9-6 7.3-6 7.3z" fill="#ff5e5b" />
    </svg>
  );
}
