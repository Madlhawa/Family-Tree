import { useEffect, useMemo, useState } from 'react';
import { actions, askConfirm, camera, openDossier, stamp, toast, useData, useUI, type DossierTab } from '../store/store';
import type { ChildKind, Confidence, EventType, LifeEvent, Person, Sex, UnionStatus, LivingStatus } from '../model/types';
import { uid } from '../model/types';
import {
  birthUnionsOf,
  childrenOf,
  fullName,
  houseColor,
  houseOf,
  isLiving,
  lifespan,
  parentsOf,
  siblingsOf,
  unionsOf,
  eventOf,
} from '../model/graph';
import { parseDate, sortKey } from '../model/dates';
import { resolveArms } from '../model/arms';
import { blazon } from '../model/heraldry';
import { allWarnings } from '../model/validate';
import { Shield } from './Shield';
import { Avatar, Face } from './PersonCard';
import { ArmsEditor } from './ArmsEditor';
import { pickFile, readAsDataURL, resizeImage } from '../ui/files';

const TABS: [DossierTab, string][] = [
  ['chronicle', 'About'],
  ['relations', 'Family'],
  ['events', 'Timeline'],
  ['gallery', 'Photos'],
  ['links', 'Links'],
  ['heraldry', 'Crest'],
];

export const EVENT_LABEL: Record<EventType, string> = {
  birth: 'Birth',
  baptism: 'Baptism',
  death: 'Death',
  burial: 'Burial',
  residence: 'Residence',
  occupation: 'Occupation',
  education: 'Education',
  military: 'Military service',
  migration: 'Migration',
  title: 'Title / honour',
  custom: 'Event',
};

export const SEAL: Record<Confidence, { label: string; cls: string; hint: string }> = {
  verified: { label: 'Confirmed', cls: 'seal-verified', hint: 'Backed by a document' },
  probable: { label: 'Probable', cls: 'seal-probable', hint: 'Likely, but not proven' },
  legend: { label: 'Family story', cls: 'seal-legend', hint: 'Family tradition / oral history' },
};

export function Dossier() {
  const id = useUI((s) => s.dossierId);
  const d = useData((s) => s.d);
  const p = id ? d.people[id] : undefined;
  if (!p) return null;
  return <DossierInner key={p.id} p={p} />;
}

function goTo(id: string) {
  openDossier(id, useUI.getState().dossierTab);
  camera.flyTo(id);
}

function DossierInner({ p }: { p: Person }) {
  const d = useData((s) => s.d);
  const tab0 = useUI((s) => s.dossierTab);
  const privacy = useUI((s) => s.privacy);
  const extras = useUI((s) => s.extras);
  const tab = !extras && tab0 === 'heraldry' ? 'chronicle' : tab0;
  const st = useUI((s) => s.stamp);
  const arms = resolveArms(d, p.id);
  const hidden = privacy && isLiving(p);
  const [stampKey, setStampKey] = useState(0);
  useEffect(() => setStampKey(st), [st]);

  const close = () => useUI.setState({ dossierId: undefined });
  const changePhoto = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    try {
      actions.updatePerson(p.id, { portrait: await resizeImage(file, 600) }, `Added a photo of ${fullName(p)}`);
    } catch {
      toast('That file could not be read as an image.');
    }
  };

  return (
    <div className="dossier-backdrop" data-nopan onMouseDown={(e) => e.target === e.currentTarget && close()}>
    <aside className="dossier" role="dialog" aria-modal="true" aria-label={`Profile of ${fullName(p)}`}>
      <header className="dossier-head">
        <button className="icon-btn close" onClick={close} aria-label="Close dossier">
          ✕
        </button>
        <div className="dossier-portrait" style={{ ['--house' as any]: houseColor(d, houseOf(p)) }}>
          {p.portrait && !hidden ? <img src={p.portrait} alt={`Portrait of ${fullName(p)}`} /> : <Avatar sex={p.sex} size={120} />}
          {!hidden && (
            <button className="photo-btn" onClick={changePhoto} title={p.portrait ? 'Change photo' : 'Add a photo'}>
              📷 {p.portrait ? 'Change' : 'Add photo'}
            </button>
          )}
          {!hidden && extras && (
            <span className="dossier-crest" title={arms.explanation}>
              <Shield arms={arms.arms} shape={arms.shape} cadency={arms.cadency} size={30} />
            </span>
          )}
        </div>
        <div className="dossier-id">
          {p.title && !hidden && <div className="d-title">{p.title}</div>}
          <h2>{hidden ? `Living ${p.surname}` : fullName(p)}</h2>
          {p.epithet && !hidden && extras && <div className="d-epithet">{p.epithet}</div>}
          {p.occupation && !hidden && <div className="d-epithet">{p.occupation}</div>}
          <div className="d-dates">{hidden ? 'Details sealed for privacy' : lifespan(p) || (isLiving(p) ? 'Living' : 'Dates unknown')}</div>
          <div className="d-house">
            <span className="wax" style={{ ['--house' as any]: houseColor(d, houseOf(p)) }}>
              {(houseOf(p)[0] ?? '?').toUpperCase()}
            </span>
            {extras ? `House ${houseOf(p) || 'Unknown'}` : `${houseOf(p) || 'Unknown'} family`}
            {p.placeholder && <span className="tag">Unknown slot</span>}
          </div>
        </div>
        {stampKey > 0 && <div key={stampKey} className="stamp-anim" aria-hidden />}
      </header>
      <nav className="tabs" role="tablist">
        {TABS.filter(([k]) => extras || k !== 'heraldry').map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => useUI.setState({ dossierTab: k })}>
            {label}
          </button>
        ))}
      </nav>
      <div className="dossier-body">
        {hidden ? (
          <div className="sealed">
            <div className="big-seal">🔒</div>
            <p>This person is living. Their details are sealed while Public view is on.</p>
            <button className="btn" onClick={() => useUI.setState({ privacy: false })}>
              Leave Public view
            </button>
          </div>
        ) : (
          <>
            {tab === 'chronicle' && <ChronicleTab p={p} />}
            {tab === 'events' && <EventsTab p={p} />}
            {tab === 'gallery' && <GalleryTab p={p} />}
            {tab === 'heraldry' && <HeraldryTab p={p} />}
            {tab === 'relations' && <RelationsTab p={p} />}
            {tab === 'links' && <LinksTab p={p} />}
          </>
        )}
      </div>
      <footer className="dossier-foot">
        <button className="btn ghost" onClick={() => useUI.setState({ focusId: p.id })} title="Centre the tree on this person">
          ⌖ Centre tree here
        </button>
        <button className="btn ghost" onClick={() => useUI.setState({ thread: { a: p.id } })} title="Find how someone is related">
          ✧ How are they related?
        </button>
        {d.rootId !== p.id && (
          <button className="btn ghost" onClick={() => actions.setRoot(p.id)} title="Make this the home person">
            ⌂ Set as home person
          </button>
        )}
        <button
          className="btn danger"
          onClick={() => {
            askConfirm(`Remove ${fullName(p)} from the tree? (Ctrl+Z undoes this.)`, 'Remove', true).then((ok) => ok && actions.deletePerson(p.id));
          }}
        >
          Delete
        </button>
      </footer>
    </aside>
    </div>
  );
}

// ---------------------------------------------------------------- Chronicle

function ChronicleTab({ p }: { p: Person }) {
  const d = useData((s) => s.d);
  const [editing, setEditing] = useState(p.placeholder ?? false);
  const warnings = allWarnings(d).get(p.id) ?? [];
  const birth = eventOf(p, 'birth');
  const death = eventOf(p, 'death');
  if (editing) return <ChronicleEdit p={p} onDone={() => setEditing(false)} />;
  const bio = p.bio?.trim();
  return (
    <div className="chronicle">
      <dl className="facts">
        {birth && (
          <>
            <dt>Born</dt>
            <dd>
              {parseDate(birth.date).display || '—'}
              {birth.place && <> · {birth.place}</>} <ConfSeal c={birth.confidence} />
            </dd>
          </>
        )}
        {death && (
          <>
            <dt>Died</dt>
            <dd>
              {parseDate(death.date).display || '—'}
              {death.place && <> · {death.place}</>} <ConfSeal c={death.confidence} />
            </dd>
          </>
        )}
        {p.occupation && (
          <>
            <dt>Calling</dt>
            <dd>{p.occupation}</dd>
          </>
        )}
        {p.birthSurname && p.birthSurname !== p.surname && (
          <>
            <dt>Born a</dt>
            <dd>{p.birthSurname}</dd>
          </>
        )}
        {!!p.altNames?.length && (
          <>
            <dt>Also known as</dt>
            <dd>{p.altNames.join(', ')}</dd>
          </>
        )}
      </dl>
      {bio ? (
        <div className="bio">
          {bio.split(/\n\s*\n/).map((para, i) => (
            <p key={i} className={i === 0 ? 'dropcap' : ''}>
              {para}
            </p>
          ))}
        </div>
      ) : (
        <p className="muted empty-bio">No chronicle has been written yet. Every life has a story — add theirs.</p>
      )}
      <AtAGlance p={p} />
      {warnings.length > 0 && (
        <div className="herald-box">
          <h4>Herald’s warnings</h4>
          <ul>
            {warnings.map((w, i) => (
              <li key={i} className={w.severity}>
                {w.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button className="btn primary" onClick={() => setEditing(true)}>
        ✒ Edit details
      </button>
    </div>
  );
}

/** Close family and links, so the About tab answers most questions at once. */
function AtAGlance({ p }: { p: Person }) {
  const d = useData((s) => s.d);
  const parents = parentsOf(d, p.id).map((r) => r.id);
  const partners = unionsOf(d, p.id).flatMap((u) => u.partners.filter((x) => x !== p.id));
  const kids = childrenOf(d, p.id).map((r) => r.id);
  const sibs = siblingsOf(d, p.id).map((s) => s.id);
  const rows: [string, string[]][] = [
    ['Parents', parents],
    ['Partner', partners],
    ['Children', kids],
    ['Siblings', sibs],
  ];
  const hasFamily = rows.some(([, ids]) => ids.length);
  const links = p.links.map((l) => ({ id: l.id, label: l.label || l.url, href: safeUrl(l.url) }));
  const socials = p.socials.map((s) => ({ id: s.id, label: `${s.platform} · @${s.handle.replace(/^@/, '')}`, href: safeUrl(PLATFORMS[s.platform]?.(s.handle.replace(/^@/, '')) ?? '') }));
  return (
    <>
      {hasFamily && (
        <section className="glance">
          <h4>Family</h4>
          <dl className="facts">
            {rows
              .filter(([, ids]) => ids.length)
              .map(([label, ids]) => (
                <div key={label} className="glance-row">
                  <dt>{label}</dt>
                  <dd>
                    {ids.map((id) => (
                      <PersonLink key={id} id={id} />
                    ))}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      )}
      {(links.length > 0 || socials.length > 0) && (
        <section className="glance">
          <h4>Links</h4>
          <ul className="chip-list">
            {[...links, ...socials].map((l) => (
              <li key={l.id}>
                {l.href ? (
                  <a className="chip" href={l.href} target="_blank" rel="noopener noreferrer">
                    {l.label} ↗
                  </a>
                ) : (
                  <span className="chip">{l.label}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ChronicleEdit({ p, onDone }: { p: Person; onDone: () => void }) {
  const extras = useUI((s) => s.extras);
  const birth = eventOf(p, 'birth');
  const death = eventOf(p, 'death');
  const [f, setF] = useState({
    given: p.given,
    surname: p.surname,
    birthSurname: p.birthSurname ?? '',
    title: p.title ?? '',
    epithet: p.epithet ?? '',
    sex: p.sex,
    living: p.living,
    occupation: p.occupation ?? '',
    altNames: (p.altNames ?? []).join(', '),
    bio: p.bio ?? '',
    born: birth?.date ?? '',
    bornPlace: birth?.place ?? '',
    died: death?.date ?? '',
    diedPlace: death?.place ?? '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const bornParsed = parseDate(f.born);
  const diedParsed = parseDate(f.died);

  const save = () => {
    actions.editPerson(p.id, `Amended the record of ${f.given || 'someone'} ${f.surname}`.trim(), (x) => {
      x.given = f.given.trim();
      x.surname = f.surname.trim();
      x.birthSurname = f.birthSurname.trim() || undefined;
      x.title = f.title.trim() || undefined;
      x.epithet = f.epithet.trim() || undefined;
      x.sex = f.sex as Sex;
      x.living = f.living as LivingStatus;
      x.occupation = f.occupation.trim() || undefined;
      x.altNames = f.altNames.split(',').map((s) => s.trim()).filter(Boolean);
      x.bio = f.bio.trim() || undefined;
      const upsert = (type: 'birth' | 'death', date: string, place: string) => {
        const e = x.events.find((ev) => ev.type === type);
        if (!date.trim() && !place.trim()) {
          if (e && !e.source && !e.note) x.events = x.events.filter((ev) => ev !== e);
          else if (e) {
            e.date = undefined;
            e.place = undefined;
          }
          return;
        }
        if (e) {
          e.date = date.trim() || undefined;
          e.place = place.trim() || undefined;
        } else x.events.push({ id: uid('e'), type, date: date.trim() || undefined, place: place.trim() || undefined, confidence: 'probable' });
      };
      upsert('birth', f.born, f.bornPlace);
      upsert('death', f.died, f.diedPlace);
      if (x.placeholder && (x.given || x.surname)) x.placeholder = undefined;
    });
    stamp();
    onDone();
  };

  const setPortrait = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    try {
      const url = await resizeImage(file, 600);
      actions.updatePerson(p.id, { portrait: url }, `Hung a portrait of ${fullName(p)}`);
    } catch {
      toast('That file could not be read as an image.');
    }
  };

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="portrait-row">
        <button type="button" className="btn" onClick={setPortrait}>
          🖼 {p.portrait ? 'Replace portrait' : 'Add portrait'}
        </button>
        {p.portrait && (
          <button type="button" className="btn ghost" onClick={() => actions.updatePerson(p.id, { portrait: undefined }, 'Removed a portrait')}>
            Remove
          </button>
        )}
      </div>
      <div className="row2">
        <label className="field">
          <span>Given names</span>
          <input value={f.given} onChange={set('given')} autoFocus />
        </label>
        <label className="field">
          <span>Surname</span>
          <input value={f.surname} onChange={set('surname')} />
        </label>
      </div>
      <label className="field">
        <span>Occupation / known for</span>
        <input value={f.occupation} onChange={set('occupation')} placeholder="e.g. Teacher, Engineer, Cricketer" />
      </label>
      <div className="row2">
        <label className="field">
          <span>Title (optional)</span>
          <input value={f.title} onChange={set('title')} placeholder="Dr, Rev…" />
        </label>
        <label className="field">
          <span>Maiden / birth surname</span>
          <input value={f.birthSurname} onChange={set('birthSurname')} placeholder="if different" />
        </label>
      </div>
      {extras && (
        <label className="field">
          <span>Epithet</span>
          <input value={f.epithet} onChange={set('epithet')} placeholder="the Steadfast" />
        </label>
      )}
      <div className="row2">
        <label className="field">
          <span>Sex</span>
          <select value={f.sex} onChange={set('sex')}>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="U">Unknown / other</option>
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={f.living} onChange={set('living')}>
            <option value="auto">Work it out from dates</option>
            <option value="living">Living</option>
            <option value="deceased">Deceased</option>
          </select>
        </label>
      </div>
      <div className="row2">
        <label className="field">
          <span>Born</span>
          <input value={f.born} onChange={set('born')} placeholder="c. 1850, 12 Mar 1902…" />
          {f.born && <small className={bornParsed.valid ? 'ok' : 'bad'}>{bornParsed.valid ? `Reads as: ${bornParsed.display}` : 'Unrecognised date'}</small>}
        </label>
        <label className="field">
          <span>Birthplace</span>
          <input value={f.bornPlace} onChange={set('bornPlace')} />
        </label>
      </div>
      <div className="row2">
        <label className="field">
          <span>Died</span>
          <input value={f.died} onChange={set('died')} placeholder="bef. 1920" />
          {f.died && <small className={diedParsed.valid ? 'ok' : 'bad'}>{diedParsed.valid ? `Reads as: ${diedParsed.display}` : 'Unrecognised date'}</small>}
        </label>
        <label className="field">
          <span>Place of death</span>
          <input value={f.diedPlace} onChange={set('diedPlace')} />
        </label>
      </div>
      <label className="field">
        <span>Also known as (comma separated)</span>
        <input value={f.altNames} onChange={set('altNames')} />
      </label>
      <label className="field">
        <span>Chronicle (biography)</span>
        <textarea rows={8} value={f.bio} onChange={set('bio')} placeholder="Tell their story. Blank lines start new paragraphs." />
      </label>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn primary">
          Seal the record
        </button>
      </div>
    </form>
  );
}

export function ConfSeal({ c }: { c?: Confidence }) {
  if (!c) return null;
  const s = SEAL[c];
  return (
    <span className={`conf-seal ${s.cls}`} title={`${s.label}: ${s.hint}`}>
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------- Events

function EventsTab({ p }: { p: Person }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const events = [...p.events].sort((a, b) => sortKey(a.date) - sortKey(b.date));
  const counts = p.events.reduce<Record<string, number>>((m, e) => ((m[e.type] = (m[e.type] ?? 0) + 1), m), {});
  const add = () => {
    const e: LifeEvent = { id: uid('e'), type: 'residence', confidence: 'probable' };
    actions.editPerson(p.id, `Added an event to the life of ${fullName(p)}`, (x) => void x.events.push(e));
    setEditingId(e.id);
  };
  return (
    <div className="events">
      <ol className="timeline">
        {events.map((e) =>
          editingId === e.id ? (
            <li key={e.id} className="editing">
              <EventEdit p={p} e={e} onDone={() => setEditingId(null)} />
            </li>
          ) : (
            <li key={e.id} className={`ev ev-${e.type}`}>
              <div className="ev-date">{parseDate(e.date).display || '—'}</div>
              <div className="ev-body">
                <div className="ev-title">
                  {e.type === 'custom' || e.type === 'title' ? e.label || EVENT_LABEL[e.type] : EVENT_LABEL[e.type]}
                  {e.label && e.type !== 'custom' && e.type !== 'title' && <span className="muted"> — {e.label}</span>}
                  {(counts[e.type] ?? 0) > 1 && (e.type === 'birth' || e.type === 'death') && <span className="tag disputed">Disputed</span>}
                  <ConfSeal c={e.confidence} />
                </div>
                {e.place && <div className="ev-place">⌖ {e.place}</div>}
                {e.note && <div className="ev-note">{e.note}</div>}
                {e.source && <div className="ev-source">Source: {e.source}</div>}
              </div>
              <button className="icon-btn" onClick={() => setEditingId(e.id)} aria-label="Edit event">
                ✒
              </button>
            </li>
          ),
        )}
      </ol>
      {!events.length && <p className="muted">No events recorded yet.</p>}
      <button className="btn" onClick={add}>
        + Add a life event
      </button>
      <p className="hint">
        Record conflicting facts as separate events — two births with different sources become a <em>disputed</em> fact, each with its own seal.
      </p>
    </div>
  );
}

function EventEdit({ p, e, onDone }: { p: Person; e: LifeEvent; onDone: () => void }) {
  const [f, setF] = useState({ ...e });
  const parsed = parseDate(f.date);
  const save = () => {
    actions.editPerson(p.id, `Amended an event in the life of ${fullName(p)}`, (x) => {
      const i = x.events.findIndex((ev) => ev.id === e.id);
      if (i >= 0) x.events[i] = { ...f, date: f.date?.trim() || undefined, place: f.place?.trim() || undefined };
    });
    stamp();
    onDone();
  };
  const remove = () => {
    actions.editPerson(p.id, `Removed an event from the life of ${fullName(p)}`, (x) => {
      x.events = x.events.filter((ev) => ev.id !== e.id);
    });
    onDone();
  };
  return (
    <form
      className="form"
      onSubmit={(ev) => {
        ev.preventDefault();
        save();
      }}
    >
      <div className="row2">
        <label className="field">
          <span>Kind</span>
          <select value={f.type} onChange={(ev) => setF({ ...f, type: ev.target.value as EventType })}>
            {Object.entries(EVENT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Label</span>
          <input value={f.label ?? ''} onChange={(ev) => setF({ ...f, label: ev.target.value || undefined })} placeholder="Knighted, Opened the mill…" />
        </label>
      </div>
      <div className="row2">
        <label className="field">
          <span>Date</span>
          <input value={f.date ?? ''} onChange={(ev) => setF({ ...f, date: ev.target.value })} autoFocus />
          {f.date && <small className={parsed.valid ? 'ok' : 'bad'}>{parsed.valid ? parsed.display : 'Unrecognised date'}</small>}
        </label>
        <label className="field">
          <span>Place</span>
          <input value={f.place ?? ''} onChange={(ev) => setF({ ...f, place: ev.target.value })} />
        </label>
      </div>
      <div className="field">
        <span>How sure are you?</span>
        <div className="seal-pick">
          {(Object.keys(SEAL) as Confidence[]).map((c) => (
            <button type="button" key={c} className={`conf-seal ${SEAL[c].cls} ${f.confidence === c ? 'on' : ''}`} onClick={() => setF({ ...f, confidence: c })} title={SEAL[c].hint}>
              {SEAL[c].label}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Source</span>
        <input value={f.source ?? ''} onChange={(ev) => setF({ ...f, source: ev.target.value || undefined })} placeholder="Parish register, census 1881, Grandma Nell…" />
      </label>
      <label className="field">
        <span>Note</span>
        <textarea rows={3} value={f.note ?? ''} onChange={(ev) => setF({ ...f, note: ev.target.value || undefined })} />
      </label>
      <div className="form-actions">
        <button type="button" className="btn danger ghost" onClick={remove}>
          Delete
        </button>
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn primary">
          Seal
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Gallery

function GalleryTab({ p }: { p: Person }) {
  const addImage = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    try {
      const data = await resizeImage(file, 1400);
      actions.editPerson(p.id, `Added an image to the gallery of ${fullName(p)}`, (x) => void x.media.push({ id: uid('m'), kind: 'image', data }));
    } catch {
      toast('That file could not be read as an image.');
    }
  };
  const addAudio = async () => {
    const file = await pickFile('audio/*');
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) return toast('Recordings must be under 12 MB.');
    const data = await readAsDataURL(file);
    actions.editPerson(p.id, `Added a recording of ${fullName(p)}`, (x) => void x.media.push({ id: uid('m'), kind: 'audio', data, caption: file.name.replace(/\.[^.]+$/, '') }));
  };
  const setCaption = (mid: string, caption: string) =>
    actions.editPerson(p.id, 'Captioned a gallery item', (x) => {
      const m = x.media.find((m) => m.id === mid);
      if (m) m.caption = caption || undefined;
    });
  return (
    <div className="gallery">
      <div className="gallery-actions">
        <button className="btn" onClick={addImage}>
          🖼 Add image
        </button>
        <button className="btn" onClick={addAudio} title="Oral histories, voice notes, songs">
          🎙 Add recording
        </button>
      </div>
      {!p.media.length && <p className="muted">No images or recordings yet. A grandparent’s voice is often the most precious thing a family keeps.</p>}
      <div className="gallery-grid">
        {p.media.map((m) => (
          <figure key={m.id} className={`media media-${m.kind}`}>
            {m.kind === 'image' ? <img src={m.data} alt={m.caption ?? ''} /> : <audio controls src={m.data} />}
            <figcaption>
              <input defaultValue={m.caption ?? ''} placeholder="Caption…" onBlur={(e) => e.target.value !== (m.caption ?? '') && setCaption(m.id, e.target.value)} />
              <div className="media-actions">
                {m.kind === 'image' && (
                  <button className="link" onClick={() => actions.updatePerson(p.id, { portrait: m.data }, `Chose a new portrait for ${fullName(p)}`)}>
                    Use as portrait
                  </button>
                )}
                <button className="link danger" onClick={() => actions.editPerson(p.id, 'Removed a gallery item', (x) => void (x.media = x.media.filter((y) => y.id !== m.id)))}>
                  Remove
                </button>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Heraldry

function HeraldryTab({ p }: { p: Person }) {
  const d = useData((s) => s.d);
  const r = resolveArms(d, p.id);
  return (
    <div className="heraldry">
      <div className="arms-hero">
        <Shield arms={r.arms} shape={r.shape} cadency={r.cadency} size={130} />
        <div>
          <p className="blazon">{blazon(r.arms)}</p>
          <p className="muted">{r.explanation}</p>
          {r.source !== 'own' && r.fromId && r.fromId !== p.id && (
            <button className="link" onClick={() => goTo(r.fromId!)}>
              View {fullName(d.people[r.fromId])}
            </button>
          )}
        </div>
      </div>
      {p.arms ? (
        <>
          <ArmsEditor arms={p.arms} onChange={(a) => actions.updatePerson(p.id, { arms: a }, `Redrew the arms of ${fullName(p)}`)} preview={false} />
          <button className="btn ghost" onClick={() => actions.updatePerson(p.id, { arms: undefined }, `${fullName(p)} relinquished personal arms`)}>
            Relinquish personal arms
          </button>
        </>
      ) : (
        <>
          <p className="hint">
            Sons inherit their father’s arms differenced by a cadency mark (a label for the eldest, a crescent for the second, a mullet for the third…). Daughters bear
            them on a lozenge. Grant personal arms to design new ones.
          </p>
          <button className="btn primary" onClick={() => actions.updatePerson(p.id, { arms: { ...r.arms } }, `Granted arms to ${fullName(p)}`)}>
            ⚜ Grant personal arms
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Relations

const KIND_LABEL: Record<ChildKind, string> = { birth: 'Birth', adopted: 'Adopted', step: 'Step', foster: 'Foster' };
const STATUS_LABEL: Record<UnionStatus, string> = { married: 'Married', partners: 'Partners', divorced: 'Divorced', widowed: 'Widowed', unknown: 'Unknown' };

function PersonLink({ id }: { id: string }) {
  const d = useData((s) => s.d);
  const q = d.people[id];
  if (!q) return null;
  return (
    <button className="person-link" onClick={() => goTo(id)}>
      <Face p={q} color={houseColor(d, houseOf(q))} size={24} />
      <span>{q.placeholder ? 'Unknown' : fullName(q)}</span>
      <span className="muted">{lifespan(q)}</span>
    </button>
  );
}

function RelationsTab({ p }: { p: Person }) {
  const d = useData((s) => s.d);
  const parents = parentsOf(d, p.id);
  const sibs = siblingsOf(d, p.id);
  const unions = unionsOf(d, p.id);
  const heirlooms = Object.values(d.heirlooms).filter((h) => h.custodians.includes(p.id));
  const kids = childrenOf(d, p.id);
  const qa = (rel: 'father' | 'mother' | 'spouse' | 'child' | 'sibling') => (e: React.MouseEvent) =>
    useUI.setState({ quickAdd: { anchorId: p.id, rel, x: e.clientX, y: e.clientY } });
  return (
    <div className="relations">
      <section>
        <h4>Parents</h4>
        {parents.length === 0 && <p className="muted">Unrecorded.</p>}
        {birthUnionsOf(d, p.id).map((u) => {
          const c = u.children.find((c) => c.id === p.id)!;
          return (
            <div key={u.id} className="rel-group">
              {u.partners.map((pid) => (
                <PersonLink key={pid} id={pid} />
              ))}
              <div className="rel-meta">
                <select value={c.kind} onChange={(e) => actions.updateUnion(u.id, { children: u.children.map((x) => (x.id === p.id ? { ...x, kind: e.target.value as ChildKind } : x)) })} aria-label="Kind of parentage">
                  {Object.entries(KIND_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v} child
                    </option>
                  ))}
                </select>
                <button className="link danger" onClick={() => actions.unlinkChild(u.id, p.id)}>
                  Unlink
                </button>
              </div>
            </div>
          );
        })}
        <div className="rel-add">
          <button className="link" onClick={qa('father')}>
            + Father
          </button>
          <button className="link" onClick={qa('mother')}>
            + Mother
          </button>
        </div>
      </section>
      <section>
        <h4>Unions & children</h4>
        {unions.length === 0 && <p className="muted">No unions recorded.</p>}
        {unions.map((u) => {
          const other = u.partners.find((x) => x !== p.id);
          return (
            <div key={u.id} className="rel-group union-card">
              {other ? <PersonLink id={other} /> : <p className="muted">Partner unknown</p>}
              <div className="row3">
                <select value={u.status} onChange={(e) => actions.updateUnion(u.id, { status: e.target.value as UnionStatus })} aria-label="Union status">
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <input defaultValue={u.date ?? ''} placeholder="Wed (date)" onBlur={(e) => e.target.value !== (u.date ?? '') && actions.updateUnion(u.id, { date: e.target.value || undefined })} />
                <input defaultValue={u.place ?? ''} placeholder="Place" onBlur={(e) => e.target.value !== (u.place ?? '') && actions.updateUnion(u.id, { place: e.target.value || undefined })} />
              </div>
              <ul className="child-list">
                {u.children.map((c) => (
                  <li key={c.id}>
                    <PersonLink id={c.id} />
                    {c.kind !== 'birth' && <span className="tag">{KIND_LABEL[c.kind]}</span>}
                    <button className="link danger" onClick={() => actions.unlinkChild(u.id, c.id)} aria-label="Unlink child">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <div className="rel-add">
                <button
                  className="link"
                  onClick={(e) => useUI.setState({ quickAdd: { anchorId: p.id, rel: 'child', x: e.clientX, y: e.clientY } })}
                  title="Add a child to this union"
                >
                  + Child
                </button>
                {u.manualOrder && (
                  <button className="link" onClick={() => actions.resetChildOrder(u.id)} title="Undo the manual arrangement and order the children by birth date">
                    ↺ Sort by birth date
                  </button>
                )}
                {other && (
                  <button className="link danger" onClick={() => askConfirm('Dissolve this union record? Children stay with this person.', 'Dissolve', true).then((ok) => ok && actions.unlinkPartner(u.id, other))}>
                    Dissolve
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div className="rel-add">
          <button className="link" onClick={qa('spouse')}>
            + Spouse / partner
          </button>
          {unions.length === 0 && (
            <button className="link" onClick={qa('child')}>
              + Child
            </button>
          )}
        </div>
        {kids.length > 0 && <p className="muted small">{kids.length} child{kids.length > 1 ? 'ren' : ''} in all.</p>}
      </section>
      <section>
        <h4>Siblings</h4>
        {sibs.length === 0 && <p className="muted">None recorded.</p>}
        <ul className="child-list">
          {sibs.map((s) => (
            <li key={s.id}>
              <PersonLink id={s.id} />
              {s.half && <span className="tag">Half</span>}
            </li>
          ))}
        </ul>
        <div className="rel-add">
          <button className="link" onClick={qa('sibling')}>
            + Sibling
          </button>
        </div>
      </section>
      {heirlooms.length > 0 && (
        <section>
          <h4>Heirlooms held</h4>
          <ul className="heirloom-mini">
            {heirlooms.map((h) => (
              <li key={h.id}>
                <strong>{h.name}</strong>
                <span className="muted"> — custodian {h.custodians.indexOf(p.id) + 1} of {h.custodians.length}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Links & social

export const PLATFORMS: Record<string, (h: string) => string> = {
  Instagram: (h) => `https://instagram.com/${h}`,
  X: (h) => `https://x.com/${h}`,
  Facebook: (h) => `https://facebook.com/${h}`,
  LinkedIn: (h) => `https://linkedin.com/in/${h}`,
  TikTok: (h) => `https://tiktok.com/@${h}`,
  YouTube: (h) => `https://youtube.com/@${h}`,
  GitHub: (h) => `https://github.com/${h}`,
  Threads: (h) => `https://threads.net/@${h}`,
  Bluesky: (h) => `https://bsky.app/profile/${h}`,
  Other: (h) => (/^https?:\/\//.test(h) ? h : ''),
};

function safeUrl(u: string): string | undefined {
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function LinksTab({ p }: { p: Person }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [handle, setHandle] = useState('');
  const living = isLiving(p);
  const links = useMemo(() => p.links, [p.links]);
  return (
    <div className="links">
      <section>
        <h4>External records & links</h4>
        <ul className="link-list">
          {links.map((l) => {
            const href = safeUrl(l.url);
            return (
              <li key={l.id}>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {l.label || l.url}
                  </a>
                ) : (
                  <span>{l.label || l.url}</span>
                )}
                <button className="link danger" onClick={() => actions.editPerson(p.id, 'Removed a link', (x) => void (x.links = x.links.filter((y) => y.id !== l.id)))} aria-label="Remove link">
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!safeUrl(url)) return toast('Links must start with http:// or https://');
            actions.editPerson(p.id, `Added a link for ${fullName(p)}`, (x) => void x.links.push({ id: uid('l'), label: label.trim() || url, url: url.trim() }));
            setLabel('');
            setUrl('');
          }}
        >
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (Census 1881, Obituary…)" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          <button className="btn" type="submit">
            Add
          </button>
        </form>
      </section>
      <section>
        <h4>Social handles</h4>
        {living && <p className="hint">Handles of living people are hidden in Public view and redacted from privacy-safe exports.</p>}
        <ul className="link-list">
          {p.socials.map((s) => {
            const href = safeUrl(PLATFORMS[s.platform]?.(s.handle.replace(/^@/, '')) ?? '');
            return (
              <li key={s.id}>
                <span className="platform">{s.platform}</span>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    @{s.handle.replace(/^@/, '')}
                  </a>
                ) : (
                  <span>{s.handle}</span>
                )}
                <button className="link danger" onClick={() => actions.editPerson(p.id, 'Removed a social handle', (x) => void (x.socials = x.socials.filter((y) => y.id !== s.id)))} aria-label="Remove handle">
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!handle.trim()) return;
            actions.editPerson(p.id, `Added a social handle for ${fullName(p)}`, (x) => void x.socials.push({ id: uid('s'), platform, handle: handle.trim() }));
            setHandle('');
          }}
        >
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {Object.keys(PLATFORMS).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="handle" />
          <button className="btn" type="submit">
            Add
          </button>
        </form>
      </section>
    </div>
  );
}
