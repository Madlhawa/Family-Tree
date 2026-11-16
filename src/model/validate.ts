import type { Dynasty } from './types';
import { birthYear, deathYear, fullName, isLiving, parentsOf, eventOf } from './graph';
import { CURRENT_YEAR, parseDate } from './dates';

export interface Warning {
  personId: string;
  severity: 'error' | 'warn';
  text: string;
}

const warnCache = new WeakMap<object, Map<string, Warning[]>>();

/** The Herald's Warnings: impossible or improbable facts, computed for the whole dynasty. */
export function allWarnings(d: Dynasty): Map<string, Warning[]> {
  const key = d.people; // people changes on every edit of people; unions handled below
  const cached = warnCache.get(key);
  if (cached && (cached as any).__unions === d.unions) return cached;
  const out = new Map<string, Warning[]>();
  const add = (w: Warning) => {
    const a = out.get(w.personId);
    if (a) a.push(w);
    else out.set(w.personId, [w]);
  };

  for (const p of Object.values(d.people)) {
    const by = birthYear(p);
    const dy = deathYear(p);
    const name = fullName(p);
    for (const e of p.events) {
      if (e.date && !parseDate(e.date).valid) add({ personId: p.id, severity: 'warn', text: `Unreadable date “${e.date}” on ${e.type}.` });
    }
    if (by !== undefined && dy !== undefined && dy < by) add({ personId: p.id, severity: 'error', text: `Died (${dy}) before being born (${by}).` });
    if (by !== undefined && dy !== undefined && dy - by > 115) add({ personId: p.id, severity: 'warn', text: `Lived ${dy - by} years — remarkably long.` });
    if (by !== undefined && by > CURRENT_YEAR) add({ personId: p.id, severity: 'error', text: `Born in the future (${by}).` });
    if (p.living === 'living' && by !== undefined && CURRENT_YEAR - by > 110) add({ personId: p.id, severity: 'warn', text: `Marked living but would be ${CURRENT_YEAR - by}.` });
    const births = p.events.filter((e) => e.type === 'birth');
    if (births.length > 1) add({ personId: p.id, severity: 'warn', text: `Disputed birth: ${births.length} conflicting records.` });
    const deaths = p.events.filter((e) => e.type === 'death');
    if (deaths.length > 1) add({ personId: p.id, severity: 'warn', text: `Disputed death: ${deaths.length} conflicting records.` });

    for (const par of parentsOf(d, p.id)) {
      if (par.kind !== 'birth') continue;
      const pp = d.people[par.id];
      if (!pp || by === undefined) continue;
      const pby = birthYear(pp);
      const pdy = deathYear(pp);
      if (pby !== undefined) {
        const age = by - pby;
        if (age < 12) add({ personId: p.id, severity: age < 0 ? 'error' : 'warn', text: `${fullName(pp)} would have been ${age} at ${name}'s birth.` });
        if (pp.sex === 'F' && age > 55) add({ personId: p.id, severity: 'warn', text: `${fullName(pp)} would have been ${age} at ${name}'s birth.` });
        if (pp.sex === 'M' && age > 80) add({ personId: p.id, severity: 'warn', text: `${fullName(pp)} would have been ${age} at ${name}'s birth.` });
      }
      if (pdy !== undefined) {
        const gap = by - pdy;
        if (pp.sex === 'F' && gap > 0) add({ personId: p.id, severity: 'error', text: `Born ${gap} year(s) after mother ${fullName(pp)} died.` });
        if (pp.sex !== 'F' && gap > 1) add({ personId: p.id, severity: 'error', text: `Born ${gap} years after father ${fullName(pp)} died.` });
      }
    }
  }

  // Cycles: a person who is their own ancestor
  const state = new Map<string, 0 | 1 | 2>();
  const cyc = new Set<string>();
  const visit = (id: string, stack: string[]) => {
    const s = state.get(id);
    if (s === 2) return;
    if (s === 1) {
      const i = stack.indexOf(id);
      stack.slice(i).forEach((x) => cyc.add(x));
      return;
    }
    state.set(id, 1);
    stack.push(id);
    for (const par of parentsOf(d, id)) visit(par.id, stack);
    stack.pop();
    state.set(id, 2);
  };
  for (const id of Object.keys(d.people)) visit(id, []);
  for (const id of cyc) add({ personId: id, severity: 'error', text: 'Appears among their own ancestors — a loop in the lineage.' });

  (out as any).__unions = d.unions;
  warnCache.set(key, out);
  return out;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');

/** Pairs that look like the same person recorded twice. */
export function findDuplicates(d: Dynasty): [string, string][] {
  const groups = new Map<string, string[]>();
  for (const p of Object.values(d.people)) {
    if (p.placeholder) continue;
    const k = norm(p.given.split(' ')[0] ?? '') + '|' + norm(p.birthSurname || p.surname);
    if (k === '|') continue;
    const a = groups.get(k);
    if (a) a.push(p.id);
    else groups.set(k, [p.id]);
  }
  const out: [string, string][] = [];
  for (const ids of groups.values()) {
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = d.people[ids[i]];
        const b = d.people[ids[j]];
        const ya = birthYear(a);
        const yb = birthYear(b);
        if (ya !== undefined && yb !== undefined && Math.abs(ya - yb) > 2) continue;
        if (a.sex !== 'U' && b.sex !== 'U' && a.sex !== b.sex) continue;
        out.push([a.id, b.id]);
      }
  }
  return out;
}

export function livingCount(d: Dynasty) {
  return Object.values(d.people).filter(isLiving).length;
}

export { eventOf };
