/**
 * Family-graph layout.
 *
 * Real families are graphs, not trees. We group partners into "blocks"
 * (a couple, or a person with several spouses), assign each block a
 * generation by BFS from the home person, then lay out descendant subtrees
 * with contour-based tidy-tree packing. Blocks that hang off the main tree
 * (an in-law's parents, say) are laid out as their own subtrees and dropped
 * in as close as possible to where they connect, without overlapping.
 */
import type { ChildKind, Dynasty, UnionStatus } from '../model/types';
import { birthDate, getIndex } from '../model/graph';
import { sortKey } from '../model/dates';

export const CARD_W = 184;
export const CARD_H = 186;
export const PARTNER_GAP = 34;
export const SUBTREE_GAP = 40;
export const ROW_H = 290;

export type ViewMode = 'family' | 'ancestors' | 'descendants';

export interface LayoutOptions {
  rootId?: string;
  mode: ViewMode;
  collapsedUp: ReadonlySet<string>;
  collapsedDown: ReadonlySet<string>;
}

export interface NodePos {
  id: string;
  x: number;
  y: number;
  gen: number;
}

export interface UnionLine {
  id: string;
  status: UnionStatus;
  partners: { id: string; x: number; y: number }[];
  junction: { x: number; y: number };
  barY: number;
  children: { id: string; x: number; y: number; kind: ChildKind }[];
}

export interface Layout {
  nodes: Map<string, NodePos>;
  unions: UnionLine[];
  hiddenUp: Map<string, number>;
  hiddenDown: Map<string, number>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  rowY: (gen: number) => number;
}

interface Block {
  id: number;
  members: string[];
  /** x offset of each member from the block centre */
  offsets: Map<string, number>;
  width: number;
  gen: number;
  /** unions where a member is a partner */
  unions: string[];
}

type Contour = Map<number, [number, number]>;
interface Sub {
  x: Map<number, number>; // block id → centre x relative to subtree origin
  contour: Contour;
}

export function computeLayout(d: Dynasty, opts: LayoutOptions): Layout {
  const idx = getIndex(d);
  const people = d.people;
  const ids = Object.keys(people);
  const empty: Layout = {
    nodes: new Map(),
    unions: [],
    hiddenUp: new Map(),
    hiddenDown: new Map(),
    bounds: { minX: -200, minY: -100, maxX: 200, maxY: 100 },
    rowY: (g) => g * ROW_H,
  };
  if (!ids.length) return empty;
  const rootId = opts.rootId && people[opts.rootId] ? opts.rootId : ids[0];

  // ---- 1. Partner blocks (union-find over partners) -------------------------
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  for (const id of ids) parent.set(id, id);
  const unions = Object.values(d.unions);
  for (const u of unions) {
    const ps = u.partners.filter((p) => people[p]);
    for (let i = 1; i < ps.length; i++) parent.set(find(ps[i]), find(ps[0]));
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const r = find(id);
    const g = groups.get(r);
    if (g) g.push(id);
    else groups.set(r, [id]);
  }
  const blocks: Block[] = [];
  const blockOf = new Map<string, Block>();
  for (const members of groups.values()) {
    const ordered = orderMembers(members, d);
    const b: Block = { id: blocks.length, members: ordered, offsets: new Map(), width: 0, gen: 0, unions: [] };
    const width = ordered.length * CARD_W + (ordered.length - 1) * PARTNER_GAP;
    ordered.forEach((m, i) => b.offsets.set(m, -width / 2 + CARD_W / 2 + i * (CARD_W + PARTNER_GAP)));
    b.width = width;
    blocks.push(b);
    for (const m of ordered) blockOf.set(m, b);
  }
  // Partnerless unions (unknown parents) get a zero-width virtual block
  const unionBlock = new Map<string, Block>();
  for (const u of unions) {
    const ps = u.partners.filter((p) => people[p]);
    let b: Block | undefined = ps.length ? blockOf.get(ps[0]) : undefined;
    if (!b) {
      if (!u.children.some((c) => people[c.id])) continue;
      b = { id: blocks.length, members: [], offsets: new Map(), width: 0, gen: 0, unions: [] };
      blocks.push(b);
    }
    b.unions.push(u.id);
    unionBlock.set(u.id, b);
  }

  // ---- 2. Visibility & generations via BFS ---------------------------------
  const rootBlock = blockOf.get(rootId)!;
  const visible = new Set<number>([rootBlock.id]);
  const gen = new Map<number, number>([[rootBlock.id, 0]]);
  const hiddenUp = new Map<string, number>();
  const hiddenDown = new Map<string, number>();
  const ancestorSet = new Set<string>([rootId]);
  const queue: Block[] = [rootBlock];
  const childEdges = new Map<number, Set<number>>(); // visible down edges parent block → child blocks

  const addEdge = (from: Block, to: Block) => {
    let s = childEdges.get(from.id);
    if (!s) childEdges.set(from.id, (s = new Set()));
    s.add(to.id);
  };

  while (queue.length) {
    const b = queue.shift()!;
    const g = gen.get(b.id)!;
    // Upwards: unions in which a member is a child
    if (opts.mode !== 'descendants') {
      for (const m of b.members) {
        if (opts.mode === 'ancestors' && !ancestorSet.has(m)) continue;
        for (const uid of idx.birthUnions.get(m) ?? []) {
          const pb = unionBlock.get(uid);
          if (!pb) continue;
          if (opts.collapsedUp.has(m)) {
            hiddenUp.set(m, (hiddenUp.get(m) ?? 0) + Math.max(1, d.unions[uid].partners.length));
            continue;
          }
          if (opts.mode === 'ancestors') for (const p of d.unions[uid].partners) ancestorSet.add(p);
          if (!visible.has(pb.id)) {
            visible.add(pb.id);
            gen.set(pb.id, g - 1);
            queue.push(pb);
          }
          addEdge(pb, b);
        }
      }
    }
    // Downwards: unions where the block's members are partners
    if (opts.mode !== 'ancestors') {
      for (const uid of b.unions) {
        const u = d.unions[uid];
        if (u.partners.some((p) => opts.collapsedDown.has(p))) {
          const n = u.children.length;
          if (n) for (const p of u.partners) hiddenDown.set(p, (hiddenDown.get(p) ?? 0) + n);
          continue;
        }
        for (const c of u.children) {
          const cb = blockOf.get(c.id);
          if (!cb) continue;
          if (!visible.has(cb.id)) {
            visible.add(cb.id);
            gen.set(cb.id, g + 1);
            queue.push(cb);
          }
          addEdge(b, cb);
        }
      }
    }
  }
  for (const b of blocks) if (visible.has(b.id)) b.gen = gen.get(b.id)!;

  // Ordered visible child blocks of a block
  const childBlocksOf = (b: Block): Block[] => {
    const out: Block[] = [];
    const seen = new Set<number>();
    const edges = childEdges.get(b.id);
    if (!edges) return out;
    const us = b.unions
      .map((uid) => d.unions[uid])
      .sort((u1, u2) => partnerMid(b, u1.partners) - partnerMid(b, u2.partners));
    for (const u of us) {
      const kids = [...u.children].sort((x, y) => sortKey(birthDate(people[x.id])) - sortKey(birthDate(people[y.id])));
      for (const c of kids) {
        const cb = blockOf.get(c.id);
        if (!cb || seen.has(cb.id) || !edges.has(cb.id)) continue;
        seen.add(cb.id);
        out.push(cb);
      }
    }
    return out;
  };

  const parentEdges = new Map<number, number[]>();
  for (const [pid, kids] of childEdges)
    for (const k of kids) {
      const a = parentEdges.get(k);
      if (a) a.push(pid);
      else parentEdges.set(k, [pid]);
    }
  const parentBlocksOf = (b: Block): Block[] =>
    // Prefer the father's side as the "main" line
    (parentEdges.get(b.id) ?? []).map((i) => blocks[i]).sort((x, y) => sideRank(x) - sideRank(y));
  const sideRank = (b: Block) => (b.members.some((m) => people[m]?.sex === 'M') ? 0 : 1);

  // ---- 3. Tidy subtree layout ----------------------------------------------
  const claimed = new Set<number>();

  const layoutSubtree = (b: Block): Sub => {
    claimed.add(b.id);
    const kids = childBlocksOf(b).filter((k) => !claimed.has(k.id) && k.gen > b.gen);
    const subs: { blk: Block; sub: Sub }[] = [];
    for (const k of kids) if (!claimed.has(k.id)) subs.push({ blk: k, sub: layoutSubtree(k) });

    const x = new Map<number, number>();
    const contour: Contour = new Map();
    let childAnchors: number[] = [];
    if (subs.length) {
      const acc: Contour = new Map();
      const offs: number[] = [];
      subs.forEach(({ sub }, i) => {
        let shift = 0;
        if (i > 0) {
          let need = -Infinity;
          for (const [g, [l]] of sub.contour) {
            const a = acc.get(g);
            if (a) need = Math.max(need, a[1] - l + SUBTREE_GAP);
          }
          if (need === -Infinity) {
            let maxR = -Infinity;
            for (const [, [, r]] of acc) maxR = Math.max(maxR, r);
            let minL = Infinity;
            for (const [, [l]] of sub.contour) minL = Math.min(minL, l);
            need = maxR - minL + SUBTREE_GAP;
          }
          shift = need;
        }
        offs.push(shift);
        for (const [g, [l, r]] of sub.contour) {
          const a = acc.get(g);
          acc.set(g, a ? [Math.min(a[0], l + shift), Math.max(a[1], r + shift)] : [l + shift, r + shift]);
        }
      });
      // Child anchors: the child persons (not block centres)
      subs.forEach(({ blk, sub }, i) => {
        const cx = (sub.x.get(blk.id) ?? 0) + offs[i];
        const childIds = blk.members.filter((m) => b.unions.some((uid) => d.unions[uid].children.some((c) => c.id === m)));
        if (childIds.length) for (const cid of childIds) childAnchors.push(cx + (blk.offsets.get(cid) ?? 0));
        else childAnchors.push(cx);
      });
      const lo = Math.min(...childAnchors);
      const hi = Math.max(...childAnchors);
      const childCentre = (lo + hi) / 2;
      // Put the junction of the (single) union with children above the children's centre
      const unionsWithKids = b.unions.filter((uid) => d.unions[uid].children.some((c) => childEdges.get(b.id)?.has(blockOf.get(c.id)?.id ?? -1)));
      const jx = unionsWithKids.length === 1 ? partnerMid(b, d.unions[unionsWithKids[0]].partners) : 0;
      const parentX = childCentre - jx;
      // Re-origin on the parent
      subs.forEach(({ sub }, i) => {
        for (const [bid, bx] of sub.x) x.set(bid, bx + offs[i] - parentX);
      });
      for (const [g, [l, r]] of acc) contour.set(g, [l - parentX, r - parentX]);
    }
    x.set(b.id, 0);
    const own: [number, number] = [-b.width / 2, b.width / 2];
    const ex = contour.get(b.gen);
    contour.set(b.gen, ex ? [Math.min(ex[0], own[0]), Math.max(ex[1], own[1])] : own);
    childAnchors = [];
    return { x, contour };
  };

  // ---- 4. Global placement with collision avoidance ------------------------
  const occupancy = new Map<number, [number, number][]>();
  const pos = new Map<number, number>();

  /**
   * Keep-out zone for an attached parent block: it must not sit directly above
   * other families' children, or its line down would run along theirs.
   */
  interface Avoid {
    l: number;
    r: number;
    xs: number[];
  }
  const DROP_CLEAR = 30;

  const collides = (sub: Sub, s: number, avoid?: Avoid) => {
    for (const [g, [l, r]] of sub.contour) {
      const row = occupancy.get(g);
      if (!row) continue;
      for (const [a, b] of row) if (l + s < b + SUBTREE_GAP && r + s > a - SUBTREE_GAP) return true;
    }
    if (avoid) for (const x of avoid.xs) if (x > avoid.l + s - DROP_CLEAR && x < avoid.r + s + DROP_CLEAR) return true;
    return false;
  };

  const place = (sub: Sub, desired: number, avoid?: Avoid) => {
    let s = desired;
    if (collides(sub, s, avoid)) {
      const cands: number[] = [];
      for (const [g, [l, r]] of sub.contour) {
        for (const [a, b] of occupancy.get(g) ?? []) {
          cands.push(b + SUBTREE_GAP - l, a - SUBTREE_GAP - r);
        }
      }
      if (avoid) for (const x of avoid.xs) cands.push(x + DROP_CLEAR - avoid.l + 1, x - DROP_CLEAR - avoid.r - 1);
      // Combinations: clear a child drop, then clear the row it lands in
      const base = [...cands];
      for (const c of base)
        for (const [g, [l, r]] of sub.contour)
          for (const [a, b] of occupancy.get(g) ?? []) {
            if (l + c < b + SUBTREE_GAP && r + c > a - SUBTREE_GAP) cands.push(b + SUBTREE_GAP - l, a - SUBTREE_GAP - r);
          }
      cands.sort((p, q) => Math.abs(p - desired) - Math.abs(q - desired));
      s = cands.find((c) => !collides(sub, c, avoid)) ?? cands.find((c) => !collides(sub, c)) ?? desired;
    }
    for (const [bid, bx] of sub.x) pos.set(bid, bx + s);
    for (const [g, [l, r]] of sub.contour) {
      const row = occupancy.get(g) ?? [];
      row.push([l + s, r + s]);
      occupancy.set(g, row);
    }
  };

  const climb = (start: Block): Block => {
    let t = start;
    const seen = new Set<number>([t.id]);
    for (;;) {
      const up = parentBlocksOf(t).find((p) => !claimed.has(p.id) && !seen.has(p.id) && p.gen < t.gen);
      if (!up) return t;
      seen.add(up.id);
      t = up;
    }
  };

  // Main tree: from the root's topmost (paternal-first) ancestor
  place(layoutSubtree(climb(rootBlock)), 0);

  // Everything else, attached next to the block it connects to
  let frontier = [...pos.keys()];
  for (let guard = 0; guard < blocks.length * 2; guard++) {
    let next: { u: Block; anchor: Block } | undefined;
    const keep: number[] = [];
    for (let i = 0; i < frontier.length; i++) {
      const b = blocks[frontier[i]];
      if (next) {
        keep.push(b.id);
        continue;
      }
      const up = parentBlocksOf(b).find((p) => !claimed.has(p.id));
      const down = up ? undefined : childBlocksOf(b).find((c) => !claimed.has(c.id));
      if (up || down) {
        next = { u: (up ?? down)!, anchor: b };
        keep.push(b.id);
      }
    }
    frontier = keep;
    if (!next) break;
    const before = new Set(pos.keys());
    const top = climb(next.u);
    const sub = layoutSubtree(top);
    // Align the connecting block over/under the person it connects to
    let target = pos.get(next.anchor.id)!;
    const isParent = next.u.gen < next.anchor.gen;
    if (isParent) {
      const childInAnchor = next.anchor.members.find((m) => next!.u.unions.some((uid) => d.unions[uid].children.some((c) => c.id === m)));
      if (childInAnchor) target += next.anchor.offsets.get(childInAnchor) ?? 0;
    }
    const rel = sub.x.get(next.u.id) ?? 0;
    let avoid: Avoid | undefined;
    if (isParent) {
      // x of already-placed children (in the row below) who belong to other families
      const own = new Set(next.u.unions.flatMap((uid) => d.unions[uid].children.map((c) => c.id)));
      const xs: number[] = [];
      for (const [bid, cx] of pos) {
        const b = blocks[bid];
        if (b.gen !== next.u.gen + 1) continue;
        for (const m of b.members) {
          if (own.has(m)) continue;
          if (parentBlocksOf(b).some((pb) => pos.has(pb.id) && pb.unions.some((uid) => d.unions[uid].children.some((c) => c.id === m))))
            xs.push(cx + (b.offsets.get(m) ?? 0));
        }
      }
      avoid = { l: rel - next.u.width / 2, r: rel + next.u.width / 2, xs };
    }
    place(sub, target - rel, avoid);
    for (const k of pos.keys()) if (!before.has(k)) frontier.push(k);
  }

  // ---- 5. Emit nodes & union lines -----------------------------------------
  const rowY = (g: number) => g * ROW_H;
  const nodes = new Map<string, NodePos>();
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const b of blocks) {
    const cx = pos.get(b.id);
    if (cx === undefined) continue;
    for (const m of b.members) {
      const x = cx + (b.offsets.get(m) ?? 0);
      const y = rowY(b.gen);
      nodes.set(m, { id: m, x, y, gen: b.gen });
      minX = Math.min(minX, x - CARD_W / 2);
      maxX = Math.max(maxX, x + CARD_W / 2);
      minY = Math.min(minY, y - CARD_H / 2);
      maxY = Math.max(maxY, y + CARD_H / 2);
    }
  }

  const lines: UnionLine[] = [];
  for (const b of blocks) {
    const cx = pos.get(b.id);
    if (cx === undefined) continue;
    b.unions.forEach((uid) => {
      const u = d.unions[uid];
      const partners = u.partners.filter((p) => nodes.has(p)).map((p) => ({ id: p, x: nodes.get(p)!.x, y: nodes.get(p)!.y }));
      const children = u.children
        .filter((c) => nodes.has(c.id))
        .map((c) => ({ id: c.id, kind: c.kind, x: nodes.get(c.id)!.x, y: nodes.get(c.id)!.y }));
      if (!partners.length && children.length < 2) return;
      if (partners.length < 2 && !children.length) return;
      const y = rowY(b.gen);
      const junction =
        partners.length === 2
          ? { x: (partners[0].x + partners[1].x) / 2, y }
          : partners.length === 1
            ? { x: partners[0].x, y: y + CARD_H / 2 }
            : { x: cx, y: y + CARD_H / 2 };
      lines.push({ id: uid, status: u.status, partners, junction, barY: 0, children, gen: b.gen } as UnionLine & { gen: number });
    });
  }
  assignBarLanes(lines as (UnionLine & { gen: number })[], rowY);

  if (!nodes.size) return empty;
  return { nodes, unions: lines, hiddenUp, hiddenDown, bounds: { minX, minY, maxX, maxY }, rowY };
}

export const LANE_GAP = 14;

/**
 * Give each family's horizontal sibling bar its own "lane" in the gap between
 * two rows whenever bars would otherwise share the same line. Without this an
 * in-law's parents, placed beside the main couple, draw their bar on top of
 * the main family's bar and the child looks like it belongs to the wrong couple.
 */
export function assignBarLanes(lines: (UnionLine & { gen: number })[], rowY: (g: number) => number) {
  const byGen = new Map<number, (UnionLine & { gen: number })[]>();
  for (const l of lines) {
    if (!l.children.length) {
      l.barY = rowY(l.gen) + CARD_H / 2 + (ROW_H - CARD_H) / 2;
      continue;
    }
    const a = byGen.get(l.gen);
    if (a) a.push(l);
    else byGen.set(l.gen, [l]);
  }
  for (const [gen, ls] of byGen) {
    const span = (l: UnionLine) => {
      const xs = [l.junction.x, ...l.children.map((c) => c.x)];
      return [Math.min(...xs), Math.max(...xs)] as const;
    };
    const items = ls.map((l) => ({ l, s: span(l) })).sort((a, b) => a.s[0] - b.s[0] || a.s[1] - b.s[1]);
    const laneEnds: number[] = [];
    const lane = new Map<UnionLine, number>();
    for (const it of items) {
      let k = laneEnds.findIndex((end) => end + 24 < it.s[0]);
      if (k < 0) {
        k = laneEnds.length;
        laneEnds.push(it.s[1]);
      } else laneEnds[k] = it.s[1];
      lane.set(it.l, k);
    }
    const n = laneEnds.length;
    const maxSpread = ROW_H - CARD_H - 30;
    const step = n > 1 ? Math.min(LANE_GAP, maxSpread / (n - 1)) : 0;
    const mid = rowY(gen) + CARD_H / 2 + (ROW_H - CARD_H) / 2;
    for (const it of items) it.l.barY = mid + (lane.get(it.l)! - (n - 1) / 2) * step;
  }
}

function partnerMid(b: Block, partners: string[]): number {
  const xs = partners.map((p) => b.offsets.get(p)).filter((v): v is number => v !== undefined);
  if (!xs.length) return 0;
  return xs.reduce((a, c) => a + c, 0) / xs.length;
}

/** Order block members so partners sit side by side; husband left of wife for a couple. */
function orderMembers(members: string[], d: Dynasty): string[] {
  if (members.length === 1) return members;
  const set = new Set(members);
  const adj = new Map<string, string[]>();
  for (const m of members) adj.set(m, []);
  for (const u of Object.values(d.unions)) {
    const ps = u.partners.filter((p) => set.has(p));
    if (ps.length === 2) {
      adj.get(ps[0])!.push(ps[1]);
      adj.get(ps[1])!.push(ps[0]);
    }
  }
  if (members.length === 2) {
    const [a, b] = members;
    return d.people[a]?.sex === 'F' && d.people[b]?.sex === 'M' ? [b, a] : [a, b];
  }
  const deg = (m: string) => new Set(adj.get(m)).size;
  const maxDeg = Math.max(...members.map(deg));
  const out: string[] = [];
  const seen = new Set<string>();
  if (maxDeg <= 2) {
    const start = members.find((m) => deg(m) === 1) ?? members[0];
    let cur: string | undefined = start;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      out.push(cur);
      cur = [...new Set(adj.get(cur))].find((n) => !seen.has(n));
    }
  } else {
    const center = members.reduce((a, b) => (deg(b) > deg(a) ? b : a));
    const ns = [...new Set(adj.get(center))];
    out.push(ns[0], center, ...ns.slice(1));
    ns.forEach((n) => seen.add(n));
    seen.add(center);
  }
  for (const m of members) if (!seen.has(m)) out.push(m);
  return out;
}
