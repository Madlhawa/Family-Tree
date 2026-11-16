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
}

function PersonCardImpl({ p, x, y, arms, color, selected, dim, glow, warn, privacy, time, isRoot, pickHint }: Props) {
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
        ) : (
          <Shield arms={arms.arms} shape={arms.shape} cadency={arms.cadency} size={44} className="card-shield" />
        )}
      </div>
      <div className="card-text">
        {p.title && !hidden && <div className="card-title">{p.title}</div>}
        <div className="card-name" title={name}>
          {p.placeholder ? <em>Unknown{p.given ? ` ${p.given}` : ''}</em> : name}
        </div>
        {p.epithet && !hidden && <div className="card-epithet">{p.epithet}</div>}
        <div className="card-dates">{hidden ? 'Living' : p.placeholder ? 'Click to fill in' : lifespanShort(p)}</div>
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
