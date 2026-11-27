import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { actions, camera, openDossier, toast, toggleSet, useData, useUI } from '../store/store';
import { pickFile, resizeImage } from '../ui/files';
import { CARD_H, CARD_W, computeLayout, type Layout } from '../layout/familyLayout';
import { aliveIn, birthYear, houseColor, houseOf, parentsOf } from '../model/graph';
import { resolveArms, type ResolvedArms } from '../model/arms';
import { allWarnings } from '../model/validate';
import { describeRelationship } from '../model/relationship';
import { PersonCard, type TimeState } from './PersonCard';
import { usePanZoom, type Cam } from '../ui/usePanZoom';
import type { RelKind } from '../model/ops';
import { Minimap } from './Minimap';

type Lod = 'full' | 'compact' | 'far';
const lodOf = (k: number): Lod => (k < 0.22 ? 'far' : k < 0.5 ? 'compact' : 'full');

interface ViewRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function TreeCanvas() {
  const d = useData((s) => s.d);
  const mode = useUI((s) => s.mode);
  const focusId = useUI((s) => s.focusId);
  const collapsedUp = useUI((s) => s.collapsedUp);
  const collapsedDown = useUI((s) => s.collapsedDown);
  const selectedId = useUI((s) => s.selectedId);
  const thread = useUI((s) => s.thread);
  const timeYear = useUI((s) => s.timeYear);
  const privacy = useUI((s) => s.privacy);
  const highlightHouse = useUI((s) => s.highlightHouse);
  const sagaActive = useUI((s) => !!s.saga);
  const crests = useUI((s) => s.crests);
  const extras = useUI((s) => s.extras);
  const quickAddOpen = useUI((s) => !!s.quickAdd);
  const [hoverId, setHoverId] = useState<string>();
  const hideTimer = useRef<number>();

  const rootId = focusId && d.people[focusId] ? focusId : d.rootId;
  const layoutMode = mode === 'fan' ? 'family' : mode;
  const layout: Layout = useMemo(
    () => computeLayout(d, { rootId, mode: layoutMode, collapsedUp, collapsedDown }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.people, d.unions, rootId, layoutMode, collapsedUp, collapsedDown],
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const container = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const [lod, setLod] = useState<Lod>('full');
  const [view, setView] = useState<ViewRect>({ x0: -3000, y0: -3000, x1: 3000, y1: 3000 });
  const viewRef = useRef(view);
  const camListeners = useRef(new Set<(c: Cam) => void>());

  const onView = useCallback((c: Cam) => {
    const el = container.current;
    if (!el) return;
    const l = lodOf(c.k);
    setLod((prev) => (prev === l ? prev : l));
    const w = el.clientWidth / c.k;
    const h = el.clientHeight / c.k;
    const x0 = -c.x / c.k;
    const y0 = -c.y / c.k;
    const v = viewRef.current;
    if (x0 < v.x0 || y0 < v.y0 || x0 + w > v.x1 || y0 + h > v.y1) {
      const nv = { x0: x0 - w * 0.6, y0: y0 - h * 0.6, x1: x0 + w * 1.6, y1: y0 + h * 1.6 };
      viewRef.current = nv;
      setView(nv);
    }
    camListeners.current.forEach((fn) => fn(c));
  }, []);

  const pz = usePanZoom(container, world, onView);

  // Fly to people on request
  useEffect(
    () =>
      camera.onFly((id, zoom) => {
        const n = layoutRef.current.nodes.get(id);
        if (n) pz.flyTo(n.x, n.y, zoom);
      }),
    [pz],
  );
  useEffect(() => camera.onFit(() => pz.fitBounds(layoutRef.current.bounds)), [pz]);

  // First paint: centre on the heart of the tree
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || !layout.nodes.size) return;
    didInit.current = true;
    const el = container.current!;
    const n = rootId ? layout.nodes.get(rootId) : undefined;
    const k = 0.72;
    if (n) pz.setCam({ x: el.clientWidth / 2 - n.x * k, y: el.clientHeight / 2 - (n.y - 60) * k, k });
    else pz.fitBounds(layout.bounds, false);
  }, [layout, pz, rootId]);

  // Re-centre when the throne (focus) changes
  const prevRoot = useRef(rootId);
  useEffect(() => {
    if (prevRoot.current !== rootId && rootId) {
      prevRoot.current = rootId;
      const n = layout.nodes.get(rootId);
      if (n) pz.flyTo(n.x, n.y);
    }
  }, [rootId, layout, pz]);

  // Derived visual state
  const arms = useMemo(() => {
    const m = new Map<string, ResolvedArms>();
    for (const id of Object.keys(d.people)) m.set(id, resolveArms(d, id));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.people, d.unions, d.houses]);
  const colors = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of Object.values(d.people)) {
      const h = houseOf(p);
      if (!m.has(h)) m.set(h, houseColor(d, h));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.people, d.houses]);
  const warnings = useMemo(() => allWarnings(d), [d]);

  const relation = useMemo(() => (thread?.a && thread?.b ? describeRelationship(d, thread.a, thread.b) : undefined), [d, thread]);
  const pathIds = useMemo(() => new Set(relation?.path?.map((s) => s.id) ?? []), [relation]);
  const picking = !!thread && !thread.b;

  const rootAncestors = useMemo(() => {
    const s = new Set<string>();
    if (!rootId) return s;
    const q = [rootId];
    while (q.length) {
      const x = q.pop()!;
      if (s.has(x)) continue;
      s.add(x);
      for (const p of parentsOf(d, x)) if (p.kind === 'birth') q.push(p.id);
    }
    return s;
  }, [d, rootId]);

  const timeOf = (id: string): TimeState => {
    if (timeYear === null) return undefined;
    const a = aliveIn(d.people[id], timeYear);
    if (a === undefined) return 'unknown';
    if (a) return 'alive';
    const by = birthYear(d.people[id]);
    return by !== undefined && timeYear < by ? 'unborn' : 'dead';
  };

  // Interaction
  const onClick = (e: React.MouseEvent) => {
    if (pz.wasDragged()) return;
    const t = (e.target as HTMLElement).closest('[data-person]') as HTMLElement | null;
    if (!t) {
      if (!(e.target as HTMLElement).closest('[data-nopan]')) useUI.setState({ selectedId: undefined, quickAdd: undefined });
      return;
    }
    const id = t.dataset.person!;
    if (thread && !thread.b) {
      if (!thread.a) useUI.setState({ thread: { a: id } });
      else if (id !== thread.a) useUI.setState({ thread: { a: thread.a, b: id } });
      return;
    }
    openDossier(id);
  };

  // Hovering a tile reveals the add-relative ring; it lingers briefly so the pointer can reach it
  const onPointerOver = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const el = e.target as HTMLElement;
    const card = el.closest('[data-person]') as HTMLElement | null;
    if (card || el.closest('.quick-ring')) window.clearTimeout(hideTimer.current);
    if (card && card.dataset.person !== hoverId) setHoverId(card.dataset.person);
  };
  const onPointerOut = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const to = e.relatedTarget as HTMLElement | null;
    if (to && (to.closest?.('[data-person]') || to.closest?.('.quick-ring'))) return;
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHoverId(undefined), 350);
  };

  const setPhoto = async (id: string) => {
    const file = await pickFile('image/*');
    if (!file) return;
    try {
      actions.updatePerson(id, { portrait: await resizeImage(file, 600) }, `Added a photo of ${d.people[id]?.given || 'someone'}`);
    } catch {
      toast('That file could not be read as an image.');
    }
  };

  const quick = (rel: RelKind, anchorId: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    useUI.setState({ quickAdd: { anchorId, rel, x: e.clientX, y: e.clientY } });
  };

  // Visible nodes (culled)
  const nodes = [...layout.nodes.values()].filter(
    (n) => n.x + CARD_W / 2 > view.x0 && n.x - CARD_W / 2 < view.x1 && n.y + CARD_H > view.y0 && n.y - CARD_H < view.y1,
  );

  const ringId = quickAddOpen ? useUI.getState().quickAdd?.anchorId : hoverId ?? selectedId;
  const sel = ringId ? layout.nodes.get(ringId) : undefined;
  const dimAll = pathIds.size > 0 || !!highlightHouse;

  return (
    <div className={`canvas lod-${lod} ${picking ? 'picking' : ''}`} ref={container} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <div className="world" ref={world}>
        <svg className="lines" width={1} height={1}>
          <defs>
            <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {layout.unions.map((u) => {
            const faded = dimAll && !(u.partners.some((p) => pathIds.has(p.id)) && u.children.some((c) => pathIds.has(c.id)));
            return (
              <g key={u.id} className={`union st-${u.status} ${faded ? 'faded' : ''}`}>
                {u.partners.length === 2 && (
                  <>
                    <path className="marriage" d={`M${Math.min(u.partners[0].x, u.partners[1].x) + CARD_W / 2},${u.junction.y} H${Math.max(u.partners[0].x, u.partners[1].x) - CARD_W / 2}`} />
                    <g className="rings" transform={`translate(${u.junction.x},${u.junction.y})`}>
                      <circle cx={-3.5} r={5} />
                      <circle cx={3.5} r={5} />
                    </g>
                  </>
                )}
                {u.children.length > 0 && (
                  <>
                    <path
                      className="halo"
                      d={`M${u.junction.x},${u.junction.y + (u.partners.length === 2 ? 6 : 0)} V${u.barY} M${Math.min(u.junction.x, ...u.children.map((c) => c.x))},${u.barY} H${Math.max(u.junction.x, ...u.children.map((c) => c.x))} ${u.children.map((c) => `M${c.x},${u.barY} V${c.y - CARD_H / 2}`).join(' ')}`}
                    />
                    <path
                      className="descent"
                      d={`M${u.junction.x},${u.junction.y + (u.partners.length === 2 ? 6 : 0)} V${u.barY} M${Math.min(u.junction.x, ...u.children.map((c) => c.x))},${u.barY} H${Math.max(u.junction.x, ...u.children.map((c) => c.x))}`}
                    />
                    {u.children.map((c) => (
                      <path key={c.id} className={`descent kind-${c.kind}`} d={`M${c.x},${u.barY} V${c.y - CARD_H / 2}`} />
                    ))}
                  </>
                )}
              </g>
            );
          })}
          {relation?.path && relation.path.length > 1 && (
            <g className="thread" filter="url(#goldGlow)">
              {relation.path.slice(1).map((s, i) => {
                const a = layout.nodes.get(relation.path![i].id);
                const b = layout.nodes.get(s.id);
                if (!a || !b) return null;
                const my = Math.min(a.y, b.y) - (a.y === b.y ? 70 : 20);
                return <path key={s.id} d={`M${a.x},${a.y} Q${(a.x + b.x) / 2},${my} ${b.x},${b.y}`} />;
              })}
            </g>
          )}
        </svg>

        {lod === 'full' &&
          !timeYear &&
          nodes
            .filter((n) => n.id !== selectedId && rootAncestors.has(n.id) && parentsOf(d, n.id).filter((p) => p.kind === 'birth').length < 2 && !layout.hiddenUp.get(n.id) && !d.people[n.id]?.placeholder)
            .map((n) => (
              <button
                key={'fog' + n.id}
                data-nopan
                className="fog"
                style={{ transform: `translate(${n.x - 70}px, ${n.y - CARD_H / 2 - 74}px)` }}
                onClick={quick(parentsOf(d, n.id).some((p) => d.people[p.id]?.sex === 'M') ? 'mother' : 'father', n.id)}
                title="Unexplored lineage — add a parent"
              >
                <span>Unexplored lineage</span>
              </button>
            ))}

        {nodes.map((n) => {
          const p = d.people[n.id];
          if (!p) return null;
          return (
            <PersonCard
              key={n.id}
              p={p}
              x={n.x}
              y={n.y}
              arms={arms.get(n.id)!}
              color={colors.get(houseOf(p)) ?? '#8b1a1a'}
              selected={selectedId === n.id}
              dim={(pathIds.size > 0 && !pathIds.has(n.id)) || (!!highlightHouse && houseOf(p) !== highlightHouse)}
              glow={pathIds.has(n.id)}
              warn={warnings.get(n.id)?.length ?? 0}
              privacy={privacy}
              time={timeOf(n.id)}
              isRoot={n.id === rootId}
              pickHint={picking}
              crest={crests}
              extras={extras}
            />
          );
        })}

        {nodes.map((n) => {
          const up = layout.hiddenUp.get(n.id);
          const down = layout.hiddenDown.get(n.id);
          return (
            <span key={'b' + n.id}>
              {up ? (
                <button data-nopan className="badge badge-up" style={{ transform: `translate(${n.x - 26}px, ${n.y - CARD_H / 2 - 30}px)` }} onClick={() => toggleSet('collapsedUp', n.id)} title="Show ancestors">
                  ▲ {up}
                </button>
              ) : null}
              {down ? (
                <button data-nopan className="badge badge-down" style={{ transform: `translate(${n.x - 26}px, ${n.y + CARD_H / 2 + 8}px)` }} onClick={() => toggleSet('collapsedDown', n.id)} title="Show descendants">
                  ▼ {down}
                </button>
              ) : null}
            </span>
          );
        })}

        {sel && lod !== 'far' && !picking && !sagaActive && (
          <QuickRing
            x={sel.x}
            y={sel.y}
            id={sel.id}
            quick={quick}
            onPhoto={() => setPhoto(sel.id)}
            hasPhoto={!!d.people[sel.id]?.portrait}
            collapsedUp={collapsedUp.has(sel.id)}
            collapsedDown={collapsedDown.has(sel.id)}
          />
        )}
      </div>

      <div className="zoom-controls" data-nopan>
        <button onClick={() => pz.zoomBy(1.25)} title="Zoom in (+)">
          +
        </button>
        <button onClick={() => pz.zoomBy(0.8)} title="Zoom out (−)">
          −
        </button>
        <button onClick={() => pz.fitBounds(layout.bounds)} title="Survey the whole realm (0)">
          ⤢
        </button>
      </div>
      <Minimap layout={layout} colors={colors} people={d.people} container={container} listeners={camListeners.current} onJump={(x, y) => pz.flyTo(x, y, undefined, 350)} />
    </div>
  );
}

function QuickRing({
  x,
  y,
  id,
  quick,
  onPhoto,
  hasPhoto,
  collapsedUp,
  collapsedDown,
}: {
  onPhoto: () => void;
  hasPhoto: boolean;
  x: number;
  y: number;
  id: string;
  quick: (rel: RelKind, id: string) => (e: React.MouseEvent) => void;
  collapsedUp: boolean;
  collapsedDown: boolean;
}) {
  const L = x - CARD_W / 2;
  const T = y - CARD_H / 2;
  const btn = (rel: RelKind, label: string, bx: number, by: number, glyph: string) => (
    <button data-nopan className={`ring-btn ring-${rel}`} style={{ transform: `translate(${bx - 17}px, ${by - 17}px)` }} onClick={quick(rel, id)} title={`Add ${label}`} aria-label={`Add ${label}`}>
      <span className="ring-glyph">{glyph}</span>
      <span className="ring-label">{label}</span>
    </button>
  );
  return (
    <div className="quick-ring">
      {btn('father', 'Father', L + 46, T - 24, '♂')}
      {btn('mother', 'Mother', L + CARD_W - 46, T - 24, '♀')}
      {btn('sibling', 'Sibling', L - 22, T + 4, '↔')}
      {btn('spouse', 'Spouse', L + CARD_W + 17, T + 4, '⚭')}
      {btn('child', 'Child', x, T + CARD_H + 26, '✦')}
      <div className="ring-actions" style={{ transform: `translate(${L + CARD_W + 10}px, ${T + CARD_H + 6}px)` }}>
        <button data-nopan title={hasPhoto ? 'Change photo' : 'Add a photo'} onClick={onPhoto}>
          📷
        </button>
        <button data-nopan title="Open profile (Enter)" onClick={() => openDossier(id)}>
          ⓘ
        </button>
        <button data-nopan title="Seat on the throne — centre the tree here (F)" onClick={() => useUI.setState({ focusId: id })}>
          ♛
        </button>
        <button data-nopan title={collapsedUp ? 'Show ancestors' : 'Fold ancestors'} onClick={() => toggleSet('collapsedUp', id)}>
          {collapsedUp ? '⇡' : '⤒'}
        </button>
        <button data-nopan title={collapsedDown ? 'Show descendants' : 'Fold descendants'} onClick={() => toggleSet('collapsedDown', id)}>
          {collapsedDown ? '⇣' : '⤓'}
        </button>
      </div>
    </div>
  );
}
