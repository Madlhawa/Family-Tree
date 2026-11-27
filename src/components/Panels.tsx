import { useMemo, useState } from 'react';
import { actions, askConfirm, camera, commit, redo, replaceDynasty, select, stamp, toast, undo, useData, useUI, type PanelId } from '../store/store';
import type { Dynasty, Person } from '../model/types';
import { uid } from '../model/types';
import {
  birthYear,
  childrenOf,
  deathYear,
  fullName,
  houseArms,
  houseColor,
  houseOf,
  isLiving,
  lifespan,
  parentsOf,
  spousesOf,
  unionsOf,
} from '../model/graph';
import { allWarnings, findDuplicates } from '../model/validate';
import { parseDictation, type DictEntry } from '../model/dictation';
import { addRelative } from '../model/ops';
import { exportGedcom, importGedcom } from '../model/gedcom';
import { sampleDynasty } from '../model/sample';
import { proceduralArms } from '../model/heraldry';
import { CURRENT_YEAR } from '../model/dates';
import { Shield } from './Shield';
import { ArmsEditor } from './ArmsEditor';
import { Face } from './PersonCard';
import { download, pickFile, readAsText, slug } from '../ui/files';

const TITLES: Record<PanelId, string> = {
  houses: 'The Houses',
  records: 'Hall of Records',
  warnings: 'Herald’s Warnings',
  sagas: 'Sagas',
  heirlooms: 'Heirlooms',
  dictation: 'Scribe’s Dictation',
  annals: 'The Annals',
  treasury: 'The Treasury',
  help: 'Guide & Shortcuts',
};

export function Panel() {
  const panel = useUI((s) => s.panel);
  const extras = useUI((s) => s.extras);
  if (!panel) return null;
  const title = panel === 'houses' && !extras ? 'Families' : TITLES[panel];
  return (
    <aside className="drawer panel" data-nopan aria-label={title}>
      <header className="panel-head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={() => useUI.setState({ panel: null })} aria-label="Close panel">
          ✕
        </button>
      </header>
      <div className="panel-body">
        {panel === 'houses' && <Houses />}
        {panel === 'records' && <Records />}
        {panel === 'warnings' && <Warnings />}
        {panel === 'sagas' && <Sagas />}
        {panel === 'heirlooms' && <Heirlooms />}
        {panel === 'dictation' && <Dictation />}
        {panel === 'annals' && <Annals />}
        {panel === 'treasury' && <Treasury />}
        {panel === 'help' && <Help />}
      </div>
    </aside>
  );
}

const go = (id: string) => {
  select(id);
  camera.flyTo(id);
};

function PersonChip({ id }: { id: string }) {
  const d = useData((s) => s.d);
  const p = d.people[id];
  if (!p) return <span className="muted">(removed)</span>;
  return (
    <button className="person-link" onClick={() => go(id)}>
      <Face p={p} color={houseColor(d, houseOf(p))} size={22} />
      <span>{fullName(p)}</span>
      <span className="muted">{lifespan(p)}</span>
    </button>
  );
}

// ---------------------------------------------------------------- Houses

function Houses() {
  const d = useData((s) => s.d);
  const hl = useUI((s) => s.highlightHouse);
  const extras = useUI((s) => s.extras);
  const [editing, setEditing] = useState<string | null>(null);
  const houses = useMemo(() => {
    const m = new Map<string, Person[]>();
    for (const p of Object.values(d.people)) {
      if (p.placeholder) continue;
      const h = houseOf(p);
      if (!h) continue;
      m.set(h, [...(m.get(h) ?? []), p]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [d.people]);
  return (
    <div className="houses">
      <p className="hint">
        {extras
          ? 'A House is everyone born to a surname. Click a House to light it up on the tree; give it arms and a motto of its own.'
          : 'Everyone grouped by the surname they were born with. Click a family to highlight it on the tree.'}
      </p>
      {houses.map(([name, members]) => {
        const info = d.houses[name];
        const years = members.map(birthYear).filter((y): y is number => y !== undefined);
        return (
          <div key={name} className={`house-card ${hl === name ? 'on' : ''}`} style={{ ['--house' as any]: houseColor(d, name) }}>
            <button className="house-main" onClick={() => useUI.setState({ highlightHouse: hl === name ? undefined : name })}>
              {extras ? <Shield arms={houseArms(d, name)} size={42} /> : <span className="family-dot" aria-hidden />}
              <div>
                <div className="house-name">{extras ? `House ${name}` : `${name} family`}</div>
                {extras && info?.motto && <div className="house-motto">“{info.motto}”</div>}
                <div className="muted small">
                  {members.length} {members.length > 1 ? 'people' : 'person'}
                  {years.length > 0 && ` · since ${Math.min(...years)}`}
                </div>
              </div>
            </button>
            {extras && (
              <button className="link" onClick={() => setEditing(editing === name ? null : name)}>
                {editing === name ? 'Done' : 'Arms & motto'}
              </button>
            )}
            {extras && editing === name && (
              <div className="house-edit">
                <label className="field">
                  <span>Motto</span>
                  <input
                    defaultValue={info?.motto ?? ''}
                    onBlur={(e) =>
                      commit(`Gave House ${name} a motto`, (dr) => {
                        dr.houses[name] = { ...(dr.houses[name] ?? { surname: name }), motto: e.target.value || undefined };
                      })
                    }
                  />
                </label>
                <ArmsEditor
                  arms={info?.arms ?? proceduralArms(name)}
                  onChange={(a) =>
                    commit(`Redrew the arms of House ${name}`, (dr) => {
                      dr.houses[name] = { ...(dr.houses[name] ?? { surname: name }), arms: a };
                    })
                  }
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Records

function Bar({ label, value, max, sub }: { label: string; value: number; max: number; sub?: string }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </span>
      <span className="bar-value">{sub ?? value}</span>
    </div>
  );
}

function Records() {
  const d = useData((s) => s.d);
  const stats = useMemo(() => {
    const people = Object.values(d.people).filter((p) => !p.placeholder);
    const lifespans = people
      .map((p) => ({ p, b: birthYear(p), dd: deathYear(p) }))
      .filter((x) => x.b !== undefined && x.dd !== undefined)
      .map((x) => ({ p: x.p, b: x.b!, age: x.dd! - x.b! }));
    const longest = [...lifespans].sort((a, b) => b.age - a.age).slice(0, 5);
    const families = people.map((p) => ({ p, n: childrenOf(d, p.id).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 5);
    const byCentury = new Map<number, number[]>();
    for (const l of lifespans) {
      const c = Math.floor(l.b / 100) * 100;
      byCentury.set(c, [...(byCentury.get(c) ?? []), l.age]);
    }
    const centuries = [...byCentury.entries()].sort((a, b) => a[0] - b[0]).map(([c, ages]) => ({ c, avg: Math.round(ages.reduce((s, x) => s + x, 0) / ages.length), n: ages.length }));
    const names = new Map<string, number>();
    for (const p of people) {
      const g = p.given.split(' ')[0];
      if (g) names.set(g, (names.get(g) ?? 0) + 1);
    }
    const topNames = [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const callings = new Map<string, number>();
    for (const p of people) if (p.occupation) callings.set(p.occupation, (callings.get(p.occupation) ?? 0) + 1);
    const years = people.map(birthYear).filter((y): y is number => y !== undefined);
    const houses = new Set(people.map(houseOf).filter(Boolean));
    // Fog of war: ancestors discovered per generation of the home person
    const fog: { g: number; known: number; possible: number }[] = [];
    if (d.rootId) {
      let gen = [d.rootId];
      for (let g = 1; g <= 8; g++) {
        gen = gen.flatMap((id) => parentsOf(d, id).filter((p) => p.kind === 'birth' && !d.people[p.id]?.placeholder).map((p) => p.id));
        fog.push({ g, known: new Set(gen).size, possible: 2 ** g });
      }
    }
    return { people, longest, families, centuries, topNames, callings, years, houses, fog, living: people.filter(isLiving).length };
  }, [d]);
  const genLabel = (g: number) => ['', 'Parents', 'Grandparents', 'Great-grandparents', '2× great', '3× great', '4× great', '5× great', '6× great'][g];
  const totalKnown = stats.fog.reduce((s, f) => s + f.known, 0);
  const totalPossible = stats.fog.reduce((s, f) => s + f.possible, 0);
  return (
    <div className="records">
      <div className="stat-tiles">
        <div className="tile">
          <b>{stats.people.length}</b>
          <span>souls recorded</span>
        </div>
        <div className="tile">
          <b>{stats.houses.size}</b>
          <span>houses</span>
        </div>
        <div className="tile">
          <b>{stats.years.length ? Math.min(...stats.years) : '—'}</b>
          <span>earliest birth</span>
        </div>
        <div className="tile">
          <b>{stats.living}</b>
          <span>living</span>
        </div>
      </div>

      <section>
        <h4>The Fog of War</h4>
        <p className="hint">
          How much of {d.rootId ? fullName(d.people[d.rootId]) : 'the home person'}’s ancestry has been discovered — {totalPossible ? Math.round((totalKnown / totalPossible) * 100) : 0}% of eight generations.
        </p>
        {stats.fog.map((f) => (
          <Bar key={f.g} label={genLabel(f.g)} value={f.known} max={f.possible} sub={`${f.known}/${f.possible}`} />
        ))}
      </section>

      <section>
        <h4>Longest-lived</h4>
        {stats.longest.map((l) => (
          <div key={l.p.id} className="record-row">
            <PersonChip id={l.p.id} />
            <b>{l.age} yrs</b>
          </div>
        ))}
        {!stats.longest.length && <p className="muted">Needs birth and death years.</p>}
      </section>

      <section>
        <h4>Largest families</h4>
        {stats.families.map((f) => (
          <div key={f.p.id} className="record-row">
            <PersonChip id={f.p.id} />
            <b>{f.n} children</b>
          </div>
        ))}
      </section>

      <section>
        <h4>Average lifespan by century of birth</h4>
        {stats.centuries.map((c) => (
          <Bar key={c.c} label={`${c.c}s`} value={c.avg} max={100} sub={`${c.avg} yrs (${c.n})`} />
        ))}
      </section>

      <section>
        <h4>Names that echo down the line</h4>
        {stats.topNames.map(([n, c]) => (
          <Bar key={n} label={n} value={c} max={stats.topNames[0]?.[1] ?? 1} />
        ))}
      </section>

      {stats.callings.size > 0 && (
        <section>
          <h4>Callings</h4>
          <p>
            {[...stats.callings.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => `${k}${v > 1 ? ` ×${v}` : ''}`)
              .join(' · ')}
          </p>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Warnings

function Warnings() {
  const d = useData((s) => s.d);
  const warnings = allWarnings(d);
  const dups = useMemo(() => findDuplicates(d), [d]);
  const list = [...warnings.entries()];
  return (
    <div className="warnings">
      <p className="hint">The herald checks every date and link for the impossible and the improbable. Nothing here blocks you — it is advice.</p>
      {list.length === 0 && dups.length === 0 && <p className="all-clear">⚜ All is in order. The herald finds no fault.</p>}
      {list.map(([id, ws]) => (
        <div key={id} className="warn-card">
          <PersonChip id={id} />
          <ul>
            {ws.map((w, i) => (
              <li key={i} className={w.severity}>
                {w.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {dups.length > 0 && (
        <section>
          <h4>Possibly the same person</h4>
          {dups.map(([a, b]) => (
            <div key={a + b} className="warn-card dup">
              <div className="dup-pair">
                <PersonChip id={a} />
                <PersonChip id={b} />
              </div>
              <div className="dup-actions">
                <button className="btn" onClick={() => actions.merge(a, b)}>
                  Merge into first
                </button>
                <button className="btn ghost" onClick={() => actions.merge(b, a)}>
                  Merge into second
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Sagas

function Sagas() {
  const d = useData((s) => s.d);
  const selectedId = useUI((s) => s.selectedId);
  const [editing, setEditing] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const sagas = Object.values(d.sagas);
  const create = () => {
    const id = uid('s');
    commit('Began a new saga', (dr) => {
      dr.sagas[id] = { id, title: 'A New Saga', steps: [] };
    });
    setEditing(id);
  };
  return (
    <div className="sagas">
      <p className="hint">A saga is a guided tour through the tree: each chapter flies to a person with a caption. Perfect for family gatherings.</p>
      {sagas.map((s) => (
        <div key={s.id} className="saga-card">
          {editing === s.id ? (
            <>
              <input
                className="saga-title-input"
                defaultValue={s.title}
                onBlur={(e) =>
                  commit('Renamed a saga', (dr) => {
                    dr.sagas[s.id].title = e.target.value || 'Untitled saga';
                  })
                }
              />
              <ol className="saga-steps">
                {s.steps.map((st, i) => (
                  <li key={i}>
                    <PersonChip id={st.personId} />
                    <textarea
                      defaultValue={st.caption}
                      rows={2}
                      onBlur={(e) =>
                        commit('Edited a saga chapter', (dr) => {
                          dr.sagas[s.id].steps[i].caption = e.target.value;
                        })
                      }
                    />
                    <div className="step-actions">
                      <button className="link" disabled={i === 0} onClick={() => commit('Reordered a saga', (dr) => void dr.sagas[s.id].steps.splice(i - 1, 0, ...dr.sagas[s.id].steps.splice(i, 1)))}>
                        ↑
                      </button>
                      <button className="link danger" onClick={() => commit('Removed a saga chapter', (dr) => void dr.sagas[s.id].steps.splice(i, 1))}>
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="saga-add">
                <p className="small muted">{selectedId ? `Selected on the tree: ${fullName(d.people[selectedId])}` : 'Select someone on the tree to add a chapter.'}</p>
                <textarea rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption for this chapter…" />
                <button
                  className="btn"
                  disabled={!selectedId}
                  onClick={() => {
                    commit('Added a saga chapter', (dr) => void dr.sagas[s.id].steps.push({ personId: selectedId!, caption }));
                    setCaption('');
                  }}
                >
                  + Add chapter
                </button>
              </div>
              <div className="form-actions">
                <button className="btn danger ghost" onClick={() => askConfirm('Delete this saga?', 'Delete', true).then((ok) => ok && commit('Deleted a saga', (dr) => void delete dr.sagas[s.id]))}>
                  Delete saga
                </button>
                <button className="btn primary" onClick={() => setEditing(null)}>
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="saga-name">{s.title}</div>
              <div className="muted small">{s.steps.length} chapters</div>
              <div className="saga-buttons">
                <button
                  className="btn primary"
                  disabled={!s.steps.length}
                  onClick={() => useUI.setState({ saga: { id: s.id, step: 0 }, panel: null, mode: 'family', dossierId: undefined })}
                >
                  ▶ Play
                </button>
                <button className="btn ghost" onClick={() => setEditing(s.id)}>
                  Edit
                </button>
              </div>
            </>
          )}
        </div>
      ))}
      <button className="btn" onClick={create}>
        + Begin a new saga
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Heirlooms

function Heirlooms() {
  const d = useData((s) => s.d);
  const selectedId = useUI((s) => s.selectedId);
  const [name, setName] = useState('');
  return (
    <div className="heirlooms">
      <p className="hint">Rings, swords, bibles, recipes — trace the chain of custody of the objects that outlived their owners.</p>
      {Object.values(d.heirlooms).map((h) => (
        <div key={h.id} className="heirloom-card">
          <input
            className="heirloom-name"
            defaultValue={h.name}
            onBlur={(e) =>
              commit('Renamed an heirloom', (dr) => {
                dr.heirlooms[h.id].name = e.target.value || 'Unnamed heirloom';
              })
            }
          />
          <textarea
            rows={2}
            defaultValue={h.description ?? ''}
            placeholder="Description, provenance, where it is now…"
            onBlur={(e) =>
              commit('Described an heirloom', (dr) => {
                dr.heirlooms[h.id].description = e.target.value || undefined;
              })
            }
          />
          <ol className="custody">
            {h.custodians.map((c, i) => (
              <li key={c + i}>
                <PersonChip id={c} />
                <button className="link danger" onClick={() => commit('Edited a chain of custody', (dr) => void dr.heirlooms[h.id].custodians.splice(i, 1))} aria-label="Remove custodian">
                  ✕
                </button>
              </li>
            ))}
          </ol>
          <div className="row-actions">
            <button className="btn" disabled={!selectedId} onClick={() => commit('Passed on an heirloom', (dr) => void dr.heirlooms[h.id].custodians.push(selectedId!))}>
              + Pass to {selectedId ? fullName(d.people[selectedId]) : 'selected person'}
            </button>
            <button className="link danger" onClick={() => askConfirm('Remove this heirloom?', 'Remove', true).then((ok) => ok && commit('Removed an heirloom', (dr) => void delete dr.heirlooms[h.id]))}>
              Remove
            </button>
          </div>
        </div>
      ))}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const id = uid('h');
          commit(`Recorded the heirloom “${name}”`, (dr) => {
            dr.heirlooms[id] = { id, name: name.trim(), custodians: selectedId ? [selectedId] : [] };
          });
          setName('');
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New heirloom name" />
        <button className="btn" type="submit">
          Add
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- Dictation

const EXAMPLE = `father: John Smith (1850-1920)
mother: Mary Jones (c. 1855)
spouse: Alys Varden (1880) m. 1902
children: Tom (1903), Rose (F, 1905), Hal (b. 1909, d. 1944)
siblings: Anne (F, 1878), Peter`;

function Dictation() {
  const d = useData((s) => s.d);
  const selectedId = useUI((s) => s.selectedId);
  const [text, setText] = useState('');
  const anchor = selectedId ? d.people[selectedId] : undefined;
  const parsed = useMemo(() => parseDictation(text), [text]);

  const commitAll = () => {
    if (!anchor) return;
    const n = parsed.entries.length;
    commit(`Took dictation: ${n} relative${n === 1 ? '' : 's'} of ${fullName(anchor)}`, (dr) => {
      const spouseIds: string[] = [];
      const order = (e: DictEntry) => (e.role === 'spouse' ? 0 : e.role === 'child' ? 2 : 1);
      for (const e of [...parsed.entries].sort((a, b) => order(a) - order(b))) {
        const events = [];
        if (e.born) events.push({ id: uid('e'), type: 'birth' as const, date: e.born, confidence: 'probable' as const });
        if (e.died) events.push({ id: uid('e'), type: 'death' as const, date: e.died, confidence: 'probable' as const });
        let surname = e.surname;
        if (!surname && (e.role === 'child' || e.role === 'sibling' || e.role === 'father')) {
          const dad = e.role === 'child' ? (anchor.sex === 'M' ? anchor : spouseIds.map((s) => dr.people[s]).find((p) => p?.sex === 'M') ?? anchor) : anchor;
          surname = dad.surname;
        }
        let unionId: string | undefined;
        if (e.role === 'child' && spouseIds.length === 1) {
          unionId = Object.values(dr.unions).find((u) => u.partners.includes(anchor.id) && u.partners.includes(spouseIds[0]))?.id;
        }
        const id = addRelative(
          dr,
          anchor.id,
          e.role,
          { given: e.given, surname: surname ?? '', birthSurname: e.role === 'spouse' || e.role === 'mother' ? e.surname : undefined, sex: e.sex, events },
          { unionId },
        );
        if (e.role === 'spouse') {
          spouseIds.push(id);
          if (e.married) {
            const u = Object.values(dr.unions).find((u) => u.partners.includes(anchor.id) && u.partners.includes(id));
            if (u) u.date = e.married;
          }
        }
      }
    });
    stamp();
    toast(`${n} relative${n === 1 ? '' : 's'} added to the chronicle.`);
    setText('');
  };

  return (
    <div className="dictation">
      <p className="hint">
        Dictate a whole family in one go. Lines start with a role — <code>father</code>, <code>mother</code>, <code>spouse</code>, <code>children</code>, <code>siblings</code> (or <code>sons</code>,{' '}
        <code>daughters</code>, <code>wife</code>…). Dates go in brackets; add <code>F</code>/<code>M</code> for sex and <code>m. 1902</code> for a wedding.
      </p>
      <div className="dictation-anchor">
        {anchor ? (
          <>
            Relatives of <PersonChip id={anchor.id} />
          </>
        ) : (
          <span className="muted">Select someone on the tree first.</span>
        )}
      </div>
      <textarea className="dictation-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} />
      {!text && (
        <button className="link" onClick={() => setText(EXAMPLE)}>
          Use the example
        </button>
      )}
      {parsed.errors.length > 0 && (
        <ul className="herald-warn">
          {parsed.errors.map((e) => (
            <li key={e}>⚠ {e}</li>
          ))}
        </ul>
      )}
      {parsed.entries.length > 0 && (
        <div className="dictation-preview">
          <h4>The scribe has written:</h4>
          <ul>
            {parsed.entries.map((e, i) => (
              <li key={i}>
                <span className="tag">{e.role}</span> {e.given} {e.surname ?? <em className="muted">(surname inferred)</em>} {e.sex !== 'U' && <span className="muted">{e.sex === 'M' ? '♂' : '♀'}</span>}{' '}
                {(e.born || e.died) && (
                  <span className="muted">
                    {e.born ?? '?'}
                    {e.died ? ` – ${e.died}` : ''}
                  </span>
                )}
                {e.married && <span className="muted"> · wed {e.married}</span>}
              </li>
            ))}
          </ul>
          <button className="btn primary" disabled={!anchor} onClick={commitAll}>
            Seal {parsed.entries.length} into the chronicle
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Annals

function Annals() {
  const annals = useData((s) => s.d.annals);
  const past = useData((s) => s.past.length);
  const future = useData((s) => s.future.length);
  return (
    <div className="annals">
      <div className="row-actions">
        <button className="btn" onClick={undo} disabled={!past}>
          ↶ Undo
        </button>
        <button className="btn" onClick={redo} disabled={!future}>
          ↷ Redo
        </button>
      </div>
      <ol className="annal-list">
        {[...annals]
          .reverse()
          .slice(0, 200)
          .map((a) => (
            <li key={a.id}>
              <time>{new Date(a.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>
              <span>{a.text}</span>
            </li>
          ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- Treasury

function Treasury() {
  const d = useData((s) => s.d);
  const plain = useUI((s) => s.plain);
  const crests = useUI((s) => s.crests);
  const extras = useUI((s) => s.extras);
  const [redact, setRedact] = useState(true);
  const savedAt = useData((s) => s.savedAt);

  const importFile = async () => {
    const f = await pickFile('.ged,.gedcom,.json,text/plain,application/json');
    if (!f) return;
    const text = await readAsText(f);
    try {
      let next: Dynasty;
      if (f.name.toLowerCase().endsWith('.json')) {
        next = JSON.parse(text);
        if (next.version !== 1 || !next.people || !next.unions) throw new Error('Not a Dynasty Chronicle file');
        next.houses ??= {};
        next.heirlooms ??= {};
        next.sagas ??= {};
        next.annals ??= [];
      } else {
        next = importGedcom(text, f.name.replace(/\.[^.]+$/, ''));
      }
      if (Object.keys(d.people).length && !(await askConfirm(`Replace the current tree (${Object.keys(d.people).length} people) with “${f.name}” (${Object.keys(next.people).length} people)? Ctrl+Z undoes this.`, 'Replace'))) return;
      replaceDynasty(next);
      setTimeout(() => camera.fit(), 100);
      toast(`Imported ${Object.keys(next.people).length} people.`);
    } catch (e) {
      toast(`Could not import: ${(e as Error).message}`);
    }
  };

  const redacted = (): Dynasty => {
    if (!redact) return d;
    const copy: Dynasty = JSON.parse(JSON.stringify(d));
    for (const p of Object.values(copy.people)) {
      if (!isLiving(p)) continue;
      Object.assign(p, { given: 'Living', events: [], media: [], links: [], socials: [], bio: undefined, portrait: undefined, altNames: [], occupation: undefined, epithet: undefined });
    }
    return copy;
  };

  return (
    <div className="treasury">
      <section>
        <h4>{extras ? 'The Dynasty' : 'Your tree'}</h4>
        <label className="field">
          <span>Tree name</span>
          <input defaultValue={d.name} onBlur={(e) => e.target.value !== d.name && commit('Renamed the dynasty', (dr) => void (dr.name = e.target.value || 'Unnamed Dynasty'))} />
        </label>
        {extras && (
          <label className="field">
            <span>Motto</span>
            <input defaultValue={d.motto ?? ''} onBlur={(e) => e.target.value !== (d.motto ?? '') && commit('Chose a new motto', (dr) => void (dr.motto = e.target.value || undefined))} />
          </label>
        )}
        <p className="muted small">
          {Object.keys(d.people).length} people · saved in this browser{savedAt ? ` at ${new Date(savedAt).toLocaleTimeString()}` : ''}. Nothing leaves your device unless you export it.
        </p>
      </section>
      <section>
        <h4>Export</h4>
        <label className="check">
          <input type="checkbox" checked={redact} onChange={(e) => setRedact(e.target.checked)} /> Seal the living (privacy-safe for sharing)
        </label>
        <div className="row-actions">
          <button className="btn" onClick={() => download(`${slug(d.name)}.ged`, exportGedcom(d, { redactLiving: redact }), 'text/plain')}>
            ⇩ GEDCOM (.ged)
          </button>
          <button className="btn" onClick={() => download(`${slug(d.name)}.json`, JSON.stringify(redacted(), null, 1), 'application/json')}>
            ⇩ Full backup (.json)
          </button>
        </div>
        <p className="hint">GEDCOM works with Ancestry, FamilySearch, MyHeritage, Gramps and nearly every genealogy program. The JSON backup keeps everything — arms, portraits, sagas.</p>
      </section>
      <section>
        <h4>Import</h4>
        <button className="btn" onClick={importFile}>
          ⇧ Import GEDCOM or backup
        </button>
      </section>
      <section>
        <h4>Appearance</h4>
        <label className="check">
          <input type="checkbox" checked={plain} onChange={(e) => useUI.setState({ plain: e.target.checked })} /> Clear Ledger — tone down ornament for heavy editing
        </label>
        <label className="check">
          <input type="checkbox" checked={extras} onChange={(e) => useUI.setState({ extras: e.target.checked })} /> Show heraldry &amp; dynasty extras (coats of arms, epithets, mottos)
        </label>
        {extras && (
          <label className="check">
            <input type="checkbox" checked={crests} onChange={(e) => useUI.setState({ crests: e.target.checked })} /> Show coats of arms on tiles that have no photo
          </label>
        )}
      </section>
      <section>
        <h4>Begin anew</h4>
        <div className="row-actions">
          <button className="btn primary" onClick={() => useUI.setState({ newTreeOpen: true })}>
            ✦ Start a new family tree
          </button>
          <button className="btn ghost" onClick={() => askConfirm('Replace the current tree with the House Ashcombe demo? Ctrl+Z undoes this.', 'Load demo').then((ok) => ok && replaceDynasty(sampleDynasty()))}>
            Load the demo dynasty
          </button>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Help

function Help() {
  const rows: [string, string][] = [
    ['Click', 'Select a person — the quick-add ring appears'],
    ['Double-click / Enter', 'Open the dossier'],
    ['Drag · wheel · pinch', 'Pan and zoom the realm'],
    ['P / M', 'Add father / mother to the selected person'],
    ['S', 'Add spouse'],
    ['C', 'Add child'],
    ['B', 'Add sibling'],
    ['Arrow keys', 'Walk the tree: ↑ parent, ↓ child, ←/→ neighbours'],
    ['F', 'Seat the selected person on the throne (centre the tree)'],
    ['H', 'Return home'],
    ['G', 'Golden Thread — how are two people related?'],
    ['T', 'Time scrubber'],
    ['/ or Ctrl+K', 'Search'],
    ['0', 'Survey the whole realm'],
    ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
    ['Esc', 'Close whatever is open'],
  ];
  return (
    <div className="help">
      <p>
        <strong>Dynasty Chronicle</strong> is a free, private family tree. Everything is stored in this browser; export a backup from the Treasury now and then.
      </p>
      <table className="keys">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>
                <kbd>{k}</kbd>
              </th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Dates</h4>
      <p>
        Write dates as you know them: <code>1902</code>, <code>12 Mar 1902</code>, <code>c. 1850</code>, <code>bef. 1900</code>, <code>aft. 1870</code>, <code>1850-1855</code>. The herald understands GEDCOM forms
        too (<code>ABT 1850</code>).
      </p>
      <h4>How sure are you?</h4>
      <p>
        Each fact can be marked <span className="conf-seal seal-verified">Confirmed</span> (backed by a document), <span className="conf-seal seal-probable">Probable</span> or{' '}
        <span className="conf-seal seal-legend">Family story</span>. This is optional.
      </p>
      <h4>Heraldry &amp; dynasty extras</h4>
      <p>Coats of arms, epithets and mottos are hidden by default. Turn them on in the Treasury (🗝) under Appearance.</p>
      <p className="muted small">
        Unions: {Object.keys(useData.getState().d.unions).length} · People: {Object.keys(useData.getState().d.people).length} · Year {CURRENT_YEAR}
      </p>
    </div>
  );
}

// Re-exports used by keyboard handling
export { spousesOf, unionsOf, childrenOf, parentsOf };
