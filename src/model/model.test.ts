import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { parseDate } from './dates';
import { sampleDynasty } from './sample';
import { describeRelationship, bloodTerm } from './relationship';
import { addRelative, deletePerson, mergePeople } from './ops';
import { emptyDynasty, newPerson } from './types';
import { exportGedcom, importGedcom } from './gedcom';
import { parseDictation } from './dictation';
import { allWarnings } from './validate';
import { blazon, proceduralArms, tinctureWarnings } from './heraldry';
import { resolveArms } from './arms';
import { computeLayout, CARD_W } from '../layout/familyLayout';
import { siblingsOf } from './graph';

describe('fuzzy dates', () => {
  it.each([
    ['1902', 'exact', 1902, '1902', '1902'],
    ['c. 1820', 'about', 1820, 'c. 1820', 'ABT 1820'],
    ['ABT 1820', 'about', 1820, 'c. 1820', 'ABT 1820'],
    ['before 1900', 'before', 1900, 'bef. 1900', 'BEF 1900'],
    ['1850-1855', 'between', 1852, '1850–1855', 'BET 1850 AND 1855'],
    ['12 March 1902', 'exact', 1902, '12 Mar 1902', '12 MAR 1902'],
    ['1902-03-12', 'exact', 1902, '12 Mar 1902', '12 MAR 1902'],
    ['1820?', 'about', 1820, 'c. 1820', 'ABT 1820'],
  ])('%s', (input, qual, year, display, gedcom) => {
    const p = parseDate(input);
    expect(p.qual).toBe(qual);
    expect(p.sortYear).toBe(year);
    expect(p.display).toBe(display);
    expect(p.gedcom).toBe(gedcom);
  });
  it('flags nonsense', () => expect(parseDate('sometime').valid).toBe(false));
});

describe('relationships', () => {
  const d = sampleDynasty();
  const rel = (a: string, b: string) => describeRelationship(d, a, b).term;
  it('direct line', () => {
    expect(rel('david', 'george')).toBe('father');
    expect(rel('david', 'aldric')).toBe('3× great-grandfather');
    expect(rel('aldric', 'oliver')).toBe('4× great-grandson');
  });
  it('half siblings and cousins', () => {
    expect(rel('robert', 'henry')).toBe('half-brother');
    expect(rel('robert', 'alice')).toBe('sister');
    expect(rel('robert', 'agnes')).toBe('1st cousin');
    expect(rel('arthur', 'agnes')).toBe('1st cousin once removed');
  });
  it('in-laws', () => {
    expect(rel('george', 'priya')).toBe('daughter-in-law');
    expect(rel('priya', 'george')).toBe('father-in-law');
    expect(rel('david', 'priya')).toBe('wife');
  });
  it('terms', () => {
    expect(bloodTerm(3, 3, 'F')).toBe('2nd cousin');
    expect(bloodTerm(1, 3, 'M')).toBe('great-nephew');
    expect(bloodTerm(3, 1, 'F')).toBe('great-aunt');
  });
});

describe('lineage operations', () => {
  it('adds parents into one union and infers spouse as co-parent', () => {
    let d = emptyDynasty();
    const kid = newPerson({ given: 'Kid' });
    d.people[kid.id] = kid;
    let dad = '';
    let mum = '';
    d = produce(d, (dr) => {
      dad = addRelative(dr, kid.id, 'father', { given: 'Dad' });
      mum = addRelative(dr, kid.id, 'mother', { given: 'Mum' });
    });
    const us = Object.values(d.unions);
    expect(us).toHaveLength(1);
    expect(us[0].partners).toEqual([dad, mum]);
    // single parent with child, then spouse → becomes co-parent
    let d2 = emptyDynasty();
    const p = newPerson({ given: 'Solo', sex: 'F' });
    d2.people[p.id] = p;
    d2 = produce(d2, (dr) => {
      addRelative(dr, p.id, 'child', { given: 'C' });
      addRelative(dr, p.id, 'spouse', { given: 'S', sex: 'M' });
    });
    const u = Object.values(d2.unions);
    expect(u).toHaveLength(1);
    expect(u[0].partners).toHaveLength(2);
    expect(u[0].children).toHaveLength(1);
  });
  it('sibling without parents creates an unknown parent', () => {
    let d = emptyDynasty();
    const a = newPerson({ given: 'A' });
    d.people[a.id] = a;
    let b = '';
    d = produce(d, (dr) => {
      b = addRelative(dr, a.id, 'sibling', { given: 'B' });
    });
    expect(siblingsOf(d, a.id).map((s) => s.id)).toEqual([b]);
    expect(Object.values(d.people).some((p) => p.placeholder)).toBe(true);
  });
  it('merges and deletes cleanly', () => {
    let d = sampleDynasty();
    d = produce(d, (dr) => {
      const dup = addRelative(dr, 'oliver', 'father', { given: 'David', surname: 'Ashcombe', sex: 'M' }, {});
      mergePeople(dr, 'david', dup);
    });
    expect(Object.values(d.unions).filter((u) => u.children.some((c) => c.id === 'oliver'))).toHaveLength(1);
    d = produce(d, (dr) => deletePerson(dr, 'maya'));
    expect(d.people.maya).toBeUndefined();
    expect(Object.values(d.unions).some((u) => u.children.some((c) => c.id === 'maya'))).toBe(false);
  });
});

describe('GEDCOM', () => {
  it('round-trips the sample', () => {
    const d = sampleDynasty();
    const ged = exportGedcom(d);
    const back = importGedcom(ged);
    expect(Object.keys(back.people)).toHaveLength(Object.keys(d.people).length);
    expect(Object.keys(back.unions)).toHaveLength(Object.keys(d.unions).length);
    const aldric = Object.values(back.people).find((p) => p.given === 'Aldric')!;
    expect(aldric.title).toBe('Sir');
    expect(aldric.events.filter((e) => e.type === 'birth')).toHaveLength(2);
    const samuel = Object.values(back.people).find((p) => p.given === 'Samuel')!;
    const u = Object.values(back.unions).find((u) => u.children.some((c) => c.id === samuel.id))!;
    expect(u.children[0].kind).toBe('adopted');
  });
  it('redacts the living', () => {
    const ged = exportGedcom(sampleDynasty(), { redactLiving: true });
    expect(ged).not.toContain('Oliver');
    expect(ged).toContain('Aldric');
  });
});

describe('dictation', () => {
  it('parses roles, dates and sexes', () => {
    const { entries, errors } = parseDictation('father: John Smith (1850-1920)\nchildren: Tom (1903), Rose (F, 1905), Hal (b. 1909, d. 1944)\nspouse: Alys Varden (1880) m. 1902');
    expect(errors).toEqual([]);
    expect(entries).toHaveLength(5);
    expect(entries[0]).toMatchObject({ role: 'father', given: 'John', surname: 'Smith', sex: 'M', born: '1850', died: '1920' });
    expect(entries[2]).toMatchObject({ given: 'Rose', sex: 'F', born: '1905' });
    expect(entries[3]).toMatchObject({ given: 'Hal', born: '1909', died: '1944' });
    expect(entries[4]).toMatchObject({ role: 'spouse', married: '1902' });
  });
});

describe('warnings', () => {
  it('flags the disputed birth in the sample', () => {
    const w = allWarnings(sampleDynasty());
    expect(w.get('aldric')?.some((x) => x.text.includes('Disputed'))).toBe(true);
  });
});

describe('heraldry', () => {
  it('blazons', () => {
    expect(blazon(sampleDynasty().people.aldric.arms!)).toBe('Azure, a chevron Or between three towers Argent');
  });
  it('procedural arms obey the rule of tincture', () => {
    for (const s of ['Smith', 'Perera', 'Nakamura', 'Okafor', 'Ashcombe', 'Varden', 'Grey', 'Lowe']) {
      expect(tinctureWarnings(proceduralArms(s))).toEqual([]);
    }
  });
  it('sons inherit with cadency, daughters on a lozenge', () => {
    const d = sampleDynasty();
    expect(resolveArms(d, 'edmund').cadency).toBe(1);
    expect(resolveArms(d, 'thomas').cadency).toBe(2);
    expect(resolveArms(d, 'margaret').shape).toBe('lozenge');
  });
});

describe('layout', () => {
  it('places every connected person without overlap', () => {
    const d = sampleDynasty();
    const L = computeLayout(d, { rootId: 'david', mode: 'family', collapsedDown: new Set(), collapsedUp: new Set() });
    expect(L.nodes.size).toBe(Object.keys(d.people).length);
    const rows = new Map<number, number[]>();
    for (const n of L.nodes.values()) rows.set(n.y, [...(rows.get(n.y) ?? []), n.x]);
    for (const xs of rows.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(CARD_W);
    }
    // parents sit above children
    expect(L.nodes.get('george')!.y).toBeLessThan(L.nodes.get('david')!.y);
    expect(L.nodes.get('eleanor')!.y).toBeGreaterThan(L.nodes.get('godfrey')!.y);
  });
  it('ancestors mode shows only the pedigree', () => {
    const d = sampleDynasty();
    const L = computeLayout(d, { rootId: 'oliver', mode: 'ancestors', collapsedDown: new Set(), collapsedUp: new Set() });
    expect(L.nodes.has('susan')).toBe(false);
    expect(L.nodes.has('aldric')).toBe(true);
  });
  it("in-law parents never sit directly above another family's children", () => {
    let d = sampleDynasty();
    let nevil = '';
    d = produce(d, (dr) => {
      nevil = addRelative(dr, 'priya', 'father', { given: 'Ravi', surname: 'Nair', sex: 'M' });
    });
    const L = computeLayout(d, { rootId: 'david', mode: 'family', collapsedDown: new Set(), collapsedUp: new Set() });
    const n = L.nodes.get(nevil)!;
    expect(n.y).toBe(L.nodes.get('george')!.y);
    for (const kid of ['david', 'susan']) expect(Math.abs(L.nodes.get(kid)!.x - n.x)).toBeGreaterThan(CARD_W / 2);
    // the two families' sibling bars use different lanes
    const bars = L.unions.filter((u) => u.children.length && u.junction.y === n.y).map((u) => u.barY);
    expect(new Set(bars).size).toBe(bars.length);
  });
  it('collapse hides descendants', () => {
    const d = sampleDynasty();
    const L = computeLayout(d, { rootId: 'aldric', mode: 'family', collapsedDown: new Set(['edmund']), collapsedUp: new Set() });
    expect(L.nodes.has('robert')).toBe(false);
    expect(L.hiddenDown.get('edmund')).toBe(3);
  });
});
