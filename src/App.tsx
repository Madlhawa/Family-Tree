import { useEffect, useState } from 'react';
import { actions, askConfirm, camera, initData, openDossier, redo, select, toggleSet, undo, useData, useUI } from './store/store';
import { TreeCanvas } from './components/TreeCanvas';
import { FanChart } from './components/FanChart';
import { Dossier } from './components/Dossier';
import { QuickAdd } from './components/QuickAdd';
import { Panel } from './components/Panels';
import { Book } from './components/Book';
import { ConfirmDialog, NewTreeDialog } from './components/Dialogs';
import { SagaPlayer, SealStamp, SearchPalette, ThreadBanner, TimeScrubber, Toast, Toolbar } from './components/Chrome';
import { childrenOf, fullName, parentsOf } from './model/graph';
import { parseDate } from './model/dates';
import type { RelKind } from './model/ops';

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

function cardRect(id: string) {
  return document.querySelector(`[data-person="${CSS.escape(id)}"]`)?.getBoundingClientRect();
}

/** Spatial neighbour on the canvas (same row), for ←/→ navigation. */
function neighbour(id: string, dir: -1 | 1): string | undefined {
  const r = cardRect(id);
  if (!r) return;
  let best: { id: string; dx: number } | undefined;
  document.querySelectorAll<HTMLElement>('[data-person]').forEach((el) => {
    const o = el.getBoundingClientRect();
    if (el.dataset.person === id || Math.abs(o.top - r.top) > r.height / 2) return;
    const dx = (o.left - r.left) * dir;
    if (dx > 0 && (!best || dx < best.dx)) best = { id: el.dataset.person!, dx };
  });
  return best?.id;
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState();
      const d = useData.getState().d;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !isTyping(e.target)) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y' && !isTyping(e.target)) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUI.setState({ searchOpen: true });
        return;
      }
      if (ui.confirmReq || ui.newTreeOpen) return;
      if (e.key === 'Escape') {
        if (ui.quickAdd) return useUI.setState({ quickAdd: undefined });
        if (ui.searchOpen) return useUI.setState({ searchOpen: false });
        if (ui.bookOpen) return useUI.setState({ bookOpen: false });
        if (ui.saga) return;
        if (ui.thread) return useUI.setState({ thread: null });
        if (ui.dossierId) return useUI.setState({ dossierId: undefined });
        if (ui.panel) return useUI.setState({ panel: null });
        if (ui.highlightHouse) return useUI.setState({ highlightHouse: undefined });
        if (ui.timeYear !== null) return useUI.setState({ timeYear: null });
        return useUI.setState({ selectedId: undefined });
      }
      if (isTyping(e.target) || mod || e.altKey || ui.searchOpen || ui.bookOpen || ui.quickAdd || ui.saga) return;
      const k = e.key;
      if (k === '/') {
        e.preventDefault();
        useUI.setState({ searchOpen: true });
        return;
      }
      if (k === 'g') return useUI.setState({ thread: ui.thread ? null : {} });
      if (k === 't') return useUI.setState({ timeYear: ui.timeYear === null ? 1900 : null });
      if (k === '0') return camera.fit();
      if (k === 'h') {
        useUI.setState({ focusId: undefined });
        if (d.rootId) select(d.rootId);
        return;
      }
      const id = ui.selectedId;
      if (!id || !d.people[id]) return;
      const rels: Record<string, RelKind> = { p: 'father', m: 'mother', s: 'spouse', c: 'child', b: 'sibling' };
      if (rels[k]) {
        e.preventDefault();
        const r = cardRect(id);
        useUI.setState({ quickAdd: { anchorId: id, rel: rels[k], x: r ? r.left + r.width / 2 : innerWidth / 2, y: r ? r.bottom : innerHeight / 2 } });
        return;
      }
      if (k === 'Enter') return openDossier(id);
      if (k === 'f') return useUI.setState({ focusId: id });
      if (k === 'Delete') {
        askConfirm(`Remove ${fullName(d.people[id])} from the tree? (Ctrl+Z undoes this.)`, 'Remove', true).then((ok) => ok && actions.deletePerson(id));
        return;
      }
      if (k === '[') return toggleSet('collapsedUp', id);
      if (k === ']') return toggleSet('collapsedDown', id);
      let next: string | undefined;
      if (k === 'ArrowUp') next = parentsOf(d, id)[0]?.id;
      if (k === 'ArrowDown') next = childrenOf(d, id)[0]?.id;
      if (k === 'ArrowLeft') next = neighbour(id, -1);
      if (k === 'ArrowRight') next = neighbour(id, 1);
      if (next) {
        e.preventDefault();
        select(next);
        if (ui.dossierId) openDossier(next, ui.dossierTab);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** "On this day" — anniversaries from fully dated events. */
function OnThisDay() {
  const d = useData((s) => s.d);
  const loaded = useData((s) => s.loaded);
  const [shown, setShown] = useState(true);
  if (!loaded || !shown) return null;
  const now = new Date();
  const items: string[] = [];
  for (const p of Object.values(d.people)) {
    for (const e of p.events) {
      const pd = parseDate(e.date);
      if (pd.qual === 'exact' && pd.month === now.getMonth() + 1 && pd.day === now.getDate() && pd.year) {
        const ago = now.getFullYear() - pd.year;
        const verb = e.type === 'birth' ? 'was born' : e.type === 'death' ? 'died' : e.label ? `— ${e.label}` : `— ${e.type}`;
        items.push(`${pd.year}: ${fullName(p)} ${verb} (${ago} years ago)`);
      }
    }
  }
  for (const u of Object.values(d.unions)) {
    const pd = parseDate(u.date);
    if (pd.qual === 'exact' && pd.month === now.getMonth() + 1 && pd.day === now.getDate() && pd.year) {
      items.push(`${pd.year}: ${u.partners.map((x) => fullName(d.people[x])).join(' & ')} were wed (${now.getFullYear() - pd.year} years ago)`);
    }
  }
  if (!items.length) return null;
  return (
    <div className="on-this-day" data-nopan role="status">
      <div className="otd-title">On this day</div>
      <ul>
        {items.slice(0, 4).map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <button className="icon-btn" onClick={() => setShown(false)} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

export function App() {
  const loaded = useData((s) => s.loaded);
  const mode = useUI((s) => s.mode);
  const theme = useUI((s) => s.theme);
  const plain = useUI((s) => s.plain);
  const bookOpen = useUI((s) => s.bookOpen);
  const empty = useData((s) => Object.keys(s.d.people).length === 0);
  useKeyboard();
  useEffect(() => {
    initData();
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'candle' ? 'dark' : 'light';
    document.documentElement.classList.toggle('plain', plain);
  }, [theme, plain]);

  return (
    <div className="app">
      <Toolbar />
      <main className="stage">
        {!loaded ? (
          <div className="empty-state">Unrolling the parchment…</div>
        ) : empty ? (
          <EmptyRealm />
        ) : mode === 'fan' ? (
          <FanChart />
        ) : (
          <TreeCanvas key="tree" />
        )}
      </main>
      <ThreadBanner />
      <TimeScrubber />
      <SagaPlayer />
      <Panel />
      <Dossier />
      <QuickAdd />
      <SearchPalette />
      <OnThisDay />
      <Toast />
      <SealStamp />
      {bookOpen && <Book />}
      <NewTreeDialog />
      <ConfirmDialog />
    </div>
  );
}

function EmptyRealm() {
  const [given, setGiven] = useState('');
  const [surname, setSurname] = useState('');
  return (
    <div className="empty-state">
      <div className="empty-card">
        <h2>An empty realm</h2>
        <p>Every dynasty begins with one name. Whose shall it be?</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const id = actions.addPerson({ given: given.trim(), surname: surname.trim() });
            setTimeout(() => openDossier(id), 50);
          }}
        >
          <div className="row2">
            <input value={given} onChange={(e) => setGiven(e.target.value)} placeholder="Given name" autoFocus />
            <input value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Surname" />
          </div>
          <button className="btn primary" type="submit">
            Begin the chronicle
          </button>
        </form>
      </div>
    </div>
  );
}
