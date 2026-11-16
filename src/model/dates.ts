/**
 * Fuzzy genealogical dates. Users type what they know — "c. 1820", "before 1900",
 * "1850-1855", "12 March 1902", or GEDCOM forms like "ABT 1820" — and we keep the
 * original text while deriving a sortable year, a tidy display and a GEDCOM form.
 */
export type DateQual = 'exact' | 'about' | 'before' | 'after' | 'between' | 'none';

export interface ParsedDate {
  qual: DateQual;
  year?: number;
  month?: number;
  day?: number;
  year2?: number;
  /** Best single year for sorting / arithmetic */
  sortYear?: number;
  display: string;
  gedcom: string;
  valid: boolean;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthIndex(tok: string): number | undefined {
  const t = tok.toLowerCase().replace(/\.$/, '').slice(0, 3);
  const i = MONTHS.indexOf(t);
  return i >= 0 ? i + 1 : undefined;
}

interface Core {
  year: number;
  month?: number;
  day?: number;
}

function parseCore(s: string): Core | undefined {
  s = s.trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!s) return undefined;
  let m: RegExpMatchArray | null;
  // ISO: 1902-03-12 or 1902-03
  if ((m = s.match(/^(\d{3,4})-(\d{1,2})(?:-(\d{1,2}))?$/))) {
    return { year: +m[1], month: +m[2], day: m[3] ? +m[3] : undefined };
  }
  // Year only
  if ((m = s.match(/^(\d{3,4})$/))) return { year: +m[1] };
  // 12 Mar 1902 / 12 March 1902
  if ((m = s.match(/^(\d{1,2}) ([A-Za-z.]+) (\d{3,4})$/))) {
    const mo = monthIndex(m[2]);
    if (mo) return { year: +m[3], month: mo, day: +m[1] };
  }
  // March 12 1902
  if ((m = s.match(/^([A-Za-z.]+) (\d{1,2}) (\d{3,4})$/))) {
    const mo = monthIndex(m[1]);
    if (mo) return { year: +m[3], month: mo, day: +m[2] };
  }
  // Mar 1902
  if ((m = s.match(/^([A-Za-z.]+) (\d{3,4})$/))) {
    const mo = monthIndex(m[1]);
    if (mo) return { year: +m[2], month: mo };
  }
  return undefined;
}

function coreDisplay(c: Core): string {
  if (c.day && c.month) return `${c.day} ${MONTH_NAMES[c.month - 1]} ${c.year}`;
  if (c.month) return `${MONTH_NAMES[c.month - 1]} ${c.year}`;
  return String(c.year);
}

function coreGedcom(c: Core): string {
  return coreDisplay(c).toUpperCase();
}

const cache = new Map<string, ParsedDate>();

export function parseDate(raw: string | undefined | null): ParsedDate {
  const input = (raw ?? '').trim();
  const hit = cache.get(input);
  if (hit) return hit;
  const res = parseUncached(input);
  if (cache.size > 5000) cache.clear();
  cache.set(input, res);
  return res;
}

function parseUncached(input: string): ParsedDate {
  if (!input) return { qual: 'none', display: '', gedcom: '', valid: true };
  const s = input.toLowerCase().replace(/\s+/g, ' ').trim();
  let m: RegExpMatchArray | null;

  // Ranges: "between 1850 and 1855", "bet 1850 and 1855", "1850-1855", "1850–1855"
  if ((m = s.match(/^(?:bet\.?|between) (.+?) (?:and|-|–) (.+)$/)) || (m = s.match(/^(\d{3,4}) ?[-–] ?(\d{3,4})$/))) {
    const a = parseCore(m[1]);
    const b = parseCore(m[2]);
    if (a && b) {
      return {
        qual: 'between',
        year: a.year,
        year2: b.year,
        sortYear: Math.floor((a.year + b.year) / 2),
        display: `${coreDisplay(a)}–${coreDisplay(b)}`,
        gedcom: `BET ${coreGedcom(a)} AND ${coreGedcom(b)}`,
        valid: true,
      };
    }
  }

  const quals: [RegExp, DateQual][] = [
    [/^(?:about|abt\.?|circa|around|ca\.?|c\.?|est\.?|cal\.?|~)\s*(?=[\d\w])/, 'about'],
    [/^(?:before|bef\.?|<)\s*(?=[\d\w])/, 'before'],
    [/^(?:after|aft\.?|>)\s*(?=[\d\w])/, 'after'],
  ];
  for (const [re, qual] of quals) {
    if (re.test(s)) {
      const c = parseCore(input.replace(new RegExp(re.source, 'i'), ''));
      if (c) return withQual(c, qual);
    }
  }
  // "1820?" means about
  if ((m = s.match(/^(.+)\?$/))) {
    const c = parseCore(m[1]);
    if (c) return withQual(c, 'about');
  }
  const c = parseCore(input);
  if (c) return withQual(c, 'exact');
  return { qual: 'none', display: input, gedcom: '', valid: false };
}

function withQual(c: Core, qual: DateQual): ParsedDate {
  const d = coreDisplay(c);
  const g = coreGedcom(c);
  const map: Record<string, [string, string]> = {
    exact: [d, g],
    about: [`c. ${d}`, `ABT ${g}`],
    before: [`bef. ${d}`, `BEF ${g}`],
    after: [`aft. ${d}`, `AFT ${g}`],
  };
  const [display, gedcom] = map[qual];
  return { qual, year: c.year, month: c.month, day: c.day, sortYear: c.year, display, gedcom, valid: true };
}

export function yearOf(raw: string | undefined): number | undefined {
  return parseDate(raw).sortYear;
}

/** Fractional key for ordering events in a life. Unknown dates sort last. */
export function sortKey(raw: string | undefined): number {
  const p = parseDate(raw);
  if (p.sortYear === undefined) return Number.POSITIVE_INFINITY;
  return p.sortYear + ((p.month ?? 1) - 1) / 12 + (p.day ?? 1) / 400;
}

export function isFullDate(raw: string | undefined): boolean {
  const p = parseDate(raw);
  return p.qual === 'exact' && !!p.day && !!p.month;
}

export const CURRENT_YEAR = new Date().getFullYear();
