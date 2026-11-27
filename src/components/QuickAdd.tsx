import { useEffect, useMemo, useRef, useState } from 'react';
import { actions, select, stamp, toast, useData, useUI } from '../store/store';
import type { Sex } from '../model/types';
import { uid } from '../model/types';
import { birthUnionsOf, fatherOf, fullName, lifespan, parentsOf, spousesOf, unionsOf } from '../model/graph';
import type { RelKind } from '../model/ops';

const REL_LABEL: Record<RelKind, string> = {
  father: 'Father',
  mother: 'Mother',
  parent: 'Parent',
  spouse: 'Spouse',
  child: 'Child',
  sibling: 'Sibling',
};

/** The one-step "add a relative" scroll that appears from the quick-add ring. */
export function QuickAdd() {
  const qa = useUI((s) => s.quickAdd);
  const d = useData((s) => s.d);
  if (!qa || !d.people[qa.anchorId]) return null;
  return <QuickAddForm key={qa.anchorId + qa.rel} />;
}

function QuickAddForm() {
  const qa = useUI((s) => s.quickAdd)!;
  const d = useData((s) => s.d);
  const anchor = d.people[qa.anchorId];
  const rel = qa.rel;

  const defaultSurname = useMemo(() => {
    if (rel === 'father' || rel === 'sibling') return anchor.birthSurname || anchor.surname;
    if (rel === 'child') {
      if (anchor.sex === 'M') return anchor.surname;
      const sp = spousesOf(d, anchor.id).map((s) => d.people[s.id]).find((p) => p?.sex === 'M');
      return sp?.surname || anchor.surname;
    }
    if (rel === 'mother') return '';
    return '';
  }, [anchor, d, rel]);

  const [given, setGiven] = useState('');
  const [surname, setSurname] = useState(defaultSurname);
  const [sex, setSex] = useState<Sex>(rel === 'father' ? 'M' : rel === 'mother' ? 'F' : rel === 'spouse' ? (anchor.sex === 'M' ? 'F' : anchor.sex === 'F' ? 'M' : 'U') : 'U');
  const [born, setBorn] = useState('');
  const [died, setDied] = useState('');
  const [known, setKnown] = useState('');
  const unions = unionsOf(d, anchor.id);
  const [unionId, setUnionId] = useState<string>(unions[0]?.id ?? '');
  const [linkMode, setLinkMode] = useState(false);
  const [query, setQuery] = useState('');
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => first.current?.focus(), [linkMode]);

  const twoParents = (rel === 'father' || rel === 'mother') && birthUnionsOf(d, anchor.id).some((u) => u.partners.length >= 2 && u.children.find((c) => c.id === anchor.id)?.kind === 'birth');
  const hasThatParent =
    (rel === 'father' && fatherOf(d, anchor.id)) || (rel === 'mother' && parentsOf(d, anchor.id).some((p) => d.people[p.id]?.sex === 'F' && p.kind === 'birth'));

  const close = () => useUI.setState({ quickAdd: undefined });

  const finish = (id: string, name: string) => {
    close();
    stamp();
    toast(`${name} joins the chronicle as ${REL_LABEL[rel].toLowerCase()} of ${fullName(anchor)}.`);
    setTimeout(() => select(id), 60);
  };

  const submit = (placeholder = false) => {
    const events = [];
    if (born.trim()) events.push({ id: uid('e'), type: 'birth' as const, date: born.trim(), confidence: 'probable' as const });
    if (died.trim()) events.push({ id: uid('e'), type: 'death' as const, date: died.trim(), confidence: 'probable' as const });
    const isPh = placeholder || (!given.trim() && !born.trim());
    const id = actions.addRelative(
      anchor.id,
      rel,
      {
        given: given.trim(),
        surname: surname.trim(),
        birthSurname: rel === 'spouse' || rel === 'mother' ? surname.trim() || undefined : undefined,
        sex,
        events,
        occupation: known.trim() || undefined,
        placeholder: isPh || undefined,
        living: died.trim() ? 'deceased' : 'auto',
      },
      { unionId: rel === 'child' ? unionId || undefined : undefined },
    );
    finish(id, isPh ? 'An unknown soul' : `${given} ${surname}`.trim());
  };

  const linkExisting = (pid: string) => {
    const id = actions.addRelative(anchor.id, rel, {}, { existingId: pid, unionId: rel === 'child' ? unionId || undefined : undefined });
    finish(id, fullName(d.people[pid]));
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return Object.values(d.people)
      .filter((p) => p.id !== anchor.id && `${p.given} ${p.surname} ${p.birthSurname ?? ''}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [d.people, query, anchor.id]);

  // Position near the click, kept on screen
  const W = 320;
  const left = Math.min(Math.max(12, qa.x - W / 2), window.innerWidth - W - 12);
  const top = Math.min(Math.max(70, qa.y + 16), window.innerHeight - 450);

  return (
    <div className="popover quick-add" style={{ left, top, width: W }} data-nopan onKeyDown={(e) => e.key === 'Escape' && close()} role="dialog" aria-label={`Add ${REL_LABEL[rel]}`}>
      <div className="popover-head">
        <span className="seal-mini">✦</span>
        <div>
          <div className="popover-title">Add {REL_LABEL[rel].toLowerCase()}</div>
          <div className="popover-sub">of {fullName(anchor)}</div>
        </div>
        <button className="icon-btn" onClick={close} aria-label="Close">
          ✕
        </button>
      </div>
      {hasThatParent && <p className="note">A {rel} is already recorded; this will be added as an adoptive / step parent.</p>}
      {!hasThatParent && twoParents && <p className="note">Two parents are already recorded; this will be added as an adoptive / step parent.</p>}
      <div className="tabs-mini">
        <button className={!linkMode ? 'on' : ''} onClick={() => setLinkMode(false)}>
          New person
        </button>
        <button className={linkMode ? 'on' : ''} onClick={() => setLinkMode(true)}>
          Link existing
        </button>
      </div>
      {rel === 'child' && unions.length > 1 && (
        <label className="field">
          <span>With partner</span>
          <select value={unionId} onChange={(e) => setUnionId(e.target.value)}>
            {unions.map((u) => {
              const other = u.partners.find((p) => p !== anchor.id);
              return (
                <option key={u.id} value={u.id}>
                  {other ? fullName(d.people[other]) : 'Unknown partner'}
                </option>
              );
            })}
          </select>
        </label>
      )}
      {!linkMode ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="row2">
            <label className="field">
              <span>Given name</span>
              <input ref={first} value={given} onChange={(e) => setGiven(e.target.value)} placeholder="e.g. Rose" />
            </label>
            <label className="field">
              <span>Surname</span>
              <input value={surname} onChange={(e) => setSurname(e.target.value)} />
            </label>
          </div>
          <div className="sex-toggle" role="radiogroup" aria-label="Sex">
            {(['M', 'F', 'U'] as Sex[]).map((s) => (
              <button type="button" key={s} className={sex === s ? 'on' : ''} onClick={() => setSex(s)} role="radio" aria-checked={sex === s}>
                {s === 'M' ? '♂ Male' : s === 'F' ? '♀ Female' : '? Unknown'}
              </button>
            ))}
          </div>
          <div className="row2">
            <label className="field">
              <span>Born</span>
              <input value={born} onChange={(e) => setBorn(e.target.value)} placeholder="c. 1850" />
            </label>
            <label className="field">
              <span>Died</span>
              <input value={died} onChange={(e) => setDied(e.target.value)} placeholder="bef. 1920" />
            </label>
          </div>
          <label className="field">
            <span>Occupation / known for</span>
            <input value={known} onChange={(e) => setKnown(e.target.value)} placeholder="e.g. Teacher, Tea planter, Cricketer" />
          </label>
          <div className="popover-actions">
            <button type="button" className="btn ghost" onClick={() => submit(true)} title="Create an empty slot to fill in later">
              Add as unknown
            </button>
            <button type="submit" className="btn primary">
              Seal it ⏎
            </button>
          </div>
        </form>
      ) : (
        <div>
          <label className="field">
            <span>Search the chronicle</span>
            <input ref={first} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a name…" />
          </label>
          <ul className="pick-list">
            {matches.map((p) => (
              <li key={p.id}>
                <button onClick={() => linkExisting(p.id)}>
                  <strong>{fullName(p)}</strong> <span className="muted">{lifespan(p)}</span>
                </button>
              </li>
            ))}
            {query && !matches.length && <li className="muted">No one by that name.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
