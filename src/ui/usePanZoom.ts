import { useCallback, useEffect, useMemo, useRef } from 'react';

export interface Cam {
  x: number;
  y: number;
  k: number;
}

export const MIN_K = 0.08;
export const MAX_K = 2.5;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Pointer/wheel/pinch pan-zoom that writes the transform straight to the DOM
 * (no React re-render per frame) and reports view changes through `onView`.
 */
export function usePanZoom(
  container: React.RefObject<HTMLDivElement>,
  layer: React.RefObject<HTMLElement | SVGGElement>,
  onView: (cam: Cam) => void,
  initial: Cam = { x: 0, y: 0, k: 0.8 },
) {
  const cam = useRef<Cam>({ ...initial });
  const raf = useRef<number>();
  const anim = useRef<number>();
  const dragged = useRef(false);
  const onViewRef = useRef(onView);
  onViewRef.current = onView;

  const apply = useCallback(() => {
    const el = layer.current;
    const { x, y, k } = cam.current;
    if (el) {
      if (el instanceof SVGGElement) el.setAttribute('transform', `translate(${x},${y}) scale(${k})`);
      else el.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    }
    if (raf.current === undefined)
      raf.current = requestAnimationFrame(() => {
        raf.current = undefined;
        onViewRef.current(cam.current);
      });
  }, [layer]);

  const setCam = useCallback(
    (c: Cam) => {
      cam.current = { ...c, k: Math.min(MAX_K, Math.max(MIN_K, c.k)) };
      apply();
    },
    [apply],
  );

  const stopAnim = () => {
    if (anim.current) cancelAnimationFrame(anim.current);
    anim.current = undefined;
  };

  /** Glide so that world point (wx, wy) sits at the viewport centre at zoom k. */
  const flyTo = useCallback(
    (wx: number, wy: number, k?: number, ms = 750) => {
      const el = container.current;
      if (!el) return;
      stopAnim();
      const w = el.clientWidth;
      const h = el.clientHeight;
      const c0 = cam.current;
      const k0 = c0.k;
      const k1 = Math.min(MAX_K, Math.max(MIN_K, k ?? Math.max(c0.k, 0.75)));
      const cx0 = (w / 2 - c0.x) / k0;
      const cy0 = (h / 2 - c0.y) / k0;
      const dist = Math.hypot(wx - cx0, wy - cy0) * Math.min(k0, k1);
      const dip = Math.min(0.55, dist / (w * 3));
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        const e = ease(t);
        const kk = (k0 + (k1 - k0) * e) * (1 - dip * Math.sin(Math.PI * e));
        const cx = cx0 + (wx - cx0) * e;
        const cy = cy0 + (wy - cy0) * e;
        cam.current = { x: w / 2 - cx * kk, y: h / 2 - cy * kk, k: kk };
        apply();
        if (t < 1) anim.current = requestAnimationFrame(step);
        else anim.current = undefined;
      };
      anim.current = requestAnimationFrame(step);
    },
    [apply, container],
  );

  const fitBounds = useCallback(
    (b: { minX: number; minY: number; maxX: number; maxY: number }, animate = true) => {
      const el = container.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const k = Math.min(1.1, Math.max(MIN_K, Math.min((w - 80) / (b.maxX - b.minX || 1), (h - 160) / (b.maxY - b.minY || 1))));
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      if (animate) flyTo(cx, cy, k);
      else setCam({ x: w / 2 - cx * k, y: h / 2 - cy * k, k });
    },
    [container, flyTo, setCam],
  );

  const zoomBy = useCallback(
    (factor: number, sx?: number, sy?: number) => {
      const el = container.current;
      if (!el) return;
      stopAnim();
      const r = el.getBoundingClientRect();
      const px = sx ?? r.width / 2;
      const py = sy ?? r.height / 2;
      const c = cam.current;
      const k = Math.min(MAX_K, Math.max(MIN_K, c.k * factor));
      const f = k / c.k;
      setCam({ x: px - (px - c.x) * f, y: py - (py - c.y) * f, k });
    },
    [container, setCam],
  );

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    apply();
    const pointers = new Map<number, { x: number; y: number }>();
    let startDist = 0;
    let startK = 1;
    let downAt = { x: 0, y: 0 };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      // Mouse wheels (line mode or big pixel steps) and trackpad pinches (ctrl) zoom; two-finger scrolls pan.
      const isZoom = e.ctrlKey || e.metaKey || e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40);
      if (isZoom) {
        const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        const f = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015));
        zoomBy(f, e.clientX - r.left, e.clientY - r.top);
      } else {
        // trackpad two-finger scroll → pan
        stopAnim();
        setCam({ ...cam.current, x: cam.current.x - e.deltaX, y: cam.current.y - e.deltaY });
      }
    };
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-nopan]')) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      stopAnim();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        dragged.current = false;
        downAt = { x: e.clientX, y: e.clientY };
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        startDist = Math.hypot(a.x - b.x, a.y - b.y);
        startK = cam.current.k;
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      if (!dragged.current && Math.hypot(cur.x - downAt.x, cur.y - downAt.y) > 5) {
        dragged.current = true;
        el.classList.add('panning');
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      if (pointers.size === 1 && dragged.current) {
        setCam({ ...cam.current, x: cam.current.x + cur.x - prev.x, y: cam.current.y + cur.y - prev.y });
      } else if (pointers.size === 2) {
        pointers.set(e.pointerId, cur);
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const r = el.getBoundingClientRect();
        const mx = (a.x + b.x) / 2 - r.left;
        const my = (a.y + b.y) / 2 - r.top;
        const target = startK * (dist / (startDist || 1));
        zoomBy(target / cam.current.k, mx, my);
        dragged.current = true;
      }
      pointers.set(e.pointerId, cur);
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (!pointers.size) el.classList.remove('panning');
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [apply, container, setCam, zoomBy]);

  return useMemo(() => ({ cam, setCam, flyTo, fitBounds, zoomBy, wasDragged: () => dragged.current }), [setCam, flyTo, fitBounds, zoomBy]);
}
