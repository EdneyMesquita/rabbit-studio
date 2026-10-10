import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Scan, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface View {
  k: number;
  x: number;
  y: number;
}

const MIN_K = 0.15;
const MAX_K = 2.5;
const clamp = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

/**
 * A canvas for content drawn 1:1 at `width` x `height`: drag to pan, wheel
 * or pinch to zoom around the pointer, buttons for fit and 100%. It holds
 * the view itself, so panning re-renders only this shell: the `children`
 * element is the parent's and React leaves it alone. Fits once when the
 * content first has a size (zoom never below 0.8, so text stays legible).
 */
export default function PanZoom({
  width,
  height,
  fitKey,
  children,
  onBackgroundClick,
}: {
  width: number;
  height: number;
  /** Fit again when this changes (another vhost). */
  fitKey: string;
  children: ReactNode;
  onBackgroundClick?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ k: 1, x: 12, y: 12 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const fitted = useRef<string | null>(null);
  const size = useRef({ width, height });
  size.current = { width, height };

  const fitTo = useCallback((minK: number, maxK: number, pad = 24) => {
    const el = box.current;
    const { width: w, height: h } = size.current;
    if (!el || !el.clientWidth || w <= 0) return false;
    const k = Math.max(minK, Math.min(maxK, (el.clientWidth - pad) / w, (el.clientHeight - pad) / h));
    setView({ k, x: Math.max(12, (el.clientWidth - w * k) / 2), y: Math.max(4, (el.clientHeight - h * k) / 2 - (minK >= 0.8 ? 20 : 0)) });
    return true;
  }, []);

  // First fit once the pane has a size (a hidden tab has none until shown).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const tryFit = () => {
      if (fitted.current === fitKey || size.current.width <= 0) return;
      if (fitTo(0.8, 1)) fitted.current = fitKey;
    };
    tryFit();
    const ro = new ResizeObserver(tryFit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitKey, fitTo, width]);

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setView((v) => {
      const k = clamp(v.k * factor);
      const f = k / v.k;
      return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
    });
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const pinch = useRef<{ d: number; k: number } | null>(null);
  const moved = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // A mouse is one pointer: forget one whose release was missed.
    if (e.pointerType === "mouse") pointers.current.clear();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (pointers.current.size === 1) drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
      drag.current = null;
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const el = box.current;
    if (!el) return;
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = el.getBoundingClientRect();
      const target = (pinch.current.k * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.d;
      zoomAt(clamp(target) / viewRef.current.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      moved.current = true;
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      moved.current = true;
      // Capture only once it is a drag, so a plain click still reaches the node.
      el.setPointerCapture(e.pointerId);
    }
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };

  const center = () => {
    const el = box.current;
    return el ? ([el.clientWidth / 2, el.clientHeight / 2] as const) : ([0, 0] as const);
  };

  return (
    <div
      ref={box}
      className="relative min-h-0 flex-1 touch-none overflow-hidden bg-editor [background-image:radial-gradient(var(--t-line-soft)_1px,transparent_1px)] [background-size:20px_20px]"
      style={{ cursor: "grab" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={() => {
        if (!moved.current) onBackgroundClick?.();
        moved.current = false;
      }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left will-change-transform"
        style={{ width, height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
      >
        {children}
      </div>
      <div
        className="absolute right-3 bottom-3 flex flex-col gap-0.5 rounded-md border border-line bg-panel p-0.5"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <Button variant="ghost" size="icon-sm" aria-label="Zoom in" title="Zoom in" onClick={() => zoomAt(1.2, ...center())}>
          <ZoomIn />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Zoom out" title="Zoom out" onClick={() => zoomAt(1 / 1.2, ...center())}>
          <ZoomOut />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Actual size"
          title="100%"
          className="text-[10px] font-medium"
          onClick={() => {
            const el = box.current;
            if (!el) return;
            const { width: w, height: h } = size.current;
            setView({ k: 1, x: Math.max(12, (el.clientWidth - w) / 2), y: Math.max(4, (el.clientHeight - h) / 2) });
          }}
        >
          1:1
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Fit to view" title="Fit to view" onClick={() => fitTo(MIN_K, 1.2)}>
          <Scan />
        </Button>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-3 flex gap-3 text-xs text-fg-3 select-none">
        <span>Drag to pan, scroll to zoom</span>
        <span className="font-mono tabular-nums">{Math.round(view.k * 100)}%</span>
      </div>
    </div>
  );
}
