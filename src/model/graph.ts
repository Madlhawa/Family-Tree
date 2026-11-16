import { isDraft } from 'immer';
import type { ChildKind, Dynasty, Person, Union } from './types';
import { CURRENT_YEAR, parseDate, sortKey, yearOf } from './dates';
import { armsColor, proceduralArms, type Arms } from './heraldry';

export interface Index {
  /** unions in which a person is a child */
  birthUnions: Map<string, string[]>;
  /** unions in which a person is a partner */
  partnerUnions: Map<string, string[]>;
}

const indexCache = new WeakMap<object, Index>();

export function getIndex(d: Dynasty): Index {
  const draft = isDraft(d.unions);
  const hit = draft ? undefined : indexCache.get(d.unions);
  if (hit) return hit;
  const birthUnions = new Map<string, string[]>();
  const partnerUnions = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const a = m.get(k);
    if (a) a.push(v);
    else m.set(k, [v]);
  };
  for (const u of Object.values(d.unions)) {
    for (const p of u.partners) push(partnerUnions, p, u.id);
    for (const c of u.children) push(birthUnions, c.id, u.id);
  }
  const idx = { birthUnions, partnerUnions };
  if (!draft) indexCache.set(d.unions, idx);
  return idx;
}

export const unionsOf = (d: Dynasty, pid: string): Union[] =>
  (getIndex(d).partnerUnions.get(pid) ?? []).map((id) => d.unions[id]).filter(Boolean);

export const birthUnionsOf = (d: Dynasty, pid: string): Union[] =>
  (getIndex(d).birthUnions.get(pid) ?? []).map((id) => d.unions[id]).filter(Boolean);

export interface Rel {
  id: string;
  kind?: ChildKind;
  unionId: string;
}

export function parentsOf(d: Dynasty, pid: string): Rel[] {
  const out: Rel[] = [];
  for (const u of birthUnionsOf(d, pid)) {
    const kind = u.children.find((c) => c.id === pid)?.kind ?? 'birth';
    for (const p of u.partners) out.push({ id: p, kind, unionId: u.id });
  }
  return out;
}

export function spousesOf(d: Dynasty, pid: string): Rel[] {
  const out: Rel[] = [];
  for (const u of unionsOf(d, pid)) for (const p of u.partners) if (p !== pid) out.push({ id: p, unionId: u.id });
  return out;
}

export function childrenOf(d: Dynasty, pid: string): Rel[] {
  const out: Rel[] = [];
  const seen = new Set<string>();
  for (const u of unionsOf(d, pid))
    for (const c of u.children)
      if (!seen.has(c.id)) {
        seen.add(c.id);
        out.push({ id: c.id, kind: c.kind, unionId: u.id });
      }
  return out.sort((a, b) => sortKey(birthDate(d.people[a.id])) - sortKey(birthDate(d.people[b.id])));
}

export function siblingsOf(d: Dynasty, pid: string): { id: string; half: boolean }[] {
  const mine = birthUnionsOf(d, pid);
  const full = new Set<string>();
  for (const u of mine) for (const c of u.children) if (c.id !== pid) full.add(c.id);
  const half = new Set<string>();
  for (const u of mine)
    for (const parent of u.partners)
      for (const u2 of unionsOf(d, parent))
        if (!mine.includes(u2)) for (const c of u2.children) if (c.id !== pid && !full.has(c.id)) half.add(c.id);
  const all = [...[...full].map((id) => ({ id, half: false })), ...[...half].map((id) => ({ id, half: true }))];
  return all
    .filter((s) => d.people[s.id])
    .sort((a, b) => sortKey(birthDate(d.people[a.id])) - sortKey(birthDate(d.people[b.id])));
}

export function fatherOf(d: Dynasty, pid: string): string | undefined {
  const ps = parentsOf(d, pid).filter((r) => r.kind === 'birth' || r.kind === 'adopted');
  return ps.find((r) => d.people[r.id]?.sex === 'M')?.id;
}

export function motherOf(d: Dynasty, pid: string): string | undefined {
  const ps = parentsOf(d, pid).filter((r) => r.kind === 'birth' || r.kind === 'adopted');
  return ps.find((r) => d.people[r.id]?.sex === 'F')?.id;
}

// --- Person helpers -----------------------------------------------------------

export const eventOf = (p: Person | undefined, type: string) => p?.events.find((e) => e.type === type);
export const birthDate = (p: Person | undefined) => eventOf(p, 'birth')?.date ?? eventOf(p, 'baptism')?.date;
export const deathDate = (p: Person | undefined) => eventOf(p, 'death')?.date ?? eventOf(p, 'burial')?.date;
export const birthYear = (p: Person | undefined) => yearOf(birthDate(p));
export const deathYear = (p: Person | undefined) => yearOf(deathDate(p));

export function isLiving(p: Person): boolean {
  if (p.living === 'living') return true;
  if (p.living === 'deceased') return false;
  if (p.events.some((e) => e.type === 'death' || e.type === 'burial')) return false;
  const by = birthYear(p);
  if (by === undefined) return !p.placeholder && false;
  return CURRENT_YEAR - by < 100;
}

export function fullName(p: Person | undefined): string {
  if (!p) return 'Unknown';
  const n = [p.given, p.surname].filter(Boolean).join(' ').trim();
  return n || (p.placeholder ? 'Unknown' : 'Unnamed');
}

export function styledName(p: Person): string {
  return [p.title, fullName(p)].filter(Boolean).join(' ');
}

export function lifespan(p: Person): string {
  const b = parseDate(birthDate(p)).display;
  const dd = parseDate(deathDate(p)).display;
  if (!b && !dd) return isLiving(p) ? '' : '';
  if (!dd) return isLiving(p) ? `b. ${b}` : `${b} – ?`;
  return `${b || '?'} – ${dd}`;
}

/** Years only, for compact cards: "c. 1795 – 1860". */
export function lifespanShort(p: Person): string {
  const short = (raw?: string) => {
    const d = parseDate(raw);
    if (d.year === undefined) return d.display;
    if (d.qual === 'about') return `c. ${d.year}`;
    if (d.qual === 'before') return `bef. ${d.year}`;
    if (d.qual === 'after') return `aft. ${d.year}`;
    if (d.qual === 'between') return `${d.year}–${d.year2}`;
    return String(d.year);
  };
  const b = short(birthDate(p));
  const dd = short(deathDate(p));
  if (!b && !dd) return '';
  if (!dd) return isLiving(p) ? `b. ${b}` : `${b} – ?`;
  return `${b || '?'} – ${dd}`;
}

export function initials(p: Person | undefined): string {
  if (!p) return '?';
  return ((p.given[0] ?? '') + (p.surname[0] ?? '')).toUpperCase() || '?';
}

export const houseOf = (p: Person | undefined): string => (p?.birthSurname || p?.surname || '').trim();

export function houseArms(d: Dynasty, surname: string): Arms {
  return d.houses[surname]?.arms ?? proceduralArms(surname || 'unknown');
}

export function houseColor(d: Dynasty, surname: string): string {
  return armsColor(houseArms(d, surname));
}

/** Age in years at a given year, if computable. */
export function ageAt(p: Person, year: number): number | undefined {
  const by = birthYear(p);
  return by === undefined ? undefined : year - by;
}

/** Is the person alive in the given year? undefined = unknown. */
export function aliveIn(p: Person, year: number): boolean | undefined {
  const by = birthYear(p);
  if (by === undefined) return undefined;
  if (year < by) return false;
  const dy = deathYear(p);
  if (dy !== undefined) return year <= dy;
  if (isLiving(p)) return true;
  return year <= by + 70;
}
