import { CHARGES, DIVISIONS, ORDINARIES, TINCTURES, blazon, tinctureWarnings, type Arms, type Tincture } from '../model/heraldry';
import { Shield } from './Shield';

function TinctureRow({ label, value, onChange }: { label: string; value: Tincture; onChange: (t: Tincture) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="tinctures" role="radiogroup" aria-label={label}>
        {(Object.keys(TINCTURES) as Tincture[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`tincture ${value === t ? 'on' : ''}`}
            style={{ background: TINCTURES[t].color }}
            title={`${TINCTURES[t].name}${TINCTURES[t].metal ? ' (metal)' : ' (colour)'}`}
            aria-label={TINCTURES[t].name}
            aria-checked={value === t}
            role="radio"
            onClick={() => onChange(t)}
          />
        ))}
      </div>
    </div>
  );
}

/** Design a coat of arms: the blazon and the rule of tincture update live. */
export function ArmsEditor({ arms, onChange, preview = true }: { arms: Arms; onChange: (a: Arms) => void; preview?: boolean }) {
  const set = (patch: Partial<Arms>) => onChange({ ...arms, ...patch });
  const warns = tinctureWarnings(arms);
  return (
    <div className="arms-editor">
      {preview && (
        <div className="arms-preview">
          <Shield arms={arms} shape={arms.shape === 'lozenge' ? 'lozenge' : 'shield'} size={110} />
          <p className="blazon">{blazon(arms)}</p>
        </div>
      )}
      <div className="row2">
        <label className="field">
          <span>Field</span>
          <select value={arms.division} onChange={(e) => set({ division: e.target.value as Arms['division'] })}>
            {Object.entries(DIVISIONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Shape</span>
          <select value={arms.shape ?? 'auto'} onChange={(e) => set({ shape: e.target.value as Arms['shape'] })}>
            <option value="auto">Traditional (auto)</option>
            <option value="shield">Heater shield</option>
            <option value="lozenge">Lozenge</option>
          </select>
        </label>
      </div>
      <TinctureRow label="First tincture" value={arms.t1} onChange={(t1) => set({ t1 })} />
      {arms.division !== 'plain' && <TinctureRow label="Second tincture" value={arms.t2} onChange={(t2) => set({ t2 })} />}
      <label className="field">
        <span>Ordinary</span>
        <select value={arms.ordinary} onChange={(e) => set({ ordinary: e.target.value as Arms['ordinary'] })}>
          {Object.entries(ORDINARIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {arms.ordinary !== 'none' && <TinctureRow label="Ordinary tincture" value={arms.ordinaryT} onChange={(ordinaryT) => set({ ordinaryT })} />}
      <div className="row2">
        <label className="field">
          <span>Charge</span>
          <select value={arms.charge} onChange={(e) => set({ charge: e.target.value as Arms['charge'] })}>
            {Object.entries(CHARGES).map(([k, v]) => (
              <option key={k} value={k}>
                {k === 'none' ? 'None' : v.name[0].toUpperCase() + v.name.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Number</span>
          <select value={arms.count} onChange={(e) => set({ count: +e.target.value as Arms['count'] })} disabled={arms.charge === 'none'}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {arms.charge !== 'none' && <TinctureRow label="Charge tincture" value={arms.chargeT} onChange={(chargeT) => set({ chargeT })} />}
      {warns.length > 0 && (
        <ul className="herald-warn">
          {warns.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
