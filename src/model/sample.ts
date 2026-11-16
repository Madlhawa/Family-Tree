import type { Confidence, Dynasty, EventType, Person, Sex, Union, UnionStatus, ChildKind } from './types';
import { emptyDynasty, newPerson, uid } from './types';

/** A fictional demonstration dynasty — House Ashcombe — so the realm isn't empty on first visit. */
export function sampleDynasty(): Dynasty {
  const d = emptyDynasty('House Ashcombe');
  d.motto = 'Per Ardua Fidelis';

  const P = (
    key: string,
    given: string,
    surname: string,
    sex: Sex,
    born?: string,
    died?: string,
    extra: Partial<Person> = {},
  ): string => {
    const events: Person['events'] = [];
    if (born) events.push({ id: uid('e'), type: 'birth', date: born, confidence: 'probable' });
    if (died) events.push({ id: uid('e'), type: 'death', date: died, confidence: 'probable' });
    const p = newPerson({ id: key, given, surname, sex, events, ...extra });
    if (extra.events) p.events = [...events, ...extra.events];
    d.people[key] = p;
    return key;
  };
  const E = (type: EventType, date: string | undefined, place?: string, confidence: Confidence = 'probable', extra: { label?: string; note?: string; source?: string } = {}) => ({
    id: uid('e'),
    type,
    date,
    place,
    confidence,
    ...extra,
  });
  const U = (partners: string[], children: (string | [string, ChildKind])[], status: UnionStatus = 'married', date?: string, place?: string): Union => {
    const u: Union = {
      id: uid('u'),
      partners,
      children: children.map((c) => (Array.isArray(c) ? { id: c[0], kind: c[1] } : { id: c, kind: 'birth' as ChildKind })),
      status,
      date,
      place,
    };
    d.unions[u.id] = u;
    return u;
  };

  // Generation 0 — the Vardens (in-law ancestors)
  P('godfrey', 'Godfrey', 'Varden', 'M', 'c. 1795', '1860', { title: 'Lord', epithet: 'the Elder' });
  P('rosamund', 'Rosamund', 'Varden', 'F', '1800', '1871', { birthSurname: 'Hale' });
  P('percival', 'Percival', 'Varden', 'M', '1828', '1899');

  // Generation 1 — the founder
  P('aldric', 'Aldric', 'Ashcombe', 'M', undefined, undefined, {
    title: 'Sir',
    epithet: 'the Builder',
    occupation: 'Master mason & mill owner',
    bio:
      'Born the son of a stonecutter, Aldric raised the great mill at Ashcombe Ford with his own hands and, it is said, a borrowed horse. ' +
      'Knighted for the bridge works of 1862, he took for his arms a chevron between three towers — one for each bridge he swore to build. ' +
      'Family legend holds he was born in a snowstorm in 1819; the parish register insists on 1821.',
    arms: { division: 'plain', t1: 'azure', t2: 'or', ordinary: 'chevron', ordinaryT: 'or', charge: 'tower', chargeT: 'argent', count: 3, shape: 'auto' },
    events: [
      E('birth', '3 Mar 1821', 'Ashcombe Ford', 'verified', { source: 'Parish register of St Bride, 1821, folio 12' }),
      E('birth', 'c. 1819', 'Ashcombe Ford', 'legend', { note: 'Family tradition: “born in the great snow”.' }),
      E('title', '1862', 'London', 'verified', { label: 'Knighted', source: 'London Gazette, 1862' }),
      E('death', '14 Nov 1889', 'Ashcombe Hall', 'verified', { source: 'Death certificate' }),
    ],
  });
  P('eleanor', 'Eleanor', 'Ashcombe', 'F', '1825', '1901', { birthSurname: 'Varden', title: 'Lady', epithet: 'the Steadfast' });

  // Generation 2
  P('edmund', 'Edmund', 'Ashcombe', 'M', '1848', '1917', { occupation: 'Mill owner' });
  P('margaret', 'Margaret', 'Holloway', 'F', '1851', '1930', { birthSurname: 'Ashcombe', occupation: 'Schoolmistress' });
  P('thomas', 'Thomas', 'Ashcombe', 'M', '1855', '1880', { epithet: 'the Wanderer', events: [E('migration', '1876', 'Cape Colony', 'legend', { label: 'Sailed for the Cape' })] });
  P('catherine', 'Catherine', 'Ashcombe', 'F', '1850', '1878', { birthSurname: 'Thorne' });
  P('isolde', 'Isolde', 'Ashcombe', 'F', '1856', '1935', { birthSurname: 'Grey' });
  P('william', 'William', 'Holloway', 'M', '1847', '1910', { occupation: 'Clockmaker' });

  // Generation 3
  P('robert', 'Robert', 'Ashcombe', 'M', '1872', '1944');
  P('alice', 'Alice', 'Ashcombe', 'F', '1875', '1951');
  P('henry', 'Henry', 'Ashcombe', 'M', '1881', '1952', { events: [E('migration', '1905', 'Halifax, Nova Scotia', 'verified', { label: 'Emigrated to Canada', source: 'Passenger list, SS Parisian' })] });
  P('agnes', 'Agnes', 'Holloway', 'F', '1878', '1960');
  P('clara', 'Clara', 'Ashcombe', 'F', '1876', '1950', { birthSurname: 'Bennett' });

  // Generation 4
  P('arthur', 'Arthur', 'Ashcombe', 'M', '1899', '1965', {
    events: [E('military', '1940–1945', 'North Africa & Italy', 'verified', { label: 'Royal Engineers', source: 'Service record' })],
  });
  P('beatrice', 'Beatrice', 'Ashcombe', 'F', '1902', '1990');
  P('samuel', 'Samuel', 'Ashcombe', 'M', '1910', '1983');
  P('helen', 'Helen', 'Ashcombe', 'F', '1903', '1988', { birthSurname: 'Marsh' });

  // Generation 5
  P('george', 'George', 'Ashcombe', 'M', '1928', '2004', { occupation: 'Engineer' });
  P('nell', 'Eleanor', 'Ashcombe', 'F', '1931', '2019', { altNames: ['Nell'], epithet: 'the Storyteller' });
  P('patricia', 'Patricia', 'Ashcombe', 'F', '1932', '2015', { birthSurname: 'Lowe' });

  // Generation 6 — living
  P('david', 'David', 'Ashcombe', 'M', '1958', undefined, { occupation: 'Architect' });
  P('susan', 'Susan', 'Ashcombe', 'F', '1961');
  P('priya', 'Priya', 'Ashcombe', 'F', '1962', undefined, { birthSurname: 'Nair', occupation: 'Physician' });

  // Generation 7 — living
  P('oliver', 'Oliver', 'Ashcombe', 'M', '1990', undefined, {
    socials: [
      { id: uid('s'), platform: 'Instagram', handle: 'oliver.ashcombe.example' },
      { id: uid('s'), platform: 'GitHub', handle: 'oliver-example' },
    ],
  });
  P('maya', 'Maya', 'Ashcombe', 'F', '1993', undefined, {
    links: [{ id: uid('l'), label: 'Personal site', url: 'https://example.com' }],
  });

  U(['godfrey', 'rosamund'], ['eleanor', 'percival']);
  U(['aldric', 'eleanor'], ['edmund', 'margaret', 'thomas'], 'married', '12 Jun 1846', 'St Bride, Ashcombe');
  U(['edmund', 'catherine'], ['robert', 'alice'], 'widowed', '1871');
  U(['edmund', 'isolde'], ['henry'], 'married', '1880');
  U(['william', 'margaret'], ['agnes'], 'married', '1876');
  U(['robert', 'clara'], ['arthur', 'beatrice'], 'married', '1898');
  U(['henry'], [['samuel', 'adopted']], 'unknown');
  U(['arthur', 'helen'], ['george', 'nell'], 'married', '1926');
  U(['george', 'patricia'], ['david', 'susan'], 'married', '1956');
  U(['david', 'priya'], ['oliver', 'maya'], 'married', '1988');

  d.rootId = 'david';
  d.houses['Ashcombe'] = { surname: 'Ashcombe', motto: 'Per Ardua Fidelis', arms: d.people.aldric.arms };
  d.heirlooms['ring'] = {
    id: 'ring',
    name: 'The Ashcombe Signet',
    description: 'A gold signet engraved with the three towers, worn by each head of the House.',
    custodians: ['aldric', 'edmund', 'robert', 'arthur', 'george', 'david'],
  };
  d.sagas['rise'] = {
    id: 'rise',
    title: 'The Rise of House Ashcombe',
    steps: [
      { personId: 'aldric', caption: 'A stonecutter’s son raises a mill — and a House — at Ashcombe Ford.' },
      { personId: 'eleanor', caption: 'Lady Eleanor of the Vardens brings an old name and a steady hand.' },
      { personId: 'edmund', caption: 'Edmund, twice wed, holds the mill through lean decades.' },
      { personId: 'henry', caption: 'Henry sails for Canada in 1905, carrying the name across the sea.' },
      { personId: 'arthur', caption: 'Arthur serves with the Royal Engineers from North Africa to Italy.' },
      { personId: 'oliver', caption: 'And the line continues.' },
    ],
  };
  d.annals.push({ id: uid('a'), at: Date.now(), text: 'The chronicle of House Ashcombe was opened.' });
  return d;
}
