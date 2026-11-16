/**
 * Scribe's Dictation — bulk entry in a forgiving mini-syntax, relative to one person:
 *
 *   father: John Smith (1850-1920)
 *   mother: Mary Jones (c. 1855)
 *   spouse: Alys Varden (1880) m. 1902
 *   children: Tom (1903), Rose (F, 1905), Hal (1909-1944)
 *   siblings: Anne (1878), Peter
 */
import type { Sex } from './types';

export type DictRole = 'father' | 'mother' | 'spouse' | 'child' | 'sibling';

export interface DictEntry {
  role: DictRole;
  given: string;
  surname?: string;
  sex: Sex;
  born?: string;
  died?: string;
  married?: string;
}

const ROLE_WORDS: [RegExp, DictRole, Sex | undefined][] = [
  [/^(father|dad|papa)$/, 'father', 'M'],
  [/^(mother|mum|mom|mama)$/, 'mother', 'F'],
  [/^(spouse|spouses|partner|partners|married)$/, 'spouse', undefined],
  [/^(husband|husbands)$/, 'spouse', 'M'],
  [/^(wife|wives)$/, 'spouse', 'F'],
  [/^(children|child|kids|issue)$/, 'child', undefined],
  [/^(sons?)$/, 'child', 'M'],
  [/^(daughters?)$/, 'child', 'F'],
  [/^(siblings?)$/, 'sibling', undefined],
  [/^(brothers?)$/, 'sibling', 'M'],
  [/^(sisters?)$/, 'sibling', 'F'],
];

/** Split on commas/semicolons that are not inside parentheses. */
function splitEntries(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parseDictation(text: string): { entries: DictEntry[]; errors: string[] } {
  const entries: DictEntry[] = [];
  const errors: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z]+)\s*:\s*(.+)$/);
    if (!m) {
      errors.push(`Could not read “${line}” — start the line with a role, e.g. “children: …”`);
      continue;
    }
    const roleWord = m[1].toLowerCase();
    const found = ROLE_WORDS.find(([re]) => re.test(roleWord));
    if (!found) {
      errors.push(`Unknown role “${m[1]}”.`);
      continue;
    }
    const [, role, roleSex] = found;
    for (const item of splitEntries(m[2])) {
      const e = parseEntry(item, role, roleSex);
      if (e) entries.push(e);
      else errors.push(`Could not read “${item}”.`);
    }
  }
  return { entries, errors };
}

function parseEntry(item: string, role: DictRole, roleSex: Sex | undefined): DictEntry | undefined {
  let rest = item.trim();
  let married: string | undefined;
  const mm = rest.match(/\s+m\.?\s+([^()]+)$/i);
  if (mm) {
    married = mm[1].trim();
    rest = rest.slice(0, mm.index).trim();
  }
  let sex: Sex = roleSex ?? 'U';
  let born: string | undefined;
  let died: string | undefined;
  const pm = rest.match(/\(([^)]*)\)\s*$/);
  if (pm) {
    rest = rest.slice(0, pm.index).trim();
    const tokens = pm[1].split(',').map((t) => t.trim()).filter(Boolean);
    for (const t of tokens) {
      if (/^[mf]$/i.test(t)) {
        sex = t.toUpperCase() as Sex;
        continue;
      }
      if (/^b\.?\s*/i.test(t)) {
        born = t.replace(/^b\.?\s*/i, '');
        continue;
      }
      if (/^d\.?\s*/i.test(t)) {
        died = t.replace(/^d\.?\s*/i, '');
        continue;
      }
      const range = t.match(/^(.*?\d{3,4}\??)\s*[-–]\s*(.*\d{3,4}.*)?$/);
      if (range && /\d/.test(range[1])) {
        born = range[1].trim();
        if (range[2]) died = range[2].trim();
        continue;
      }
      born = t;
    }
  }
  if (!rest) return undefined;
  const parts = rest.split(/\s+/);
  const given = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];
  const surname = parts.length > 1 ? parts[parts.length - 1] : undefined;
  return { role, given, surname, sex, born, died, married };
}
