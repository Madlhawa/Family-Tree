import { useEffect, useMemo, useRef } from 'react';
import { openDossier, useData, useUI } from '../store/store';
import { birthUnionsOf, birthYear, deathYear, fullName, houseColor, houseOf, isLiving } from '../model/graph';
import { resolveArms } from '../model/arms';
import { Shield } from './Shield';
import { usePanZoom } from '../ui/usePanZoom';
import type { Dynasty } from '../model/types';

const START = 150; // degrees; the fan spans 240° opening upwards
const SPAN = 240;
const R0 = 86;
const width = (g: number) => (g <= 2 ? 92 : g <= 4 ? 112 : 128);
const inner = (g: number) => {
  let r = R0;
  for (let i = 1; i < g; i++) r += width(i);
  return r;
};

function parentsFor(d: Dynasty, id: string): [string | undefined, string | undefined] {
  const u = birthUnionsOf(d, id).find((u) => u.children.find((c) => c.id === id)?.kind === 'birth') ?? birthUnionsOf(d, id)[0];
  if (!u) return [undefined, undefined];
  const [a, b] = u.partners;
  const pa = d.people[a];
  const pb = d.people[b];
  if (pa?.sex === 'F' || pb?.sex === 'M') return [b, a];
  return [a, b];
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (r: number, deg: number) => [r * Math.cos(rad(deg)), r * Math.sin(rad(deg))] as const;

function sector(r0: number, r1: number, a0: number, a1: number) {
  const [x0, y0] = pt(r1, a0);
  const [x1, y1] = pt(r1, a1);
  const [x2, y2] = pt(r0, a1);
  const [x3, y3] = pt(r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
}

/** A radial pedigree: the person on the throne at the centre, forebears fanning outwards. */
export function FanChart() {
  const d = useData((s) => s.d);
  const focusId = useUI((s) => s.focusId);
  const depth = useUI((s) => s.fanDepth);
  const privacy = useUI((s) => s.privacy);
  const rootId = focusId && d.people[focusId] ? focusId : d.rootId;
  const container = useRef<HTMLDivElement>(null);
  const layer = useRef<SVGGElement>(null);
  const pz = usePanZoom(container, layer, () => {}, { x: 0, y: 0, k: 1 });

  const slots = useMemo(() => {
    const m = new Map<number, string>();
    if (!rootId) return m;
    m.set(1, rootId);
    for (let n = 1; n < 2 ** depth; n++) {
      const id = m.get(n);
      if (!id) continue;
      const [f, mo] = parentsFor(d, id);
      if (f) m.set(2 * n, f);
      if (mo) m.set(2 * n + 1, mo);
    }
    return m;
  }, [d, rootId, depth]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const R = inner(depth) + width(depth);
    const k = Math.min(el.clientWidth / (2 * R + 80), el.clientHeight / (R * 1.55 + 80));
    pz.setCam({ x: el.clientWidth / 2, y: el.clientHeight * 0.66, k });
  }, [depth, pz, rootId]);

  if (!rootId) return <div className="empty-state">Add someone to begin.</div>;
  const root = d.people[rootId];
  const rootArms = resolveArms(d, rootId);

  const sectors = [];
  for (let g = 1; g <= depth; g++) {
    const count = 2 ** g;
    const step = SPAN / count;
    const r0 = inner(g);
    const r1 = r0 + width(g);
    for (let i = 0; i < count; i++) {
      const n = count + i;
      const id = slots.get(n);
      const childId = slots.get(n >> 1);
      if (!id && !childId) continue;
      const a0 = START + i * step;
      const a1 = a0 + step;
      const mid = (a0 + a1) / 2;
      const rm = (r0 + r1) / 2;
      const p = id ? d.people[id] : undefined;
      const hidden = p && privacy && isLiving(p);
      const radial = g >= 4;
      const norm = ((mid % 360) + 360) % 360;
      const flip = radial ? norm > 90 && norm < 270 : norm < 180 && norm > 0;
      const rot = radial ? (flip ? mid + 180 : mid) : flip ? mid - 90 : mid + 90;
      const [tx, ty] = pt(rm, mid);
      const fs = g <= 2 ? 15 : g === 3 ? 12 : g === 4 ? 10.5 : 9;
      const years = p ? [birthYear(p), deathYear(p)].map((y) => y ?? '?').join('–') : '';
      sectors.push(
        <g
          key={n}
          className={`fan-slot ${p ? 'filled' : 'empty'} ${p?.placeholder ? 'ph' : ''}`}
          onClick={(e) => {
            if (p) openDossier(p.id);
            else if (childId) useUI.setState({ quickAdd: { anchorId: childId, rel: n % 2 === 0 ? 'father' : 'mother', x: e.clientX, y: e.clientY } });
          }}
          onDoubleClick={() => p && useUI.setState({ focusId: p.id })}
          style={{ ['--house' as any]: p ? houseColor(d, houseOf(p)) : undefined }}
        >
          <path d={sector(r0, r1, a0, a1)} />
          <g transform={`translate(${tx},${ty}) rotate(${rot})`}>
            {p ? (
              radial ? (
                <>
                  <text className="fan-name" fontSize={fs} y={-2} textAnchor="middle">
                    {hidden ? 'Living' : p.given || 'Unknown'}
                  </text>
                  <text className="fan-years" fontSize={fs * 0.82} y={fs - 1} textAnchor="middle">
                    {hidden ? '' : `${p.surname} ${years}`}
                  </text>
                </>
              ) : (
                <>
                  <text className="fan-name" fontSize={fs} y={-4} textAnchor="middle">
                    {hidden ? `Living ${p.surname}` : fullName(p)}
                  </text>
                  <text className="fan-years" fontSize={fs * 0.8} y={fs + 2} textAnchor="middle">
                    {hidden ? '' : years}
                  </text>
                </>
              )
            ) : (
              <text className="fan-add" fontSize={fs} textAnchor="middle" y={4}>
                + {n % 2 === 0 ? 'father' : 'mother'}
              </text>
            )}
          </g>
        </g>,
      );
    }
  }

  return (
    <div className="fan-wrap" ref={container}>
      <svg className="fan" width="100%" height="100%">
        <g ref={layer}>
          {sectors}
          <g className="fan-center" onClick={() => openDossier(rootId)}>
            <circle r={R0 - 4} />
            <foreignObject x={-30} y={-62} width={60} height={70}>
              <div className="fan-shield">
                <Shield arms={rootArms.arms} shape={rootArms.shape} cadency={rootArms.cadency} size={46} />
              </div>
            </foreignObject>
            <text className="fan-root" textAnchor="middle" y={26} fontSize={15}>
              {privacy && isLiving(root) ? 'Living' : root.given}
            </text>
            <text className="fan-years" textAnchor="middle" y={44} fontSize={12}>
              {root.surname}
            </text>
          </g>
        </g>
      </svg>
      <div className="fan-controls" data-nopan>
        <span>Generations</span>
        {[3, 4, 5, 6, 7].map((n) => (
          <button key={n} className={depth === n ? 'on' : ''} onClick={() => useUI.setState({ fanDepth: n })}>
            {n}
          </button>
        ))}
      </div>
      <p className="fan-hint" data-nopan>
        Click a name for the dossier · double-click to re-centre · empty slots add a parent
      </p>
    </div>
  );
}
