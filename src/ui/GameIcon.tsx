import { useEffect, useState, type CSSProperties } from "react";
import { hueOf, initials } from "./format";

interface Props {
  src?: string;
  name: string;
  size?: number;
  round?: boolean;
  className?: string;
}

/** Item / champion portrait with a graceful initials tile when the image is missing or fails. */
export function GameIcon({ src, name, size = 40, round = false, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const style: CSSProperties = { width: size, height: size, borderRadius: round ? "50%" : "var(--icon-radius, 4px)" };
  const cls = `gicon ${className}`;
  if (!src || failed) {
    const h = hueOf(name);
    return (
      <span
        className={`${cls} gicon-fallback`}
        style={{ ...style, fontSize: Math.max(9, size * 0.34), background: `linear-gradient(135deg, hsl(${h} 38% 30%), hsl(${(h + 40) % 360} 40% 18%))` }}
        role="img"
        aria-label={name}
      >
        {initials(name)}
      </span>
    );
  }
  // Lazy + async decode: big grids (tier list, champion picker) only fetch / decode what's on screen.
  return <img className={cls} style={style} src={src} alt={name} width={size} height={size} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />;
}
