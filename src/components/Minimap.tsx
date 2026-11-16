import { useEffect, useRef } from 'react';
import type { Layout } from '../layout/familyLayout';
import type { Person } from '../model/types';
import { houseOf } from '../model/graph';
import type { Cam } from '../ui/usePanZoom';

const W = 190;
const H = 120;

/** An antique-map minimap: houses as coloured dots, the viewport as a gilt frame. */
export function Minimap({
  layout,
  colors,
  people,
  container,
  listeners,
  onJump,
}: {
  layout: Layout;
  colors: Map<string, string>;
  people: Record<string, Person>;
  container: React.RefObject<HTMLDivElement>;
  listeners: Set<(c: Cam) => void>;
  onJump: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lastCam = useRef<Cam | null>(null);

  const b = layout.bounds;
  const pad = 200;
  const bw = b.maxX - b.minX + pad * 2;
  const bh = b.maxY - b.minY + pad * 2;
  const s = Math.min(W / bw, H / bh);
  const ox = (W - bw * s) / 2 - (b.minX - pad) * s;
  const oy = (H - bh * s) / 2 - (b.minY - pad) * s;

  const draw = (cam: Cam | null) => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== W * dpr) {
      c.width = W * dpr;
      c.height = H * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const n of layout.nodes.values()) {
      const p = people[n.id];
      ctx.fillStyle = colors.get(houseOf(p)) ?? '#8b1a1a';
      const w = Math.max(2, 200 * s);
      ctx.fillRect(ox + n.x * s - w / 2, oy + n.y * s - 1.5, w, 3);
    }
    const el = container.current;
    if (cam && el) {
      const x0 = -cam.x / cam.k;
      const y0 = -cam.y / cam.k;
      ctx.strokeStyle = '#c9a14a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox + x0 * s, oy + y0 * s, (el.clientWidth / cam.k) * s, (el.clientHeight / cam.k) * s);
    }
  };

  useEffect(() => {
    draw(lastCam.current);
    const fn = (c: Cam) => {
      lastCam.current = c;
      draw(c);
    };
    listeners.add(fn);
    return () => void listeners.delete(fn);
  });

  const jump = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = (e.clientX - r.left - ox) / s;
    const y = (e.clientY - r.top - oy) / s;
    onJump(x, y);
  };

  return (
    <div className="minimap" data-nopan>
      <canvas
        ref={ref}
        style={{ width: W, height: H }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          jump(e);
        }}
        onPointerMove={(e) => e.buttons && jump(e)}
        aria-label="Minimap"
      />
    </div>
  );
}
