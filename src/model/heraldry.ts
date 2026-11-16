/**
 * A small, real heraldry engine: fields, divisions, ordinaries and charges,
 * with proper blazon generation, the rule of tincture and cadency marks.
 */
export type Tincture = 'or' | 'argent' | 'gules' | 'azure' | 'vert' | 'purpure' | 'sable';
export type Division = 'plain' | 'perPale' | 'perFess' | 'perBend' | 'perChevron' | 'quarterly' | 'perSaltire';
export type Ordinary = 'none' | 'fess' | 'pale' | 'bend' | 'chevron' | 'cross' | 'saltire' | 'chief' | 'bordure';
export type Charge =
  | 'none'
  | 'mullet'
  | 'crescent'
  | 'roundel'
  | 'annulet'
  | 'lozenge'
  | 'fleur'
  | 'rose'
  | 'tower'
  | 'crown'
  | 'key'
  | 'sword'
  | 'heart';
export type ShieldShape = 'auto' | 'shield' | 'lozenge';

export interface Arms {
  division: Division;
  t1: Tincture;
  t2: Tincture;
  ordinary: Ordinary;
  ordinaryT: Tincture;
  charge: Charge;
  chargeT: Tincture;
  count: 1 | 2 | 3 | 4;
  shape?: ShieldShape;
}

export const TINCTURES: Record<Tincture, { name: string; color: string; metal: boolean }> = {
  or: { name: 'Or', color: '#d6a93a', metal: true },
  argent: { name: 'Argent', color: '#f3efe4', metal: true },
  gules: { name: 'Gules', color: '#a3202a', metal: false },
  azure: { name: 'Azure', color: '#1f4f8f', metal: false },
  vert: { name: 'Vert', color: '#2c6b40', metal: false },
  purpure: { name: 'Purpure', color: '#6a2d6c', metal: false },
  sable: { name: 'Sable', color: '#1d1a17', metal: false },
};

export const DIVISIONS: Record<Division, string> = {
  plain: 'Plain field',
  perPale: 'Per pale',
  perFess: 'Per fess',
  perBend: 'Per bend',
  perChevron: 'Per chevron',
  quarterly: 'Quarterly',
  perSaltire: 'Per saltire',
};

export const ORDINARIES: Record<Ordinary, string> = {
  none: 'None',
  fess: 'Fess',
  pale: 'Pale',
  bend: 'Bend',
  chevron: 'Chevron',
  cross: 'Cross',
  saltire: 'Saltire',
  chief: 'Chief',
  bordure: 'Bordure',
};

export const CHARGES: Record<Charge, { name: string; plural: string }> = {
  none: { name: 'none', plural: 'none' },
  mullet: { name: 'mullet', plural: 'mullets' },
  crescent: { name: 'crescent', plural: 'crescents' },
  roundel: { name: 'roundel', plural: 'roundels' },
  annulet: { name: 'annulet', plural: 'annulets' },
  lozenge: { name: 'lozenge', plural: 'lozenges' },
  fleur: { name: 'fleur-de-lis', plural: 'fleurs-de-lis' },
  rose: { name: 'rose', plural: 'roses' },
  tower: { name: 'tower', plural: 'towers' },
  crown: { name: 'crown', plural: 'crowns' },
  key: { name: 'key', plural: 'keys' },
  sword: { name: 'sword', plural: 'swords' },
  heart: { name: 'heart', plural: 'hearts' },
};

/** Traditional English cadency marks by son's birth order. */
export const CADENCY = [
  '',
  'label',
  'crescent',
  'mullet',
  'martlet',
  'annulet',
  'fleur-de-lis',
  'rose',
  'cross moline',
  'double quatrefoil',
];
export const CADENCY_ORDINAL = ['', 'eldest son', 'second son', 'third son', 'fourth son', 'fifth son', 'sixth son', 'seventh son', 'eighth son', 'ninth son'];

const NUM = ['', 'a', 'two', 'three', 'four'];

function tinc(t: Tincture) {
  return TINCTURES[t].name;
}

function chargePhrase(a: Arms): string {
  if (a.charge === 'none') return '';
  const c = CHARGES[a.charge];
  // Roundels have special names by tincture
  if (a.charge === 'roundel') {
    const special: Partial<Record<Tincture, [string, string]>> = {
      or: ['bezant', 'bezants'],
      argent: ['plate', 'plates'],
      gules: ['torteau', 'torteaux'],
      azure: ['hurt', 'hurts'],
      vert: ['pomme', 'pommes'],
    };
    const sp = special[a.chargeT];
    if (sp) return a.count === 1 ? `a ${sp[0]}` : `${NUM[a.count]} ${sp[1]}`;
  }
  if (a.count === 1) {
    const art = /^[aeiou]/.test(c.name) ? 'an' : 'a';
    return `${art} ${c.name} ${tinc(a.chargeT)}`;
  }
  return `${NUM[a.count]} ${c.plural} ${tinc(a.chargeT)}`;
}

/** Produce the formal blazon, e.g. "Per pale Azure and Or, a chevron Gules between three mullets Argent". */
export function blazon(a: Arms): string {
  const field =
    a.division === 'plain' ? tinc(a.t1) : `${DIVISIONS[a.division]} ${tinc(a.t1)} and ${tinc(a.t2)}`;
  const ch = chargePhrase(a);
  const ord = a.ordinary;
  if (ord === 'none') return ch ? `${field}, ${ch}` : field;
  const ordPhrase = `a ${ORDINARIES[ord].toLowerCase()} ${tinc(a.ordinaryT)}`;
  if (!ch) return `${field}, ${ordPhrase}`;
  if (ord === 'chief') return `${field}, ${ch}, ${ordPhrase}`;
  if (ord === 'bordure') return `${field}, ${ch} within ${ordPhrase}`;
  if (a.count === 1) return `${field}, ${ordPhrase}, in chief ${ch}`;
  return `${field}, ${ordPhrase} between ${ch}`;
}

/** The rule of tincture: no metal on metal, no colour on colour. */
export function tinctureWarnings(a: Arms): string[] {
  const out: string[] = [];
  const isMetal = (t: Tincture) => TINCTURES[t].metal;
  if (a.division !== 'plain' && a.t1 === a.t2) out.push('Both halves of the field share a tincture — the division vanishes.');
  if (a.division === 'plain' && a.ordinary !== 'none') {
    if (isMetal(a.ordinaryT) === isMetal(a.t1))
      out.push(`Rule of tincture: the ${ORDINARIES[a.ordinary].toLowerCase()} (${tinc(a.ordinaryT)}) sits ${isMetal(a.t1) ? 'metal on metal' : 'colour on colour'}.`);
  }
  if (a.division === 'plain' && a.charge !== 'none') {
    if (isMetal(a.chargeT) === isMetal(a.t1))
      out.push(`Rule of tincture: ${CHARGES[a.charge].plural} (${tinc(a.chargeT)}) sit ${isMetal(a.t1) ? 'metal on metal' : 'colour on colour'}.`);
  }
  return out;
}

// --- Procedural arms ----------------------------------------------------------

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const METALS: Tincture[] = ['or', 'argent'];
const COLOURS: Tincture[] = ['gules', 'azure', 'vert', 'purpure', 'sable'];

/** Deterministic, rule-abiding arms generated from a surname — every House gets a crest. */
export function proceduralArms(seedText: string): Arms {
  const r = mulberry32(hashString(seedText.toLowerCase().trim() || 'unknown'));
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const fieldIsColour = r() < 0.7;
  const t1 = fieldIsColour ? pick(COLOURS) : pick(METALS);
  const opposite = (t: Tincture) => (TINCTURES[t].metal ? pick(COLOURS) : pick(METALS));
  const division = pick<Division>(['plain', 'plain', 'plain', 'perPale', 'perFess', 'perChevron', 'quarterly', 'perBend']);
  const t2 = opposite(t1);
  const ordinary = division === 'plain' ? pick<Ordinary>(['none', 'fess', 'chevron', 'bend', 'chief', 'cross', 'saltire', 'bordure', 'none']) : 'none';
  const ordinaryT = opposite(t1);
  const charge = pick<Charge>(['mullet', 'crescent', 'fleur', 'rose', 'tower', 'crown', 'key', 'roundel', 'annulet', 'lozenge', 'sword', 'heart']);
  let chargeT: Tincture = opposite(t1);
  if (ordinary === 'chief' || ordinary === 'bordure' || ordinary === 'none') chargeT = opposite(t1);
  if (division !== 'plain') chargeT = TINCTURES[t1].metal ? 'sable' : 'argent';
  const count = (ordinary === 'cross' || ordinary === 'saltire' ? pick([4, 4, 1]) : pick([1, 3, 3, 2])) as Arms['count'];
  return { division, t1, t2, ordinary, ordinaryT, charge, chargeT, count, shape: 'auto' };
}

/** A House's signature colour, taken from the first colour (not metal) in its arms. */
export function armsColor(a: Arms): string {
  for (const t of [a.t1, a.t2, a.ordinaryT, a.chargeT]) if (!TINCTURES[t].metal) return TINCTURES[t].color;
  return TINCTURES.gules.color;
}

export const defaultArms = (): Arms => ({
  division: 'plain',
  t1: 'azure',
  t2: 'or',
  ordinary: 'chevron',
  ordinaryT: 'or',
  charge: 'mullet',
  chargeT: 'argent',
  count: 3,
  shape: 'auto',
});

// --- Charge placement ------------------------------------------------------------

type Pt = [number, number, number]; // x, y, size

export function chargePositions(a: Arms): Pt[] {
  const n = a.count;
  const T: Record<string, Pt[][]> = {
    none: [[], [[50, 52, 20]], [[31, 46, 13], [69, 46, 13]], [[30, 35, 12], [70, 35, 12], [50, 76, 12]], [[30, 33, 11], [70, 33, 11], [33, 72, 11], [67, 72, 11]]],
    chief: [[], [[50, 72, 16]], [[32, 68, 12], [68, 68, 12]], [[30, 58, 10], [70, 58, 10], [50, 90, 10]], [[32, 56, 9], [68, 56, 9], [36, 86, 9], [64, 86, 9]]],
    bordure: [[], [[50, 52, 16]], [[33, 48, 11], [67, 48, 11]], [[33, 38, 10], [67, 38, 10], [50, 76, 10]], [[34, 36, 9], [66, 36, 9], [36, 72, 9], [64, 72, 9]]],
    fess: [[], [[50, 21, 10]], [[30, 21, 10], [70, 21, 10]], [[30, 21, 10], [70, 21, 10], [50, 91, 10]], [[30, 21, 9], [70, 21, 9], [38, 88, 9], [62, 88, 9]]],
    chevron: [[], [[50, 24, 10]], [[24, 26, 10], [76, 26, 10]], [[24, 26, 10], [76, 26, 10], [50, 92, 10]], [[24, 26, 9], [76, 26, 9], [38, 94, 8], [62, 94, 8]]],
    pale: [[], [[20, 40, 9]], [[20, 50, 9], [80, 50, 9]], [[20, 32, 9], [80, 32, 9], [20, 76, 9]], [[20, 32, 9], [80, 32, 9], [20, 76, 9], [80, 76, 9]]],
    cross: [[], [[26, 26, 9]], [[26, 26, 9], [74, 26, 9]], [[26, 26, 9], [74, 26, 9], [28, 82, 9]], [[26, 26, 9], [74, 26, 9], [28, 82, 9], [72, 82, 9]]],
    saltire: [[], [[50, 20, 9]], [[18, 57, 9], [82, 57, 9]], [[50, 20, 9], [18, 57, 9], [82, 57, 9]], [[50, 20, 9], [18, 57, 9], [82, 57, 9], [50, 98, 8]]],
    bend: [[], [[72, 28, 10]], [[72, 28, 10], [28, 84, 10]], [[64, 22, 9], [84, 44, 9], [28, 84, 9]], [[64, 22, 9], [84, 44, 9], [18, 70, 9], [38, 92, 9]]],
  };
  return T[a.ordinary]?.[n] ?? T.none[n];
}
