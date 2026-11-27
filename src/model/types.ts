import type { Arms } from './heraldry';

export type Sex = 'M' | 'F' | 'U';

/** How sure we are of a fact — rendered as a coloured wax seal. */
export type Confidence = 'verified' | 'probable' | 'legend';

export type EventType =
  | 'birth'
  | 'baptism'
  | 'death'
  | 'burial'
  | 'residence'
  | 'occupation'
  | 'education'
  | 'military'
  | 'migration'
  | 'title'
  | 'custom';

export interface LifeEvent {
  id: string;
  type: EventType;
  /** Free label for custom events ("Knighted", "Opened the mill") */
  label?: string;
  /** Free-form, fuzzy date ("c. 1820", "bef. 1900", "1850-1855", "12 Mar 1902") */
  date?: string;
  place?: string;
  note?: string;
  confidence?: Confidence;
  source?: string;
}

export interface MediaItem {
  id: string;
  kind: 'image' | 'audio';
  /** data: URL — everything stays local */
  data: string;
  caption?: string;
}

export interface LinkItem {
  id: string;
  label: string;
  url: string;
}

export interface SocialHandle {
  id: string;
  platform: string;
  handle: string;
}

export type LivingStatus = 'auto' | 'living' | 'deceased';

export interface Person {
  id: string;
  given: string;
  surname: string;
  /** Surname at birth — defines the person's House */
  birthSurname?: string;
  altNames?: string[];
  title?: string;
  epithet?: string;
  sex: Sex;
  living: LivingStatus;
  occupation?: string;
  bio?: string;
  portrait?: string;
  events: LifeEvent[];
  media: MediaItem[];
  links: LinkItem[];
  socials: SocialHandle[];
  /** Personal arms. When absent, arms are inherited from the father or the House. */
  arms?: Arms;
  /** An "unknown" slot created to keep the structure right; fill in later. */
  placeholder?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ChildKind = 'birth' | 'adopted' | 'step' | 'foster';
export type UnionStatus = 'married' | 'partners' | 'divorced' | 'widowed' | 'unknown';

export interface UnionChild {
  id: string;
  kind: ChildKind;
}

/**
 * A union is the GEDCOM "FAM" concept: up to two partners plus the children
 * of that partnership. Half-siblings fall out of this for free.
 */
export interface Union {
  id: string;
  partners: string[];
  children: UnionChild[];
  status: UnionStatus;
  date?: string;
  place?: string;
  confidence?: Confidence;
  source?: string;
  /** Children were arranged by hand: keep `children` order instead of sorting by birth */
  manualOrder?: boolean;
}

export interface Heirloom {
  id: string;
  name: string;
  description?: string;
  /** Ordered chain of custody, earliest first */
  custodians: string[];
  image?: string;
}

export interface SagaStep {
  personId: string;
  caption: string;
}

export interface Saga {
  id: string;
  title: string;
  steps: SagaStep[];
}

export interface HouseInfo {
  surname: string;
  arms?: Arms;
  motto?: string;
}

export interface Annal {
  id: string;
  at: number;
  text: string;
}

export interface Dynasty {
  version: 1;
  name: string;
  motto?: string;
  /** The "home" person the tree is laid out from */
  rootId?: string;
  people: Record<string, Person>;
  unions: Record<string, Union>;
  houses: Record<string, HouseInfo>;
  heirlooms: Record<string, Heirloom>;
  sagas: Record<string, Saga>;
  annals: Annal[];
}

export const uid = (prefix = ''): string =>
  prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export function emptyDynasty(name = 'A New Dynasty'): Dynasty {
  return { version: 1, name, people: {}, unions: {}, houses: {}, heirlooms: {}, sagas: {}, annals: [] };
}

export function newPerson(p: Partial<Person> = {}): Person {
  const now = Date.now();
  return {
    id: p.id ?? uid('p'),
    given: '',
    surname: '',
    sex: 'U',
    living: 'auto',
    events: [],
    media: [],
    links: [],
    socials: [],
    createdAt: now,
    updatedAt: now,
    ...p,
  };
}
