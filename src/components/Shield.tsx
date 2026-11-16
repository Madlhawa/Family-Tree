import { memo, useId, type ReactNode } from 'react';
import { chargePositions, TINCTURES, type Arms, type Charge, type Tincture } from '../model/heraldry';

const SHIELD = 'M6,4 H94 V52 C94,84 72,104 50,116 C28,104 6,84 6,52 Z';
const LOZENGE = 'M50,2 L96,60 L50,118 L4,60 Z';
const INK = '#2a1a0b';

const col = (t: Tincture) => TINCTURES[t].color;

function star(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Draws a charge in a unit box [-1,1], transformed to (x, y) at size s. */
export function ChargeGlyph({ charge, x, y, s, fill }: { charge: Charge | 'label' | 'martlet'; x: number; y: number; s: number; fill: string }) {
  const common = { fill, stroke: INK, strokeWidth: 0.07, strokeLinejoin: 'round' as const };
  let body: ReactNode = null;
  switch (charge) {
    case 'mullet':
      body = <polygon points={star(0, 0.05, 1)} {...common} />;
      break;
    case 'crescent':
      body = <path d="M-0.85,-0.3 A0.9,0.9 0 1,0 0.85,-0.3 A0.85,0.85 0 0,1 -0.85,-0.3 Z" {...common} />;
      break;
    case 'roundel':
      body = <circle r={0.8} {...common} />;
      break;
    case 'annulet':
      body = (
        <>
          <circle r={0.75} fill="none" stroke={INK} strokeWidth={0.36} />
          <circle r={0.75} fill="none" stroke={fill} strokeWidth={0.24} />
        </>
      );
      break;
    case 'lozenge':
      body = <polygon points="0,-1 0.65,0 0,1 -0.65,0" {...common} />;
      break;
    case 'heart':
      body = <path d="M0,0.9 C-0.9,0.2 -1,-0.5 -0.5,-0.8 C-0.2,-0.95 0,-0.7 0,-0.5 C0,-0.7 0.2,-0.95 0.5,-0.8 C1,-0.5 0.9,0.2 0,0.9 Z" {...common} />;
      break;
    case 'fleur':
      body = (
        <g {...common}>
          <path d="M0,-1 C0.3,-0.6 0.32,-0.2 0,0.22 C-0.32,-0.2 -0.3,-0.6 0,-1 Z" />
          <path d="M0.12,0.1 C0.45,-0.55 1.05,-0.3 0.82,0.2 C0.72,-0.05 0.45,-0.02 0.3,0.3 Z" />
          <path d="M-0.12,0.1 C-0.45,-0.55 -1.05,-0.3 -0.82,0.2 C-0.72,-0.05 -0.45,-0.02 -0.3,0.3 Z" />
          <rect x={-0.48} y={0.2} width={0.96} height={0.18} rx={0.04} />
          <path d="M-0.16,0.38 L0.16,0.38 L0.32,0.92 C0.12,0.72 -0.12,0.72 -0.32,0.92 Z" />
        </g>
      );
      break;
    case 'rose': {
      const petals = Array.from({ length: 5 }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        return <circle key={i} cx={0.48 * Math.cos(a)} cy={0.48 * Math.sin(a)} r={0.45} {...common} />;
      });
      body = (
        <>
          {petals}
          <circle r={0.3} fill={fill === col('or') ? col('gules') : col('or')} stroke={INK} strokeWidth={0.07} />
        </>
      );
      break;
    }
    case 'tower':
      body = (
        <g {...common}>
          <path d="M-0.6,1 L-0.6,-0.45 L-0.75,-0.45 L-0.75,-0.95 L-0.45,-0.95 L-0.45,-0.7 L-0.15,-0.7 L-0.15,-0.95 L0.15,-0.95 L0.15,-0.7 L0.45,-0.7 L0.45,-0.95 L0.75,-0.95 L0.75,-0.45 L0.6,-0.45 L0.6,1 Z" />
          <path d="M-0.22,1 L-0.22,0.4 A0.22,0.22 0 0,1 0.22,0.4 L0.22,1 Z" fill={INK} />
          <rect x={-0.08} y={-0.25} width={0.16} height={0.3} fill={INK} />
        </g>
      );
      break;
    case 'crown':
      body = (
        <g {...common}>
          <path d="M-0.85,0.45 L-0.9,-0.45 L-0.45,0.05 L0,-0.7 L0.45,0.05 L0.9,-0.45 L0.85,0.45 Z" />
          <rect x={-0.88} y={0.42} width={1.76} height={0.36} rx={0.05} />
          <circle cx={0} cy={-0.78} r={0.12} />
          <circle cx={-0.9} cy={-0.52} r={0.1} />
          <circle cx={0.9} cy={-0.52} r={0.1} />
        </g>
      );
      break;
    case 'key':
      body = (
        <g {...common}>
          <path d="M0,-0.95 A0.35,0.35 0 1,1 -0.001,-0.95 Z M0,-0.8 A0.18,0.18 0 1,0 0.001,-0.8 Z" fillRule="evenodd" transform="translate(0,0.05)" />
          <rect x={-0.09} y={-0.28} width={0.18} height={1.22} />
          <rect x={0.09} y={0.55} width={0.35} height={0.14} />
          <rect x={0.09} y={0.78} width={0.28} height={0.14} />
        </g>
      );
      break;
    case 'sword':
      body = (
        <g {...common}>
          <path d="M-0.11,-0.48 L0.11,-0.48 L0.11,0.78 L0,1 L-0.11,0.78 Z" />
          <rect x={-0.48} y={-0.6} width={0.96} height={0.14} rx={0.05} />
          <rect x={-0.08} y={-0.9} width={0.16} height={0.3} />
          <circle cx={0} cy={-0.95} r={0.1} />
        </g>
      );
      break;
    case 'label':
      body = (
        <g {...common}>
          <rect x={-1} y={-0.35} width={2} height={0.3} />
          <path d="M-0.75,-0.05 L-0.45,-0.05 L-0.4,0.6 L-0.8,0.6 Z" />
          <path d="M-0.15,-0.05 L0.15,-0.05 L0.2,0.6 L-0.2,0.6 Z" />
          <path d="M0.45,-0.05 L0.75,-0.05 L0.8,0.6 L0.4,0.6 Z" />
        </g>
      );
      break;
    case 'martlet':
      body = <path d="M-1,0 C-0.5,-0.6 0.3,-0.5 0.6,-0.2 L1,-0.45 L0.82,0 L1,0.35 L0.5,0.12 C0.2,0.42 -0.5,0.4 -1,0 Z" {...common} />;
      break;
    default:
      body = null;
  }
  return <g transform={`translate(${x},${y}) scale(${s})`}>{body}</g>;
}

const CADENCY_GLYPH: Record<number, Charge | 'label' | 'martlet'> = {
  1: 'label',
  2: 'crescent',
  3: 'mullet',
  4: 'martlet',
  5: 'annulet',
  6: 'fleur',
  7: 'rose',
};

interface Props {
  arms: Arms;
  shape?: 'shield' | 'lozenge';
  cadency?: number;
  size?: number;
  className?: string;
  title?: string;
}

function ShieldImpl({ arms, shape = 'shield', cadency, size = 48, className, title }: Props) {
  const id = useId().replace(/:/g, '');
  const outline = shape === 'lozenge' ? LOZENGE : SHIELD;
  const a = arms;
  const t1 = col(a.t1);
  const t2 = col(a.t2);
  const oc = col(a.ordinaryT);
  const field: ReactNode[] = [<rect key="f" x={0} y={0} width={100} height={120} fill={t1} />];
  switch (a.division) {
    case 'perPale':
      field.push(<rect key="d" x={50} y={0} width={50} height={120} fill={t2} />);
      break;
    case 'perFess':
      field.push(<rect key="d" x={0} y={56} width={100} height={64} fill={t2} />);
      break;
    case 'perBend':
      field.push(<polygon key="d" points="0,0 100,120 0,120" fill={t2} />);
      break;
    case 'perChevron':
      field.push(<polygon key="d" points="0,120 0,105 50,52 100,105 100,120" fill={t2} />);
      break;
    case 'quarterly':
      field.push(<rect key="d1" x={50} y={0} width={50} height={56} fill={t2} />, <rect key="d2" x={0} y={56} width={50} height={64} fill={t2} />);
      break;
    case 'perSaltire':
      field.push(<polygon key="d1" points="0,0 50,56 0,120" fill={t2} />, <polygon key="d2" points="100,0 50,56 100,120" fill={t2} />);
      break;
  }
  const ordinary: ReactNode = (() => {
    const sw = { stroke: oc, fill: 'none' };
    switch (a.ordinary) {
      case 'fess':
        return <rect x={0} y={42} width={100} height={30} fill={oc} />;
      case 'pale':
        return <rect x={36} y={0} width={28} height={120} fill={oc} />;
      case 'bend':
        return <line x1={-5} y1={-6} x2={105} y2={126} strokeWidth={22} {...sw} />;
      case 'chevron':
        return <polyline points="-4,104 50,46 104,104" strokeWidth={18} strokeLinejoin="miter" {...sw} />;
      case 'cross':
        return (
          <>
            <rect x={38} y={0} width={24} height={120} fill={oc} />
            <rect x={0} y={44} width={100} height={24} fill={oc} />
          </>
        );
      case 'saltire':
        return (
          <>
            <line x1={-5} y1={-6} x2={105} y2={126} strokeWidth={18} {...sw} />
            <line x1={105} y1={-6} x2={-5} y2={126} strokeWidth={18} {...sw} />
          </>
        );
      case 'chief':
        return <rect x={0} y={0} width={100} height={36} fill={oc} />;
      case 'bordure':
        return <path d={outline} fill="none" stroke={oc} strokeWidth={20} />;
      default:
        return null;
    }
  })();
  const charges =
    a.charge === 'none'
      ? null
      : chargePositions(a).map(([x, y, s], i) => <ChargeGlyph key={i} charge={a.charge} x={x} y={y} s={s} fill={col(a.chargeT)} />);
  const cadGlyph = cadency ? CADENCY_GLYPH[cadency] : undefined;
  const cadFill = TINCTURES[a.t1].metal ? col('sable') : col('argent');
  return (
    <svg className={className} width={size} height={size * 1.2} viewBox="0 0 100 120" role="img" aria-label={title ?? 'Coat of arms'}>
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={`c${id}`}>
          <path d={outline} />
        </clipPath>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#c${id})`}>
        {field}
        {ordinary}
        {charges}
        {cadGlyph && <ChargeGlyph charge={cadGlyph} x={50} y={cadGlyph === 'label' ? 14 : 13} s={cadGlyph === 'label' ? 14 : 6.5} fill={cadFill} />}
        <rect x={0} y={0} width={100} height={120} fill={`url(#g${id})`} />
      </g>
      <path d={outline} fill="none" stroke="#b08a3a" strokeWidth={4} />
      <path d={outline} fill="none" stroke={INK} strokeWidth={1.2} opacity={0.6} />
    </svg>
  );
}

export const Shield = memo(ShieldImpl);
