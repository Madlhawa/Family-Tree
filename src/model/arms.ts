import type { Dynasty } from './types';
import { birthDate, childrenOf, fatherOf, fullName, houseArms, houseOf } from './graph';
import { sortKey } from './dates';
import { CADENCY, CADENCY_ORDINAL, type Arms } from './heraldry';

export interface ResolvedArms {
  arms: Arms;
  source: 'own' | 'inherited' | 'house';
  /** The person whose arms are borne (for inherited) */
  fromId?: string;
  /** 1-based son rank → cadency mark */
  cadency?: number;
  shape: 'shield' | 'lozenge';
  explanation: string;
}

function sonRank(d: Dynasty, fatherId: string, pid: string): number | undefined {
  const sons = childrenOf(d, fatherId)
    .filter((c) => (c.kind === 'birth' || c.kind === 'adopted') && d.people[c.id]?.sex === 'M')
    .map((c) => c.id)
    .sort((a, b) => sortKey(birthDate(d.people[a])) - sortKey(birthDate(d.people[b])));
  const i = sons.indexOf(pid);
  return i >= 0 ? i + 1 : undefined;
}

function baseArms(d: Dynasty, pid: string, depth = 0): { arms: Arms; source: ResolvedArms['source']; fromId?: string } {
  const p = d.people[pid];
  if (p?.arms) return { arms: p.arms, source: 'own', fromId: pid };
  const f = depth < 40 ? fatherOf(d, pid) : undefined;
  if (f) {
    const fa = baseArms(d, f, depth + 1);
    if (fa.source !== 'house' || houseOf(d.people[f]) === houseOf(p))
      return { arms: fa.arms, source: fa.source === 'house' ? 'house' : 'inherited', fromId: fa.fromId };
  }
  return { arms: houseArms(d, houseOf(p)), source: 'house' };
}

/**
 * Resolve the arms a person bears. Own arms win; otherwise sons inherit their
 * father's arms differenced by a cadency mark, daughters bear them on a lozenge,
 * and anyone else falls back to their House's arms.
 */
export function resolveArms(d: Dynasty, pid: string): ResolvedArms {
  const p = d.people[pid];
  const b = baseArms(d, pid);
  const female = p?.sex === 'F';
  const pref = b.arms.shape ?? 'auto';
  const shape: 'shield' | 'lozenge' = pref === 'auto' ? (female && b.source !== 'own' ? 'lozenge' : 'shield') : pref;
  if (b.source === 'own') return { ...b, shape, explanation: 'Bears personal arms.' };
  if (b.source === 'house') {
    return { ...b, shape, explanation: `Bears the arms of House ${houseOf(p) || 'Unknown'}.` };
  }
  const father = fatherOf(d, pid)!;
  const fromName = fullName(d.people[b.fromId!]);
  if (!female) {
    const rank = sonRank(d, father, pid);
    if (rank && rank < CADENCY.length) {
      return {
        ...b,
        shape,
        cadency: rank,
        explanation: `Inherited from ${fromName}, differenced by a ${CADENCY[rank]} as ${CADENCY_ORDINAL[rank]}.`,
      };
    }
  }
  return {
    ...b,
    shape,
    explanation: female ? `Inherited from ${fromName}, borne on a lozenge as a daughter.` : `Inherited from ${fromName}.`,
  };
}
