/** GEDCOM 5.5.1 import / export — the lingua franca of genealogy software. */
import type { ChildKind, Dynasty, EventType, LifeEvent, Person, Sex, Union } from './types';
import { emptyDynasty, newPerson, uid } from './types';
import { parseDate } from './dates';
import { isLiving } from './graph';

interface GNode {
  level: number;
  xref?: string;
  tag: string;
  value: string;
  children: GNode[];
}

export function parseGedcomTree(text: string): GNode[] {
  const roots: GNode[] = [];
  const stack: GNode[] = [];
  for (const rawLine of text.replace(/^﻿/, '').split(/\r?\n|\r/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/);
    if (!m) continue;
    const node: GNode = { level: +m[1], xref: m[2], tag: m[3].toUpperCase(), value: m[4] ?? '', children: [] };
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

/** Value with CONC / CONT continuation lines folded in. */
function fullValue(n: GNode): string {
  let v = n.value;
  for (const c of n.children) {
    if (c.tag === 'CONC') v += c.value;
    else if (c.tag === 'CONT') v += '\n' + c.value;
  }
  return v;
}

const child = (n: GNode, tag: string) => n.children.find((c) => c.tag === tag);
const children = (n: GNode, tag: string) => n.children.filter((c) => c.tag === tag);

const EVENT_TAGS: Record<string, EventType> = {
  BIRT: 'birth',
  CHR: 'baptism',
  BAPM: 'baptism',
  DEAT: 'death',
  BURI: 'burial',
  RESI: 'residence',
  EDUC: 'education',
  EMIG: 'migration',
  IMMI: 'migration',
  NATU: 'migration',
  _MILT: 'military',
  MILI: 'military',
  TITL: 'title',
  EVEN: 'custom',
};
const EVENT_OUT: Partial<Record<EventType, string>> = {
  birth: 'BIRT',
  baptism: 'CHR',
  death: 'DEAT',
  burial: 'BURI',
  residence: 'RESI',
  education: 'EDUC',
  migration: 'EMIG',
  military: '_MILT',
  occupation: 'OCCU',
  title: 'TITL',
  custom: 'EVEN',
};

export function importGedcom(text: string, name = 'Imported Dynasty'): Dynasty {
  const roots = parseGedcomTree(text);
  const d = emptyDynasty(name);
  const sources = new Map<string, string>();
  for (const r of roots) if (r.tag === 'SOUR' && r.xref) sources.set(r.xref, fullValue(child(r, 'TITL') ?? r) || r.xref);
  const notes = new Map<string, string>();
  for (const r of roots) if (r.tag === 'NOTE' && r.xref) notes.set(r.xref, fullValue(r));

  const idMap = new Map<string, string>();
  const pedi = new Map<string, ChildKind>(); // `${indi}|${fam}` → kind

  for (const r of roots) {
    if (r.tag !== 'INDI' || !r.xref) continue;
    const nameNode = child(r, 'NAME');
    const raw = nameNode ? nameNode.value : '';
    const sm = raw.match(/^(.*?)\/(.*?)\/(.*)$/);
    let given = sm ? sm[1].trim() : raw.trim();
    let surname = sm ? sm[2].trim() : '';
    if (nameNode) {
      given = child(nameNode, 'GIVN')?.value || given;
      surname = child(nameNode, 'SURN')?.value || surname;
    }
    const sexV = (child(r, 'SEX')?.value ?? 'U').toUpperCase();
    const p: Person = newPerson({
      given,
      surname,
      sex: (sexV === 'M' || sexV === 'F' ? sexV : 'U') as Sex,
      title: nameNode ? child(nameNode, 'NPFX')?.value : undefined,
      epithet: nameNode ? child(nameNode, 'NICK')?.value : undefined,
    });
    const altNames = children(r, 'NAME')
      .slice(1)
      .map((n) => n.value.replace(/\//g, '').trim())
      .filter(Boolean);
    if (altNames.length) p.altNames = altNames;
    for (const n of r.children) {
      const type = EVENT_TAGS[n.tag];
      if (n.tag === 'OCCU') {
        p.occupation = p.occupation ?? n.value;
        continue;
      }
      if (n.tag === 'NOTE') {
        const t = n.value.startsWith('@') ? notes.get(n.value) ?? '' : fullValue(n);
        p.bio = p.bio ? p.bio + '\n\n' + t : t;
        continue;
      }
      if (n.tag === 'FAMC' && n.value) {
        const pd = child(n, 'PEDI')?.value?.toLowerCase();
        if (pd === 'adopted' || pd === 'foster') pedi.set(`${r.xref}|${n.value}`, pd);
        continue;
      }
      if (!type) continue;
      const src = child(n, 'SOUR');
      const e: LifeEvent = {
        id: uid('e'),
        type,
        date: child(n, 'DATE')?.value,
        place: child(n, 'PLAC')?.value,
        note: child(n, 'NOTE') ? fullValue(child(n, 'NOTE')!) : undefined,
        source: src ? (src.value.startsWith('@') ? sources.get(src.value) : fullValue(src)) : undefined,
        label: type === 'custom' || type === 'title' ? child(n, 'TYPE')?.value || n.value || undefined : undefined,
      };
      if (src) e.confidence = 'verified';
      p.events.push(e);
    }
    d.people[p.id] = p;
    idMap.set(r.xref, p.id);
  }

  for (const r of roots) {
    if (r.tag !== 'FAM' || !r.xref) continue;
    const partners = ['HUSB', 'WIFE'].map((t) => idMap.get(child(r, t)?.value ?? '')).filter((x): x is string => !!x);
    const kids = children(r, 'CHIL')
      .map((c) => ({ x: c.value, id: idMap.get(c.value) }))
      .filter((c): c is { x: string; id: string } => !!c.id)
      .map((c) => ({ id: c.id, kind: pedi.get(`${c.x}|${r.xref}`) ?? ('birth' as ChildKind) }));
    if (!partners.length && !kids.length) continue;
    const marr = child(r, 'MARR');
    const u: Union = {
      id: uid('u'),
      partners,
      children: kids,
      status: child(r, 'DIV') ? 'divorced' : marr || partners.length === 2 ? 'married' : 'unknown',
      date: marr ? child(marr, 'DATE')?.value : undefined,
      place: marr ? child(marr, 'PLAC')?.value : undefined,
    };
    if (!partners.length && kids.length) {
      // keep siblings connected through an unknown parent
      const ph = newPerson({ placeholder: true, sex: 'U', surname: d.people[kids[0].id]?.surname ?? '' });
      d.people[ph.id] = ph;
      u.partners = [ph.id];
    }
    d.unions[u.id] = u;
  }

  // Root: the first individual (GEDCOM files usually start with the submitter's home person)
  d.rootId = idMap.values().next().value;
  d.annals.push({ id: uid('a'), at: Date.now(), text: `Imported ${idMap.size} people from GEDCOM.` });
  return d;
}

function esc(v: string) {
  return v.replace(/\r?\n/g, ' ');
}

function wrapNote(level: number, tag: string, text: string): string[] {
  const out: string[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((ln, i) => {
    const chunks = ln.match(/.{1,200}/g) ?? [''];
    chunks.forEach((ch, j) => {
      if (i === 0 && j === 0) out.push(`${level} ${tag} ${ch}`);
      else if (j === 0) out.push(`${level + 1} CONT ${ch}`);
      else out.push(`${level + 1} CONC ${ch}`);
    });
  });
  return out;
}

export function exportGedcom(d: Dynasty, opts: { redactLiving?: boolean } = {}): string {
  const L: string[] = ['0 HEAD', '1 SOUR DYNASTY_CHRONICLE', '2 NAME Dynasty Chronicle', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8'];
  const x = new Map<string, string>();
  Object.keys(d.people).forEach((id, i) => x.set(id, `@I${i + 1}@`));
  const ux = new Map<string, string>();
  Object.keys(d.unions).forEach((id, i) => ux.set(id, `@F${i + 1}@`));

  for (const p of Object.values(d.people)) {
    const redact = opts.redactLiving && isLiving(p);
    L.push(`0 ${x.get(p.id)} INDI`);
    if (redact) {
      L.push(`1 NAME Living /${esc(p.surname)}/`);
    } else {
      L.push(`1 NAME ${esc(p.given)} /${esc(p.surname)}/`);
      if (p.given) L.push(`2 GIVN ${esc(p.given)}`);
      if (p.surname) L.push(`2 SURN ${esc(p.surname)}`);
      if (p.title) L.push(`2 NPFX ${esc(p.title)}`);
      if (p.epithet) L.push(`2 NICK ${esc(p.epithet)}`);
      if (p.birthSurname && p.birthSurname !== p.surname) L.push(`1 NAME ${esc(p.given)} /${esc(p.birthSurname)}/`, '2 TYPE birth');
      for (const a of p.altNames ?? []) L.push(`1 NAME ${esc(a)}`, '2 TYPE aka');
    }
    L.push(`1 SEX ${p.sex}`);
    if (!redact) {
      if (p.occupation) L.push(`1 OCCU ${esc(p.occupation)}`);
      for (const e of p.events) {
        const tag = EVENT_OUT[e.type] ?? 'EVEN';
        L.push(`1 ${tag}${tag === 'EVEN' || tag === 'TITL' ? ' ' + esc(e.label ?? '') : ''}`.trimEnd());
        if (tag === 'EVEN' && e.label) L.push(`2 TYPE ${esc(e.label)}`);
        if (e.date) {
          const g = parseDate(e.date).gedcom;
          L.push(`2 DATE ${g || esc(e.date)}`);
        }
        if (e.place) L.push(`2 PLAC ${esc(e.place)}`);
        if (e.source) L.push(`2 SOUR ${esc(e.source)}`);
        if (e.note) L.push(...wrapNote(2, 'NOTE', e.note));
      }
      if (p.bio) L.push(...wrapNote(1, 'NOTE', p.bio));
    }
    for (const u of Object.values(d.unions)) {
      if (u.partners.includes(p.id)) L.push(`1 FAMS ${ux.get(u.id)}`);
      const c = u.children.find((c) => c.id === p.id);
      if (c) {
        L.push(`1 FAMC ${ux.get(u.id)}`);
        if (c.kind === 'adopted' || c.kind === 'foster') L.push(`2 PEDI ${c.kind}`);
      }
    }
  }
  for (const u of Object.values(d.unions)) {
    L.push(`0 ${ux.get(u.id)} FAM`);
    const [a, b] = u.partners;
    const pa = d.people[a];
    const pb = d.people[b];
    const husb = pa?.sex === 'F' && pb ? b : a;
    const wife = husb === a ? b : a;
    if (husb && d.people[husb]) L.push(`1 ${d.people[husb].sex === 'F' ? 'WIFE' : 'HUSB'} ${x.get(husb)}`);
    if (wife && d.people[wife]) L.push(`1 ${d.people[wife].sex === 'M' ? 'HUSB' : 'WIFE'} ${x.get(wife)}`);
    for (const c of u.children) if (x.has(c.id)) L.push(`1 CHIL ${x.get(c.id)}`);
    if (u.date || u.place || u.status === 'married') {
      L.push('1 MARR');
      if (u.date) L.push(`2 DATE ${parseDate(u.date).gedcom || esc(u.date)}`);
      if (u.place) L.push(`2 PLAC ${esc(u.place)}`);
    }
    if (u.status === 'divorced') L.push('1 DIV Y');
  }
  L.push('0 TRLR');
  return L.join('\n') + '\n';
}
