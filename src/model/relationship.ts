import type { Dynasty, Sex } from './types';
import { birthUnionsOf, fullName, parentsOf, spousesOf, childrenOf } from './graph';

/** BFS up the tree: ancestor id → generations above. */
export function ancestorDepths(d: Dynasty, id: string): Map<string, number> {
  const out = new Map<string, number>([[id, 0]]);
  let frontier = [id];
  let depth = 0;
  while (frontier.length && depth < 60) {
    depth++;
    const next: string[] = [];
    for (const x of frontier)
      for (const p of parentsOf(d, x)) {
        if (p.kind === 'step' || p.kind === 'foster') continue;
        if (!out.has(p.id)) {
          out.set(p.id, depth);
          next.push(p.id);
        }
      }
    frontier = next;
  }
  return out;
}

const g = (sex: Sex | undefined, m: string, f: string, n: string) => (sex === 'M' ? m : sex === 'F' ? f : n);

function greats(n: number): string {
  if (n <= 0) return '';
  if (n === 1) return 'great-';
  if (n === 2) return 'great-great-';
  return `${n}× great-`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function removed(n: number): string {
  if (n === 0) return '';
  if (n === 1) return ' once removed';
  if (n === 2) return ' twice removed';
  if (n === 3) return ' thrice removed';
  return ` ${n} times removed`;
}

/** Term for B relative to A given generations from A (da) and B (db) to the common ancestor. */
export function bloodTerm(da: number, db: number, sexB: Sex | undefined, half = false): string {
  const h = half ? 'half-' : '';
  if (da === 0 && db === 0) return 'self';
  if (da === 0) {
    if (db === 1) return g(sexB, 'son', 'daughter', 'child');
    if (db === 2) return g(sexB, 'grandson', 'granddaughter', 'grandchild');
    return greats(db - 2) + g(sexB, 'grandson', 'granddaughter', 'grandchild');
  }
  if (db === 0) {
    if (da === 1) return g(sexB, 'father', 'mother', 'parent');
    if (da === 2) return g(sexB, 'grandfather', 'grandmother', 'grandparent');
    return greats(da - 2) + g(sexB, 'grandfather', 'grandmother', 'grandparent');
  }
  if (da === 1 && db === 1) return h + g(sexB, 'brother', 'sister', 'sibling');
  if (da === 1) return h + greats(db - 2) + g(sexB, 'nephew', 'niece', 'nibling');
  if (db === 1) return h + greats(da - 2) + g(sexB, 'uncle', 'aunt', 'parent’s sibling');
  const degree = Math.min(da, db) - 1;
  return `${h}${ordinal(degree)} cousin${removed(Math.abs(da - db))}`;
}

export interface BloodResult {
  term: string;
  da: number;
  db: number;
  common: string[];
}

export function bloodRelation(d: Dynasty, a: string, b: string): BloodResult | undefined {
  const A = ancestorDepths(d, a);
  const B = ancestorDepths(d, b);
  let best = Infinity;
  let pairs: { id: string; da: number; db: number }[] = [];
  for (const [id, da] of A) {
    const db = B.get(id);
    if (db === undefined) continue;
    const s = da + db;
    if (s < best) {
      best = s;
      pairs = [{ id, da, db }];
    } else if (s === best) pairs.push({ id, da, db });
  }
  if (!pairs.length) return undefined;
  const { da, db } = pairs[0];
  // Half relationships: only one common ancestor at the closest level (when two are expected)
  const sameLevel = pairs.filter((p) => p.da === da && p.db === db);
  const half = da > 0 && db > 0 && sameLevel.length === 1 && expectsCouple(d, sameLevel[0].id, a, da);
  return { term: bloodTerm(da, db, d.people[b]?.sex, half), da, db, common: sameLevel.map((p) => p.id) };
}

/** Did the common ancestor have a partner in the union on the line down to `a`? If so a single shared ancestor means "half". */
function expectsCouple(d: Dynasty, ancestor: string, a: string, da: number): boolean {
  // walk from a up da-1 generations collecting candidate children of the ancestor
  let frontier = [a];
  for (let i = 0; i < da - 1; i++) frontier = frontier.flatMap((x) => parentsOf(d, x).map((p) => p.id));
  for (const x of frontier)
    for (const u of birthUnionsOf(d, x)) if (u.partners.includes(ancestor) && u.partners.length === 2) return true;
  return false;
}

export interface PathStep {
  id: string;
  /** How this person relates to the previous step: "father", "wife"… */
  label?: string;
}

/** Shortest path through parent / child / spouse links. */
export function findPath(d: Dynasty, a: string, b: string): PathStep[] | undefined {
  if (a === b) return [{ id: a }];
  const prev = new Map<string, { from: string; label: string }>();
  const seen = new Set([a]);
  let q = [a];
  while (q.length) {
    const next: string[] = [];
    for (const x of q) {
      const edges: [string, string][] = [
        ...parentsOf(d, x).map((p) => [p.id, labelFor(d, p.id, 'parent')] as [string, string]),
        ...childrenOf(d, x).map((c) => [c.id, labelFor(d, c.id, 'child')] as [string, string]),
        ...spousesOf(d, x).map((s) => [s.id, labelFor(d, s.id, 'spouse')] as [string, string]),
      ];
      for (const [y, label] of edges) {
        if (seen.has(y)) continue;
        seen.add(y);
        prev.set(y, { from: x, label });
        if (y === b) {
          const path: PathStep[] = [];
          let cur: string | undefined = b;
          while (cur && cur !== a) {
            const pr: { from: string; label: string } = prev.get(cur)!;
            path.unshift({ id: cur, label: pr.label });
            cur = pr.from;
          }
          path.unshift({ id: a });
          return path;
        }
        next.push(y);
      }
    }
    q = next;
  }
  return undefined;
}

function labelFor(d: Dynasty, id: string, kind: 'parent' | 'child' | 'spouse') {
  const s = d.people[id]?.sex;
  if (kind === 'parent') return g(s, 'father', 'mother', 'parent');
  if (kind === 'child') return g(s, 'son', 'daughter', 'child');
  return g(s, 'husband', 'wife', 'spouse');
}

export interface Relationship {
  term: string;
  sentence: string;
  path?: PathStep[];
}

/** "B is A's ___" with in-law & step handling, plus the connecting path. */
export function describeRelationship(d: Dynasty, a: string, b: string): Relationship {
  const A = d.people[a];
  const B = d.people[b];
  const nameA = fullName(A);
  const nameB = fullName(B);
  if (a === b) return { term: 'self', sentence: `${nameA} is, of course, ${nameA}.`, path: [{ id: a }] };
  const path = findPath(d, a, b);
  const sexB = B?.sex;
  let term: string | undefined;

  const blood = bloodRelation(d, a, b);
  if (blood) term = blood.term;

  if (!term && spousesOf(d, a).some((s) => s.id === b)) term = g(sexB, 'husband', 'wife', 'spouse');

  if (!term) {
    // B is the spouse of A's blood relative
    for (const s of spousesOf(d, b)) {
      const r = bloodRelation(d, a, s.id);
      if (!r) continue;
      if (r.da === 0 && r.db === 1) term = g(sexB, 'son-in-law', 'daughter-in-law', 'child-in-law');
      else if (r.da === 1 && r.db === 0) term = g(sexB, 'stepfather', 'stepmother', 'step-parent');
      else if (r.da === 1 && r.db === 1) term = g(sexB, 'brother-in-law', 'sister-in-law', 'sibling-in-law');
      else term = `spouse of ${nameA}'s ${r.term}`;
      if (term) break;
    }
  }
  if (!term) {
    // B is a blood relative of A's spouse
    for (const s of spousesOf(d, a)) {
      const r = bloodRelation(d, s.id, b);
      if (!r) continue;
      if (r.da === 1 && r.db === 0) term = g(sexB, 'father-in-law', 'mother-in-law', 'parent-in-law');
      else if (r.da === 1 && r.db === 1) term = g(sexB, 'brother-in-law', 'sister-in-law', 'sibling-in-law');
      else if (r.da === 0 && r.db === 1) term = g(sexB, 'stepson', 'stepdaughter', 'stepchild');
      else term = `${r.term} of ${nameA}'s ${g(s.id ? d.people[s.id]?.sex : 'U', 'husband', 'wife', 'spouse')}`;
      if (term) break;
    }
  }
  if (!term && path) {
    return {
      term: 'kin by marriage',
      sentence: `${nameB} is connected to ${nameA} by marriage, ${path.length - 1} links apart.`,
      path,
    };
  }
  if (!term) return { term: 'unrelated', sentence: `No recorded connection between ${nameA} and ${nameB}.` };
  return { term, sentence: `${nameB} is ${nameA}'s ${term}.`, path };
}
