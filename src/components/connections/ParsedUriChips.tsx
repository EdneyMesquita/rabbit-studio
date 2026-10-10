import { useMemo } from "react";
import { CircleAlert } from "lucide-react";
import { parseManagementUrl } from "@/lib/connectionUri";

/** What the management URL says - host, port, TLS, API path, user - as small chips. */
export function ParsedUriChips({ uri }: { uri: string }) {
  const parsed = useMemo(() => parseManagementUrl(uri), [uri]);
  if (!parsed) return null;
  if (!parsed.ok) {
    return (
      <p className="flex items-center gap-[5px] text-xs text-danger [&_svg]:size-3 [&_svg]:shrink-0">
        <CircleAlert />
        {parsed.error}
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Read from the URL">
      {parsed.facts.map((fact) => (
        <li
          key={fact.label}
          className="inline-flex h-[22px] max-w-full min-w-0 items-center gap-1.5 rounded-sm bg-fg/6 px-2 text-xs text-fg-2"
        >
          {fact.label}
          {fact.value && (
            <b className="truncate font-mono font-medium text-fg [font-variant-ligatures:none]">{fact.value}</b>
          )}
          {fact.suffix && <span>{fact.suffix}</span>}
        </li>
      ))}
    </ul>
  );
}
