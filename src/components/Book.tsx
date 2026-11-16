import { useMemo, useState } from 'react';
import { useData, useUI } from '../store/store';
import { computeLayout } from '../layout/familyLayout';
import { birthDate, deathDate, eventOf, fullName, houseArms, isLiving, lifespan, spousesOf, unionsOf } from '../model/graph';
import { parseDate, sortKey } from '../model/dates';
import { resolveArms } from '../model/arms';
import { blazon } from '../model/heraldry';
import { Shield } from './Shield';
import type { Person } from '../model/types';

const ORD = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

/** The Book of the House — an illuminated, printable chronicle, one chapter per generation. */
export function Book() {
  const d = useData((s) => s.d);
  const [seal, setSeal] = useState(true);
  const chapters = useMemo(() => {
    const L = computeLayout(d, { rootId: d.rootId, mode: 'family', collapsedDown: new Set(), collapsedUp: new Set() });
    const byGen = new Map<number, Person[]>();
    for (const n of L.nodes.values()) {
      const p = d.people[n.id];
      if (!p || p.placeholder) continue;
      byGen.set(n.gen, [...(byGen.get(n.gen) ?? []), p]);
    }
    return [...byGen.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, ps]) => ps.sort((a, b) => sortKey(birthDate(a)) - sortKey(birthDate(b))));
  }, [d]);
  const mainSurname = d.people[d.rootId ?? '']?.surname ?? '';
  const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const hide = (p: Person) => seal && isLiving(p);

  return (
    <div className="book-overlay" data-nopan>
      <div className="book-bar">
        <label className="check">
          <input type="checkbox" checked={seal} onChange={(e) => setSeal(e.target.checked)} /> Seal the living
        </label>
        <button className="btn primary" onClick={() => window.print()}>
          🖨 Print / save as PDF
        </button>
        <button className="btn" onClick={() => useUI.setState({ bookOpen: false })}>
          Close the book
        </button>
      </div>
      <article className="book">
        <section className="book-title">
          <Shield arms={houseArms(d, mainSurname)} size={150} />
          <h1>{d.name}</h1>
          {d.motto && <p className="book-motto">“{d.motto}”</p>}
          <p className="book-blazon">{blazon(houseArms(d, mainSurname))}</p>
          <p className="book-colophon">A chronicle of {Object.values(d.people).filter((p) => !p.placeholder).length} souls, set down on {today}.</p>
        </section>
        {chapters.map((people, gi) => (
          <section key={gi} className="book-chapter">
            <h2>
              <span className="roman">{ROMAN[gi] ?? gi + 1}</span>
              The {ORD[gi] ?? `${gi + 1}th`} Generation
            </h2>
            {people.map((p) => {
              if (hide(p))
                return (
                  <div key={p.id} className="book-entry sealed-entry">
                    <h3>A living member of House {p.surname}</h3>
                  </div>
                );
              const r = resolveArms(d, p.id);
              const b = eventOf(p, 'birth');
              const dd = eventOf(p, 'death');
              const unions = unionsOf(d, p.id);
              return (
                <div key={p.id} className="book-entry">
                  <div className="book-entry-head">
                    <Shield arms={r.arms} shape={r.shape} cadency={r.cadency} size={40} />
                    <div>
                      <h3>
                        {p.title && `${p.title} `}
                        {fullName(p)}
                        {p.epithet && <em> {p.epithet}</em>}
                      </h3>
                      <div className="book-life">
                        {lifespan(p)}
                        {p.occupation && ` · ${p.occupation}`}
                      </div>
                    </div>
                  </div>
                  <p className="book-facts">
                    {b && (b.date || b.place) && (
                      <>
                        Born {parseDate(birthDate(p)).display}
                        {b.place && ` at ${b.place}`}.{' '}
                      </>
                    )}
                    {unions.map((u) => {
                      const other = u.partners.find((x) => x !== p.id);
                      const op = other ? d.people[other] : undefined;
                      const kids = u.children.map((c) => d.people[c.id]).filter(Boolean);
                      return (
                        <span key={u.id}>
                          {op && (
                            <>
                              {u.status === 'partners' ? 'Partnered with' : 'Wed'} {hide(op) ? 'a living member of the family' : fullName(op)}
                              {u.date && ` ${parseDate(u.date).day ? 'on' : 'in'} ${parseDate(u.date).display}`}
                              {u.place && ` at ${u.place}`}
                              {u.status === 'divorced' && ' (later divorced)'}.{' '}
                            </>
                          )}
                          {kids.length > 0 && (
                            <>
                              {kids.length === 1 ? 'Their child: ' : 'Their children: '}
                              {kids.map((k) => (hide(k) ? 'a living child' : k.given || 'unknown')).join(', ')}.{' '}
                            </>
                          )}
                        </span>
                      );
                    })}
                    {dd && (dd.date || dd.place) && (
                      <>
                        Died {parseDate(deathDate(p)).display}
                        {dd.place && ` at ${dd.place}`}.
                      </>
                    )}
                    {spousesOf(d, p.id).length === 0 && !b && !dd && <span className="muted">Little is yet known.</span>}
                  </p>
                  {p.bio &&
                    p.bio
                      .trim()
                      .split(/\n\s*\n/)
                      .map((para, i) => (
                        <p key={i} className={i === 0 ? 'dropcap' : ''}>
                          {para}
                        </p>
                      ))}
                </div>
              );
            })}
          </section>
        ))}
        <p className="book-finis">❦ Finis ❦</p>
      </article>
    </div>
  );
}
