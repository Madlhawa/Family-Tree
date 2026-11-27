/** Toolbar, search palette, Golden Thread banner, time scrubber, saga player, toasts. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { camera, openDossier, select, useData, useUI, undo, redo, type Mode, type PanelId } from '../store/store';
import { aliveIn, birthYear, deathYear, fullName, lifespan } from '../model/graph';
import { describeRelationship } from '../model/relationship';
import { houseArms, houseColor, houseOf } from '../model/graph';
import { Face } from './PersonCard';
import { CURRENT_YEAR } from '../model/dates';
import { Shield } from './Shield';

const MODES: [Mode, string, string][] = [
  ['family', 'Family', 'The whole family graph'],
  ['ancestors', 'Ancestors', 'Pedigree: only the forebears of the person on the throne'],
  ['descendants', 'Descendants', 'Only the issue of the person on the throne'],
  ['fan', 'Fan chart', 'Radial pedigree'],
];

interface MenuItem {
  icon: string;
  label: string;
  hint?: string;
  on?: boolean;
  disabled?: boolean;
  run: () => void;
}

/** Everything that used to crowd the toolbar, as one dropdown. */
function ToolMenu() {
  const [open, setOpen] = useState(false);
  const panel = useUI((s) => s.panel);
  const theme = useUI((s) => s.theme);
  const privacy = useUI((s) => s.privacy);
  const timeYear = useUI((s) => s.timeYear);
  const thread = useUI((s) => s.thread);
  const past = useData((s) => s.past.length);
  const future = useData((s) => s.future.length);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    setTimeout(() => wrap.current?.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)')?.focus(), 0);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const openPanel = (id: PanelId) => () => useUI.setState({ panel: panel === id ? null : id });
  const sections: [string, MenuItem[]][] = [
    [
      'Explore',
      [
        { icon: '🔍', label: 'Search people', hint: '/', run: () => useUI.setState({ searchOpen: true }) },
        { icon: '✧', label: 'How are they related?', hint: 'G', on: !!thread, run: () => useUI.setState({ thread: thread ? null : {} }) },
        { icon: '⌛', label: 'Time travel', hint: 'T', on: timeYear !== null, run: () => useUI.setState({ timeYear: timeYear === null ? 1900 : null }) },
        { icon: '📕', label: 'Printable family book', run: () => useUI.setState({ bookOpen: true }) },
      ],
    ],
    [
      'Edit',
      [
        { icon: '↶', label: 'Undo', hint: 'Ctrl+Z', disabled: !past, run: undo },
        { icon: '↷', label: 'Redo', hint: 'Ctrl+Y', disabled: !future, run: redo },
        { icon: '✒', label: 'Quick entry (type a whole family)', on: panel === 'dictation', run: openPanel('dictation') },
        { icon: '✚', label: 'Start a new family tree', run: () => useUI.setState({ newTreeOpen: true }) },
      ],
    ],
    [
      'Panels',
      [
        { icon: '⚜', label: 'Families', on: panel === 'houses', run: openPanel('houses') },
        { icon: '📊', label: 'Statistics', on: panel === 'records', run: openPanel('records') },
        { icon: '⚠', label: 'Data checks & duplicates', on: panel === 'warnings', run: openPanel('warnings') },
        { icon: '📖', label: 'Stories (guided tours)', on: panel === 'sagas', run: openPanel('sagas') },
        { icon: '💍', label: 'Heirlooms', on: panel === 'heirlooms', run: openPanel('heirlooms') },
        { icon: '🕮', label: 'Change history', on: panel === 'annals', run: openPanel('annals') },
      ],
    ],
    [
      'Settings',
      [
        { icon: '🗝', label: 'Settings, import & backup', on: panel === 'treasury', run: openPanel('treasury') },
        { icon: privacy ? '🔒' : '🔓', label: 'Public view (hide living people)', on: privacy, run: () => useUI.setState({ privacy: !privacy }) },
        { icon: '☾', label: 'Dark theme', on: theme === 'candle', run: () => useUI.setState({ theme: theme === 'candle' ? 'parchment' : 'candle' }) },
        { icon: '?', label: 'Help & shortcuts', on: panel === 'help', run: openPanel('help') },
      ],
    ],
  ];

  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        ref={button}
        className={`menu-button ${open ? 'on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Menu"
      >
        <span className="menu-burger" aria-hidden>
          ☰
        </span>
        <span className="menu-button-label">Menu</span>
      </button>
      {open && (
        <div className="menu-dropdown" role="menu">
          {sections.map(([title, items]) => (
            <div key={title} className="menu-section" role="group" aria-label={title}>
              <div className="menu-heading">{title}</div>
              {items.map((it) => (
                <button
                  key={it.label}
                  role="menuitem"
                  className={`menu-item ${it.on ? 'on' : ''}`}
                  disabled={it.disabled}
                  onClick={() => {
                    setOpen(false);
                    it.run();
                  }}
                >
                  <span className="menu-icon" aria-hidden>
                    {it.icon}
                  </span>
                  <span className="menu-label">{it.label}</span>
                  {it.on && (
                    <span className="menu-check" aria-label="on">
                      ✓
                    </span>
                  )}
                  {it.hint && <kbd className="menu-hint">{it.hint}</kbd>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toolbar() {
  const d = useData((s) => s.d);
  const mode = useUI((s) => s.mode);
  const extras = useUI((s) => s.extras);
  const focusId = useUI((s) => s.focusId);
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
      <nav className="modes" aria-label="View">
        {MODES.map(([m, label, hint]) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => useUI.setState({ mode: m })} title={hint}>
            {label}
          </button>
        ))}
      </nav>
      <div className="brand" title={d.motto}>
        {extras ? <Shield arms={houseArms(d, mainHouse)} size={30} /> : <span className="brand-mark" aria-hidden>♛</span>}
        <div>
          <div className="brand-name">{d.name}</div>
          {extras && d.motto && <div className="brand-motto">{d.motto}</div>}
        </div>
      </div>
      <ToolMenu />
      {focusId && focusId !== d.rootId && d.people[focusId] && (
        <div className="throne-chip">
          ⌖ Centred on {fullName(d.people[focusId])}
          <button className="link" onClick={() => useUI.setState({ focusId: undefined })}>
            back to home person
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
          placeholder="Search by name or occupation…"
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
              <Face p={p} color={houseColor(d, houseOf(p))} size={26} />
              <span className="pal-name">
                {p.title ? `${p.title} ` : ''}
                {fullName(p)}
                {p.occupation && <em> · {p.occupation}</em>}
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
