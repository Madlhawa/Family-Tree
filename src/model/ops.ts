/**
 * Mutations on a Dynasty draft (used inside immer `produce`). Keeping them pure
 * and store-agnostic makes the lineage rules easy to test.
 */
import type { ChildKind, Dynasty, Person, Union } from './types';
import { newPerson, uid } from './types';
import { birthUnionsOf, unionsOf } from './graph';

export type RelKind = 'father' | 'mother' | 'parent' | 'spouse' | 'child' | 'sibling';

export interface AddOptions {
  /** Link an existing person instead of creating one */
  existingId?: string;
  /** For children: which union of the anchor */
  unionId?: string;
  childKind?: ChildKind;
}

function makeUnion(d: Dynasty, partners: string[], children: { id: string; kind: ChildKind }[] = []): Union {
  const u: Union = { id: uid('u'), partners, children, status: partners.length === 2 ? 'married' : 'unknown' };
  d.unions[u.id] = u;
  return u;
}

/** Add a relative to `anchorId`. Returns the id of the (new or linked) person. */
export function addRelative(d: Dynasty, anchorId: string, rel: RelKind, data: Partial<Person>, opts: AddOptions = {}): string {
  if (!d.people[anchorId]) throw new Error('Unknown anchor');
  let pid = opts.existingId;
  if (!pid) {
    const p = newPerson({
      ...data,
      sex: data.sex ?? (rel === 'father' ? 'M' : rel === 'mother' ? 'F' : 'U'),
    });
    d.people[p.id] = p;
    pid = p.id;
  }
  if (pid === anchorId) throw new Error('A person cannot be related to themselves');

  switch (rel) {
    case 'father':
    case 'mother':
    case 'parent': {
      const bus = birthUnionsOf(d, anchorId).filter((u) => u.children.find((c) => c.id === anchorId)?.kind === 'birth');
      const open = bus.find((u) => u.partners.length < 2);
      if (open) {
        if (!open.partners.includes(pid)) open.partners.push(pid);
        if (open.partners.length === 2 && open.status === 'unknown') open.status = 'married';
        sortPartners(d, open);
      } else if (bus.length === 0) {
        makeUnion(d, [pid], [{ id: anchorId, kind: opts.childKind ?? 'birth' }]);
      } else {
        // Already has two birth parents — record as adoptive/step parent
        makeUnion(d, [pid], [{ id: anchorId, kind: opts.childKind ?? 'adopted' }]);
      }
      break;
    }
    case 'spouse': {
      const solo = unionsOf(d, anchorId).find((u) => u.partners.length === 1);
      if (solo) {
        // Inference: the new spouse becomes the other parent of the existing children
        solo.partners.push(pid);
        solo.status = 'married';
        sortPartners(d, solo);
      } else {
        const u = makeUnion(d, [anchorId, pid]);
        sortPartners(d, u);
      }
      break;
    }
    case 'child': {
      let u = opts.unionId ? d.unions[opts.unionId] : undefined;
      if (!u) {
        const us = unionsOf(d, anchorId);
        u = us.length ? us[0] : makeUnion(d, [anchorId]);
      }
      if (!u.children.some((c) => c.id === pid)) u.children.push({ id: pid, kind: opts.childKind ?? 'birth' });
      break;
    }
    case 'sibling': {
      let u = birthUnionsOf(d, anchorId)[0];
      if (!u) {
        // Create an "unknown parent" slot so siblings stay connected
        const parent = newPerson({ placeholder: true, surname: d.people[anchorId].surname, sex: 'M' });
        d.people[parent.id] = parent;
        u = makeUnion(d, [parent.id], [{ id: anchorId, kind: 'birth' }]);
      }
      if (!u.children.some((c) => c.id === pid)) u.children.push({ id: pid, kind: opts.childKind ?? 'birth' });
      break;
    }
  }
  return pid;
}

/** Convention: husband on the left, wife on the right. */
function sortPartners(d: Dynasty, u: Union) {
  if (u.partners.length !== 2) return;
  const [a, b] = u.partners;
  if (d.people[a]?.sex === 'F' && d.people[b]?.sex === 'M') u.partners = [b, a];
}

export function deletePerson(d: Dynasty, id: string) {
  delete d.people[id];
  for (const u of Object.values(d.unions)) {
    u.partners = u.partners.filter((p) => p !== id);
    u.children = u.children.filter((c) => c.id !== id);
    if (u.partners.length === 0 && u.children.length <= 1) delete d.unions[u.id];
    else if (u.children.length === 0 && u.partners.length < 2) delete d.unions[u.id];
  }
  for (const h of Object.values(d.heirlooms)) h.custodians = h.custodians.filter((c) => c !== id);
  for (const s of Object.values(d.sagas)) s.steps = s.steps.filter((st) => st.personId !== id);
  if (d.rootId === id) d.rootId = Object.keys(d.people)[0];
}

/** Merge `dropId` into `keepId`: links move over, empty fields are filled in. */
export function mergePeople(d: Dynasty, keepId: string, dropId: string) {
  const keep = d.people[keepId];
  const drop = d.people[dropId];
  if (!keep || !drop || keepId === dropId) return;
  for (const k of ['given', 'surname', 'birthSurname', 'title', 'epithet', 'occupation', 'bio', 'portrait'] as const) {
    if (!keep[k] && drop[k]) (keep as any)[k] = drop[k];
  }
  if (keep.sex === 'U') keep.sex = drop.sex;
  if (!keep.arms && drop.arms) keep.arms = drop.arms;
  keep.altNames = [...new Set([...(keep.altNames ?? []), ...(drop.altNames ?? [])])];
  keep.events.push(...drop.events.filter((e) => !keep.events.some((k) => k.type === e.type && k.date === e.date)));
  keep.media.push(...drop.media);
  keep.links.push(...drop.links);
  keep.socials.push(...drop.socials);
  keep.placeholder = keep.placeholder && drop.placeholder;
  for (const u of Object.values(d.unions)) {
    u.partners = [...new Set(u.partners.map((p) => (p === dropId ? keepId : p)))];
    const seen = new Set<string>();
    u.children = u.children
      .map((c) => (c.id === dropId ? { ...c, id: keepId } : c))
      .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  }
  // Merge unions that now have identical partner sets
  const byKey = new Map<string, Union>();
  for (const u of Object.values(d.unions)) {
    if (u.partners.length !== 2) continue;
    const key = [...u.partners].sort().join('|');
    const prev = byKey.get(key);
    if (prev) {
      for (const c of u.children) if (!prev.children.some((x) => x.id === c.id)) prev.children.push(c);
      delete d.unions[u.id];
    } else byKey.set(key, u);
  }
  // A child recorded under a smaller union that a fuller union already covers is redundant
  const all = Object.values(d.unions);
  for (const small of all) {
    for (const big of all) {
      if (small === big || big.partners.length <= small.partners.length) continue;
      if (!small.partners.every((p) => big.partners.includes(p))) continue;
      small.children = small.children.filter((c) => !big.children.some((b) => b.id === c.id));
    }
  }
  for (const u of Object.values(d.unions)) {
    if (u.children.length === 0 && u.partners.length < 2) delete d.unions[u.id];
  }
  for (const h of Object.values(d.heirlooms)) h.custodians = h.custodians.map((c) => (c === dropId ? keepId : c));
  for (const s of Object.values(d.sagas)) for (const st of s.steps) if (st.personId === dropId) st.personId = keepId;
  if (d.rootId === dropId) d.rootId = keepId;
  delete d.people[dropId];
}

/**
 * Put a union's children in the given order (ids not listed keep their
 * relative order at the end) and remember that the order was set by hand.
 */
export function reorderChildren(d: Dynasty, unionId: string, orderedIds: string[]) {
  const u = d.unions[unionId];
  if (!u) return;
  const byId = new Map(u.children.map((c) => [c.id, c]));
  const listed = orderedIds.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  const rest = u.children.filter((c) => !orderedIds.includes(c.id));
  u.children = [...listed, ...rest];
  u.manualOrder = true;
}

export function unlinkChild(d: Dynasty, unionId: string, childId: string) {
  const u = d.unions[unionId];
  if (!u) return;
  u.children = u.children.filter((c) => c.id !== childId);
  if (u.children.length === 0 && u.partners.length < 2) delete d.unions[unionId];
}

export function unlinkPartner(d: Dynasty, unionId: string, partnerId: string) {
  const u = d.unions[unionId];
  if (!u) return;
  u.partners = u.partners.filter((p) => p !== partnerId);
  if (u.partners.length === 0 && u.children.length <= 1) delete d.unions[unionId];
  else if (u.children.length === 0 && u.partners.length < 2) delete d.unions[unionId];
}
