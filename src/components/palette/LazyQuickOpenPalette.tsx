import { lazy, Suspense, useEffect, useState } from "react";
import { useUiStore } from "../../store/uiStore";

const QuickOpenPalette = lazy(() =>
  import("./QuickOpenPalette").then((m) => ({ default: m.QuickOpenPalette })),
);

/**
 * The quick-open palette, out of the startup bundle: it loads once the app
 * is idle after start (or at the first Ctrl+K, whichever comes first) and
 * stays mounted, so even the first opening takes the keys typed at once.
 */
export function LazyQuickOpenPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const [wanted, setWanted] = useState(false);
  if (open && !wanted) setWanted(true);
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => setWanted(true), { timeout: 4000 });
    return () => cancel(id);
  }, []);
  if (!wanted) return null;
  return (
    <Suspense fallback={null}>
      <QuickOpenPalette />
    </Suspense>
  );
}
