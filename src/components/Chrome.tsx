/** Toolbar, search palette, Golden Thread banner, time scrubber, saga player, toasts. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { camera, openDossier, select, useData, useUI, undo, redo, type Mode, type PanelId } from '../store/store';
import { aliveIn, birthYear, deathYear, fullName, lifespan } from '../model/graph';
import { describeRelationship } from '../model/relationship';
import { houseArms } from '../model/graph';
import { CURRENT_YEAR } from '../model/dates';
import { Shield } from './Shield';
import { resolveArms } from '../model/arms';

const MODES: [Mode, string, string][] = [
  ['family', 'Family', 'The whole family graph'],
  ['ancestors', 'Ancestors', 'Pedigree: only the forebears of the person on the throne'],
  ['descendants', 'Descendants', 'Only the issue of the person on the throne'],
  ['fan', 'Fan chart', 'Radial pedigree'],
];

const PANELS: [PanelId, string, string][] = [
  ['houses', '⚜', 'Houses'],
  ['records', '📊', 'Hall of Records'],
  ['warnings', '⚠', 'Herald’s Warnings'],
  ['sagas', '📖', 'Sagas'],
  ['heirlooms', '💍', 'Heirlooms'],
  ['dictation', '✒', 'Scribe’s Dictation'],
  ['annals', '🕮', 'Annals (history)'],
  ['treasury', '🗝', 'Treasury: import, export & settings'],
  ['help', '?', 'Help & shortcuts'],
];

export function Toolbar() {
  const d = useData((s) => s.d);
  const mode = useUI((s) => s.mode);
  const panel = useUI((s) => s.panel);
  const theme = useUI((s) => s.theme);
  const privacy = useUI((s) => s.privacy);
  const timeYear = useUI((s) => s.timeYear);
  const thread = useUI((s) => s.thread);
  const focusId = useUI((s) => s.focusId);
  const past = useData((s) => s.past.length);
  const future = useData((s) => s.future.length);
  const mainHouse = d.people[d.rootId ?? '']?.surname ?? d.name.replace(/^House\s+/i, '');
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--toolbar-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <header className="toolbar" data-nopan ref={ref}>
      <div className="brand" title={d.motto}>
        <Shield arms={houseArms(d, mainHouse)} size={30} />
        <div>
          <div className="brand-name">{d.name}</div>
          {d.motto && <div className="brand-motto">{d.motto}</div>}
        </div>
      </div>
      <nav className="modes" aria-label="View">
        {MODES.map(([m, label, hint]) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => useUI.setState({ mode: m })} title={hint}>
            {label}
          </button>
        ))}
      </nav>
      <div className="tools">
        <button className="tool" onClick={() => useUI.setState({ searchOpen: true })} title="Search (/ or Ctrl+K)">
          🔍<span className="tool-label">Search</span>
        </button>
        <button className={`tool ${thread ? 'on' : ''}`} onClick={() => useUI.setState({ thread: thread ? null : {} })} title="Golden Thread: how are two people related? (G)">
          ✧<span className="tool-label">Thread</span>
        </button>
        <button
          className={`tool ${timeYear !== null ? 'on' : ''}`}
          onClick={() => useUI.setState({ timeYear: timeYear === null ? 1900 : null })}
          title="Time scrubber: who was alive in a given year (T)"
        >
          ⌛<span className="tool-label">Time</span>
        </button>
        <button className="tool" onClick={() => useUI.setState({ newTreeOpen: true })} title="Start a new family tree">
          ✚<span className="tool-label">New tree</span>
        </button>
        <button className="tool" onClick={() => useUI.setState({ bookOpen: true })} title="Book of the House — a printable chronicle">
          📕<span className="tool-label">Book</span>
        </button>
        <span className="sep" />
        <button className="tool" onClick={undo} disabled={!past} title="Undo (Ctrl+Z)" aria-label="Undo">
          ↶
        </button>
        <button className="tool" onClick={redo} disabled={!future} title="Redo (Ctrl+Y)" aria-label="Redo">
          ↷
        </button>
        <span className="sep" />
        {PANELS.map(([id, glyph, label]) => (
          <button key={id} className={`tool icon ${panel === id ? 'on' : ''}`} onClick={() => useUI.setState({ panel: panel === id ? null : id })} title={label} aria-label={label}>
            {glyph}
          </button>
        ))}
        <span className="sep" />
        <button className={`tool icon ${privacy ? 'on' : ''}`} onClick={() => useUI.setState({ privacy: !privacy })} title={privacy ? 'Public view is ON — living people are sealed' : 'Public view: seal living people for screenshots & sharing'} aria-label="Public view">
          {privacy ? '🔒' : '🔓'}
        </button>
        <button className="tool icon" onClick={() => useUI.setState({ theme: theme === 'candle' ? 'parchment' : 'candle' })} title={theme === 'candle' ? 'Daylight parchment' : 'Candlelight (dark)'} aria-label="Toggle theme">
          {theme === 'candle' ? '☀' : '☾'}
        </button>
      </div>
      {focusId && focusId !== d.rootId && d.people[focusId] && (
        <div className="throne-chip">
          ♛ {fullName(d.people[focusId])}
          <button className="link" onClick={() => useUI.setState({ focusId: undefined })}>
            return home
          </button>
        </div>
      )}
    </header>
  );
}

export function SearchPalette() {
  const open = useUI((s) => s.searchOpen);
  const d = useData((s) => s.d);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setQ('');
      setI(0);
      setTimeout(() => input.current?.focus(), 10);
    }
  }, [open]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = Object.values(d.people).filter((p) => !p.placeholder);
    if (!t) return all.slice(0, 10);
    return all
      .map((p) => {
        const hay = `${p.given} ${p.surname} ${p.birthSurname ?? ''} ${p.epithet ?? ''} ${(p.altNames ?? []).join(' ')} ${p.occupation ?? ''}`.toLowerCase();
        const idx = hay.indexOf(t);
        const words = t.split(/\s+/).every((w) => hay.includes(w));
        return { p, score: idx === 0 ? 0 : idx > 0 ? 1 : words ? 2 : 9 };
      })
      .filter((r) => r.score < 9)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12)
      .map((r) => r.p);
  }, [d.people, q]);
  if (!open) return null;
  const go = (id: string) => {
    useUI.setState({ searchOpen: false, mode: useUI.getState().mode === 'fan' ? 'family' : useUI.getState().mode });
    setTimeout(() => {
      select(id);
      camera.flyTo(id, 0.95);
    }, 30);
  };
  return (
    <div className="modal-backdrop" onClick={() => useUI.setState({ searchOpen: false })} data-nopan>
      <div className="palette" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          placeholder="Seek a name, epithet or calling…"
          onKeyDown={(e) => {
            if (e.key === 'Escape') useUI.setState({ searchOpen: false });
            if (e.key === 'ArrowDown') setI((x) => Math.min(results.length - 1, x + 1));
            if (e.key === 'ArrowUp') setI((x) => Math.max(0, x - 1));
            if (e.key === 'Enter' && results[i]) go(results[i].id);
          }}
        />
        <ul>
          {results.map((p, k) => (
            <li key={p.id} className={k === i ? 'on' : ''} onMouseEnter={() => setI(k)} onClick={() => go(p.id)}>
              <Shield arms={resolveArms(d, p.id).arms} shape={resolveArms(d, p.id).shape} size={22} />
              <span className="pal-name">
                {p.title ? `${p.title} ` : ''}
                {fullName(p)}
                {p.epithet && <em> {p.epithet}</em>}
              </span>
              <span className="muted">{lifespan(p)}</span>
            </li>
          ))}
          {!results.length && <li className="muted">No one in the chronicle answers to that.</li>}
        </ul>
      </div>
    </div>
  );
}

export function ThreadBanner() {
  const thread = useUI((s) => s.thread);
  const d = useData((s) => s.d);
  if (!thread) return null;
  const a = thread.a ? d.people[thread.a] : undefined;
  const b = thread.b ? d.people[thread.b] : undefined;
  const rel = a && b ? describeRelationship(d, a.id, b.id) : undefined;
  return (
    <div className="banner thread-banner" data-nopan role="status">
      <span className="banner-glyph">✧</span>
      {!a && <span>Golden Thread — choose the first person on the tree.</span>}
      {a && !b && (
        <span>
          From <strong>{fullName(a)}</strong> — now choose the second person.
        </span>
      )}
      {rel && (
        <div className="thread-result">
          <div className="thread-sentence">{rel.sentence}</div>
          {rel.path && rel.path.length > 1 && (
            <ol className="thread-path">
              {rel.path.map((s, i) => (
                <li key={s.id}>
                  {i > 0 && <span className="thread-step">{s.label} →</span>}
                  <button className="link" onClick={() => camera.flyTo(s.id)}>
                    {fullName(d.people[s.id])}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      <div className="banner-actions">
        {rel && (
          <button className="btn ghost" onClick={() => useUI.setState({ thread: { b: undefined, a: b!.id } })} title="Keep the second person and pick another">
            Pick another
          </button>
        )}
        <button className="btn" onClick={() => useUI.setState({ thread: null })}>
          Done
        </button>
      </div>
    </div>
  );
}

export function TimeScrubber() {
  const year = useUI((s) => s.timeYear);
  const d = useData((s) => s.d);
  const [playing, setPlaying] = useState(false);
  const [min, max] = useMemo(() => {
    let lo = CURRENT_YEAR;
    for (const p of Object.values(d.people)) {
      const b = birthYear(p);
      if (b !== undefined) lo = Math.min(lo, b);
    }
    return [Math.floor((lo - 5) / 10) * 10, CURRENT_YEAR];
  }, [d.people]);
  useEffect(() => {
    if (!playing || year === null) return;
    const t = setInterval(() => {
      const y = useUI.getState().timeYear ?? min;
      if (y >= max) {
        setPlaying(false);
        return;
      }
      useUI.setState({ timeYear: y + 1 });
    }, 90);
    return () => clearInterval(t);
  }, [playing, year === null, min, max]);
  if (year === null) return null;
  const alive = Object.values(d.people).filter((p) => aliveIn(p, year)).length;
  const births = Object.values(d.people).filter((p) => birthYear(p) === year);
  const deaths = Object.values(d.people).filter((p) => deathYear(p) === year);
  return (
    <div className="time-scrubber" data-nopan>
      <button className="btn icon" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="time-year">
        <span className="year">{year}</span>
        <span className="muted">
          {alive} soul{alive === 1 ? '' : 's'} living
          {births.length > 0 && <> · born: {births.map((p) => p.given).join(', ')}</>}
          {deaths.length > 0 && <> · died: {deaths.map((p) => p.given).join(', ')}</>}
        </span>
      </div>
      <input type="range" min={min} max={max} value={year} onChange={(e) => useUI.setState({ timeYear: +e.target.value })} aria-label="Year" />
      <button className="icon-btn" onClick={() => useUI.setState({ timeYear: null })} aria-label="Close time scrubber">
        ✕
      </button>
    </div>
  );
}

export function SagaPlayer() {
  const saga = useUI((s) => s.saga);
  const d = useData((s) => s.d);
  const s = saga ? d.sagas[saga.id] : undefined;
  const step = s && saga ? s.steps[saga.step] : undefined;
  useEffect(() => {
    if (step) {
      useUI.setState({ selectedId: step.personId });
      camera.flyTo(step.personId, 1);
    }
  }, [step]);
  useEffect(() => {
    if (!saga) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Escape') useUI.setState({ saga: undefined });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!s || !saga || !step) return null;
  const go = (delta: number) => {
    const n = saga.step + delta;
    if (n < 0 || n >= s.steps.length) return;
    useUI.setState({ saga: { id: saga.id, step: n } });
  };
  const p = d.people[step.personId];
  return (
    <div className="saga-player" data-nopan role="dialog" aria-label={s.title}>
      <div className="saga-title">{s.title}</div>
      <div className="saga-step">
        Chapter {saga.step + 1} of {s.steps.length} — <button className="link" onClick={() => openDossier(step.personId)}>{fullName(p)}</button>
      </div>
      <p className="saga-caption">{step.caption}</p>
      <div className="saga-actions">
        <button className="btn ghost" onClick={() => go(-1)} disabled={saga.step === 0}>
          ← Before
        </button>
        <button className="btn ghost" onClick={() => useUI.setState({ saga: undefined })}>
          Close the book
        </button>
        <button className="btn primary" onClick={() => go(1)} disabled={saga.step === s.steps.length - 1}>
          Onward →
        </button>
      </div>
    </div>
  );
}

export function Toast() {
  const t = useUI((s) => s.toast);
  if (!t) return null;
  return (
    <div className="toast" key={t.at} role="status">
      {t.text}
    </div>
  );
}

export function SealStamp() {
  const n = useUI((s) => s.stamp);
  if (!n) return null;
  return <div key={n} className="global-stamp" aria-hidden />;
}
