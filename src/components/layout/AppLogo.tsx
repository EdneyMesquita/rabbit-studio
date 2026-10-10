import { useId } from "react";
import { cn } from "@/lib/utils";

interface AppLogoProps {
  className?: string;
}

/**
 * The app mark (icons/icon-source.svg): the family's dark rounded square
 * with Rabbit Studio's rabbit head, inline so it scales crisply at any
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
        <linearGradient id={body} x1="512" y1="210" x2="512" y2="800" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFC28F" />
          <stop offset="1" stopColor="#E8590C" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="200" fill={`url(#${bg})`} />
      <g fill={`url(#${body})`}>
        <rect x="322" y="196" width="140" height="360" rx="70" transform="rotate(-9 392 520)" />
        <rect x="562" y="196" width="140" height="360" rx="70" transform="rotate(9 632 520)" />
        <ellipse cx="512" cy="600" rx="262" ry="212" />
      </g>
      <rect x="360" y="246" width="64" height="236" rx="32" fill="#FFE2C8" opacity=".75" transform="rotate(-9 392 520)" />
      <rect x="600" y="246" width="64" height="236" rx="32" fill="#FFE2C8" opacity=".75" transform="rotate(9 632 520)" />
      <circle cx="420" cy="584" r="32" fill="#8F3506" opacity=".8" />
      <circle cx="604" cy="584" r="32" fill="#8F3506" opacity=".8" />
      <path d="M 482 650 Q 512 632 542 650 Q 528 682 512 684 Q 496 682 482 650 Z" fill="#8F3506" opacity=".7" />
      <path
        d="M 512 684 V 716 M 512 716 Q 486 744 456 728 M 512 716 Q 538 744 568 728"
        fill="none"
        stroke="#8F3506"
        strokeWidth="16"
        strokeLinecap="round"
        opacity=".5"
      />
    </svg>
  );
}
