import { useId } from "react";
import { cn } from "@/lib/utils";

interface AppLogoProps {
  className?: string;
}

/**
 * The app mark (icons/icon-source.svg): the family's dark rounded square
 * with Rabbit Studio's rabbit in profile (blocks like the RabbitMQ mark, the window as its eye), inline so it scales crisply at any
 * size. Gradient ids are per instance: two logos on screen (toolbar and
 * welcome) mustn't share them.
 */
export function AppLogo({ className }: AppLogoProps) {
  // useId's punctuation doesn't survive url(#...) everywhere
  const id = `logo${useId().replace(/[^\w-]/g, "")}`;
  const bg = `${id}-bg`;
  const body = `${id}-body`;
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#242837" />
          <stop offset="1" stopColor="#0d0f14" />
        </linearGradient>
        <linearGradient id={body} x1="512" y1="180" x2="512" y2="820" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFB27A" />
          <stop offset="1" stopColor="#E8590C" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="200" fill={`url(#${bg})`} />
      <g transform="translate(14 22)">
        <rect x="606" y="196" width="88" height="250" rx="34" fill="#C2460A" transform="rotate(-8 650 440)" />
        <rect x="508" y="170" width="96" height="290" rx="36" fill={`url(#${body})`} transform="rotate(-16 556 440)" />
        <rect x="536" y="212" width="40" height="190" rx="20" fill="#FFE2C8" opacity=".7" transform="rotate(-16 556 440)" />
        <g fill={`url(#${body})`}>
          <rect x="494" y="372" width="290" height="250" rx="64" />
          <rect x="236" y="498" width="470" height="292" rx="96" />
          <rect x="196" y="560" width="96" height="96" rx="40" />
          <rect x="626" y="722" width="150" height="68" rx="30" />
        </g>
        <rect x="672" y="444" width="56" height="56" rx="14" fill="#7A2C05" opacity=".85" />
        <rect x="760" y="528" width="24" height="26" rx="10" fill="#7A2C05" opacity=".7" />
      </g>
    </svg>
  );
}
