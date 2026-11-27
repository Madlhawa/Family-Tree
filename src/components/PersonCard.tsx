import { memo } from 'react';
import type { Person } from '../model/types';
import type { ResolvedArms } from '../model/arms';
import { fullName, houseOf, initials, isLiving, lifespanShort } from '../model/graph';
import { CARD_H, CARD_W } from '../layout/familyLayout';
import { Shield } from './Shield';

export type TimeState = 'alive' | 'dead' | 'unborn' | 'unknown' | undefined;

interface Props {
  p: Person;
  x: number;
  y: number;
  arms: ResolvedArms;
  color: string;
  selected: boolean;
  dim: boolean;
  glow: boolean;
  warn: number;
  privacy: boolean;
  time: TimeState;
  isRoot: boolean;
  pickHint: boolean;
  /** Show the coat of arms instead of a silhouette when there is no photo */
  crest: boolean;
  /** Heraldry & dynasty extras switched on */
  extras: boolean;
}

/** A neutral silhouette tinted with the House colour, for people without a photo. */
export function Avatar({ sex, size = 60 }: { sex: string; size?: number }) {
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 60 60" aria-hidden>
      <circle cx="30" cy="30" r="30" fill="var(--house)" />
      <circle cx="30" cy="23" r="10.5" fill="rgba(255,244,220,0.85)" />
      <path d={sex === 'F' ? 'M10,54 C12,40 20,35 30,35 C40,35 48,40 50,54 Z' : 'M9,54 C10,41 19,35 30,35 C41,35 50,41 51,54 Z'} fill="rgba(255,244,220,0.85)" />
      {sex === 'F' && <path d="M19.5,24 C19,13 25,10.5 30,10.5 C35,10.5 41,13 40.5,24 C38,18 35,16 30,16 C25,16 22,18 19.5,24 Z" fill="rgba(255,244,220,0.95)" />}
    </svg>
  );
}

/** Small round face for lists: the photo if there is one, else the silhouette. */
export function Face({ p, color, size = 24 }: { p: Person; color: string; size?: number }) {
  return (
    <span className="face" style={{ width: size, height: size, ['--house' as any]: color }}>
      {p.portrait ? <img src={p.portrait} alt="" /> : <Avatar sex={p.sex} size={size} />}
    </span>
  );
}

function PersonCardImpl({ p, x, y, arms, color, selected, dim, glow, warn, privacy, time, isRoot, pickHint, crest, extras }: Props) {
  const living = isLiving(p);
  const hidden = privacy && living;
  const name = hidden ? `Living ${p.surname || 'Member'}` : fullName(p);
  const cls = [
    'card',
    `sex-${p.sex}`,
    p.placeholder && 'placeholder',
    selected && 'selected',
    dim && 'dim',
    glow && 'glow',
    living && 'living',
    time && `t-${time}`,
    isRoot && 'root',
    pickHint && 'pickable',
  ]
    .filter(Boolean)
    .join(' ');
  const house = houseOf(p);
  // One short line: what they did or are remembered for
  const knownFor = hidden || p.placeholder ? '' : p.occupation || (extras ? p.epithet : '') || '';
  return (
    <div
      className={cls}
      data-person={p.id}
      style={{ transform: `translate(${x - CARD_W / 2}px, ${y - CARD_H / 2}px)`, width: CARD_W, height: CARD_H, ['--house' as any]: color }}
    >
      <div className="card-far" aria-hidden>
        <span>{p.placeholder ? '?' : initials(p)}</span>
      </div>
      <div className="card-frame">
        {p.portrait && !hidden ? (
          <img className="card-portrait" src={p.portrait} alt="" draggable={false} />
        ) : crest && extras ? (
          <Shield arms={arms.arms} shape={arms.shape} cadency={arms.cadency} size={62} className="card-shield" />
        ) : (
          <Avatar sex={p.sex} size={76} />
        )}
      </div>
      <div className="card-text">
        <div className="card-name" title={name}>
          {p.placeholder ? <em>Unknown{p.given ? ` ${p.given}` : ''}</em> : hidden ? name : [p.title, name].filter(Boolean).join(' ')}
        </div>
        <div className="card-dates">{hidden ? 'Living' : p.placeholder ? 'Click to fill in' : lifespanShort(p)}</div>
        {knownFor && <div className="card-known" title={knownFor}>{knownFor}</div>}
      </div>
      <div className="card-seal" title={house ? `House ${house}` : undefined}>
        {(house[0] ?? '?').toUpperCase()}
      </div>
      {warn > 0 && (
        <div className="card-warn" title={`${warn} herald’s warning${warn > 1 ? 's' : ''}`}>
          !
        </div>
      )}
      {isRoot && <div className="card-crown" title="Heart of the tree">♛</div>}
    </div>
  );
}

export const PersonCard = memo(PersonCardImpl);
