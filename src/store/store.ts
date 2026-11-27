import { create } from 'zustand';
import { produce, setAutoFreeze } from 'immer';
import type { Dynasty, Person, Union } from '../model/types';
import { newPerson, uid } from '../model/types';
import { sampleDynasty } from '../model/sample';
import * as ops from '../model/ops';
import { loadDynasty, loadPref, saveDynasty, savePref } from './persist';
import { fullName } from '../model/graph';

setAutoFreeze(false);

// ---------------------------------------------------------------- Data store

interface DataState {
  d: Dynasty;
  loaded: boolean;
  past: Dynasty[];
  future: Dynasty[];
  savedAt?: number;
}

export const useData = create<DataState>(() => ({
  d: sampleDynasty(),
  loaded: false,
  past: [],
  future: [],
}));

let saveTimer: number | undefined;
function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    await saveDynasty(useData.getState().d);
    useData.setState({ savedAt: Date.now() });
  }, 400);
}

export async function initData() {
  const stored = await loadDynasty();
  if (stored && stored.version === 1 && stored.people) useData.setState({ d: stored, loaded: true });
  else {
    useData.setState({ loaded: true });
    scheduleSave();
  }
}

/** Apply a named change; it lands in the Annals and on the undo stack. */
export function commit(text: string, recipe: (d: Dynasty) => void) {
  const { d, past } = useData.getState();
  const next = produce(d, (draft) => {
    recipe(draft);
    draft.annals.push({ id: uid('a'), at: Date.now(), text });
    if (draft.annals.length > 500) draft.annals.splice(0, draft.annals.length - 500);
  });
  useData.setState({ d: next, past: [...past.slice(-80), d], future: [] });
  scheduleSave();
}

export function undo() {
  const { d, past, future } = useData.getState();
  const prev = past[past.length - 1];
  if (!prev) return;
  useData.setState({ d: prev, past: past.slice(0, -1), future: [d, ...future] });
  scheduleSave();
  toast('Undone');
}

export function redo() {
  const { d, past, future } = useData.getState();
  const next = future[0];
  if (!next) return;
  useData.setState({ d: next, past: [...past, d], future: future.slice(1) });
  scheduleSave();
  toast('Redone');
}

export function replaceDynasty(next: Dynasty) {
  const { d, past } = useData.getState();
  useData.setState({ d: next, past: [...past.slice(-80), d], future: [] });
  useUI.setState({ selectedId: next.rootId, focusId: undefined, dossierId: undefined, collapsedDown: new Set(), collapsedUp: new Set() });
  scheduleSave();
}

// ---- Convenience actions -----------------------------------------------------

export const actions = {
  addRelative(anchorId: string, rel: ops.RelKind, data: Partial<Person>, opts: ops.AddOptions = {}): string {
    let id = '';
    const anchor = useData.getState().d.people[anchorId];
    const label = data.given || data.surname ? `${data.given ?? ''} ${data.surname ?? ''}`.trim() : 'an unknown soul';
    commit(`Added ${label} as ${rel} of ${fullName(anchor)}`, (d) => {
      id = ops.addRelative(d, anchorId, rel, data, opts);
    });
    return id;
  },
  addPerson(data: Partial<Person>): string {
    let id = '';
    commit(`Added ${data.given ?? 'a person'}`, (d) => {
      const p = newPerson(data);
      d.people[p.id] = p;
      if (!d.rootId) d.rootId = p.id;
      id = p.id;
    });
    return id;
  },
  updatePerson(id: string, patch: Partial<Person>, text?: string) {
    commit(text ?? `Amended the record of ${fullName(useData.getState().d.people[id])}`, (d) => {
      const p = d.people[id];
      if (!p) return;
      Object.assign(p, patch, { updatedAt: Date.now() });
    });
  },
  editPerson(id: string, text: string, recipe: (p: Person) => void) {
    commit(text, (d) => {
      const p = d.people[id];
      if (p) {
        recipe(p);
        p.updatedAt = Date.now();
      }
    });
  },
  deletePerson(id: string) {
    const name = fullName(useData.getState().d.people[id]);
    commit(`Struck ${name} from the chronicle`, (d) => ops.deletePerson(d, id));
    const ui = useUI.getState();
    if (ui.selectedId === id) useUI.setState({ selectedId: undefined });
    if (ui.dossierId === id) useUI.setState({ dossierId: undefined });
    if (ui.focusId === id) useUI.setState({ focusId: undefined });
  },
  merge(keepId: string, dropId: string) {
    const d0 = useData.getState().d;
    commit(`Merged ${fullName(d0.people[dropId])} into ${fullName(d0.people[keepId])}`, (d) => ops.mergePeople(d, keepId, dropId));
  },
  updateUnion(id: string, patch: Partial<Union>) {
    commit('Amended a union', (d) => {
      if (d.unions[id]) Object.assign(d.unions[id], patch);
    });
  },
  reorderChildren(unionId: string, orderedIds: string[]) {
    commit('Rearranged the order of siblings', (d) => ops.reorderChildren(d, unionId, orderedIds));
  },
  resetChildOrder(unionId: string) {
    commit('Put siblings back in birth order', (d) => {
      if (d.unions[unionId]) d.unions[unionId].manualOrder = undefined;
    });
  },
  unlinkChild(unionId: string, childId: string) {
    commit('Removed a parent–child link', (d) => ops.unlinkChild(d, unionId, childId));
  },
  unlinkPartner(unionId: string, partnerId: string) {
    commit('Dissolved a union', (d) => ops.unlinkPartner(d, unionId, partnerId));
  },
  setRoot(id: string) {
    commit(`Made ${fullName(useData.getState().d.people[id])} the heart of the tree`, (d) => {
      d.rootId = id;
    });
  },
};

// ---------------------------------------------------------------- UI store

export type Mode = 'family' | 'ancestors' | 'descendants' | 'fan';
export type PanelId = 'houses' | 'records' | 'warnings' | 'sagas' | 'annals' | 'dictation' | 'treasury' | 'heirlooms' | 'help';
export type DossierTab = 'chronicle' | 'events' | 'gallery' | 'heraldry' | 'relations' | 'links';

export interface QuickAddState {
  anchorId: string;
  rel: ops.RelKind;
  x: number;
  y: number;
}

interface UIState {
  selectedId?: string;
  focusId?: string;
  mode: Mode;
  fanDepth: number;
  collapsedUp: Set<string>;
  collapsedDown: Set<string>;
  dossierId?: string;
  dossierTab: DossierTab;
  panel: PanelId | null;
  quickAdd?: QuickAddState;
  thread: { a?: string; b?: string } | null;
  timeYear: number | null;
  privacy: boolean;
  theme: 'parchment' | 'candle';
  plain: boolean;
  crests: boolean;
  /** Heraldry & dynasty extras: crests, epithets, mottos, the heraldry tab */
  extras: boolean;
  searchOpen: boolean;
  highlightHouse?: string;
  bookOpen: boolean;
  saga?: { id: string; step: number };
  toast?: { text: string; at: number };
  stamp: number;
  newTreeOpen: boolean;
  confirmReq?: ConfirmRequest;
}

export interface ConfirmRequest {
  text: string;
  okLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export const useUI = create<UIState>(() => ({
  mode: 'family',
  fanDepth: 5,
  collapsedUp: new Set(),
  collapsedDown: new Set(),
  dossierTab: 'chronicle',
  panel: null,
  thread: null,
  timeYear: null,
  privacy: loadPref('privacy', false),
  theme: loadPref('theme', prefersDark ? 'candle' : 'parchment'),
  plain: loadPref('plain', false),
  crests: loadPref('crests', false),
  extras: loadPref('extras', false),
  searchOpen: false,
  bookOpen: false,
  stamp: 0,
  newTreeOpen: false,
}));

/** In-app replacement for window.confirm (which some browsers block). */
export function askConfirm(text: string, okLabel = 'Confirm', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    useUI.getState().confirmReq?.resolve(false);
    useUI.setState({
      confirmReq: {
        text,
        okLabel,
        danger,
        resolve: (ok) => {
          useUI.setState({ confirmReq: undefined });
          resolve(ok);
        },
      },
    });
  });
}

useUI.subscribe((s, prev) => {
  if (s.theme !== prev.theme) savePref('theme', s.theme);
  if (s.plain !== prev.plain) savePref('plain', s.plain);
  if (s.privacy !== prev.privacy) savePref('privacy', s.privacy);
  if (s.crests !== prev.crests) savePref('crests', s.crests);
  if (s.extras !== prev.extras) savePref('extras', s.extras);
});

let toastTimer: number | undefined;
export function toast(text: string) {
  useUI.setState({ toast: { text, at: Date.now() } });
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => useUI.setState({ toast: undefined }), 2600);
}

export function stamp() {
  useUI.setState((s) => ({ stamp: s.stamp + 1 }));
}

export function toggleSet(key: 'collapsedUp' | 'collapsedDown', id: string) {
  useUI.setState((s) => {
    const next = new Set(s[key]);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { [key]: next } as Partial<UIState>;
  });
}

export function select(id: string | undefined, fly = true) {
  useUI.setState({ selectedId: id, quickAdd: undefined });
  if (id && fly) camera.flyTo(id);
}

export function openDossier(id: string, tab: DossierTab = 'chronicle') {
  useUI.setState({ dossierId: id, dossierTab: tab, selectedId: id, quickAdd: undefined });
}

// ---------------------------------------------------------------- Camera bus

type FlyListener = (id: string, zoom?: number) => void;
const flyListeners = new Set<FlyListener>();
let fitListener: (() => void) | undefined;
export const camera = {
  flyTo(id: string, zoom?: number) {
    flyListeners.forEach((l) => l(id, zoom));
  },
  onFly(l: FlyListener) {
    flyListeners.add(l);
    return () => void flyListeners.delete(l);
  },
  fit() {
    fitListener?.();
  },
  onFit(l: () => void) {
    fitListener = l;
    return () => {
      if (fitListener === l) fitListener = undefined;
    };
  },
};
