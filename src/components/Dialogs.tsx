import { useEffect, useRef, useState } from 'react';
import { camera, replaceDynasty, select, toast, useData, useUI } from '../store/store';
import type { Sex } from '../model/types';
import { emptyDynasty, newPerson, uid } from '../model/types';
import { download, slug } from '../ui/files';

/** Themed confirmation dialog driven by askConfirm(). */
export function ConfirmDialog() {
  const req = useUI((s) => s.confirmReq);
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => ok.current?.focus(), [req]);
  if (!req) return null;
  return (
    <div className="modal-backdrop dialog-backdrop" data-nopan onMouseDown={(e) => e.target === e.currentTarget && req.resolve(false)}>
      <div className="dialog" role="alertdialog" aria-modal="true" onKeyDown={(e) => e.key === 'Escape' && req.resolve(false)}>
        <p className="dialog-text">{req.text}</p>
        <div className="form-actions">
          <button className="btn ghost" onClick={() => req.resolve(false)}>
            Cancel
          </button>
          <button ref={ok} className={`btn ${req.danger ? 'danger' : 'primary'}`} onClick={() => req.resolve(true)}>
            {req.okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Start a fresh family tree, optionally saving a backup of the current one first. */
export function NewTreeDialog() {
  const open = useUI((s) => s.newTreeOpen);
  const d = useData((s) => s.d);
  const [family, setFamily] = useState('');
  const [given, setGiven] = useState('');
  const [surname, setSurname] = useState('');
  const [sex, setSex] = useState<Sex>('U');
  const [born, setBorn] = useState('');
  const [backup, setBackup] = useState(true);
  const first = useRef<HTMLInputElement>(null);
  const count = Object.keys(d.people).length;

  useEffect(() => {
    if (open) {
      setFamily('');
      setGiven('');
      setSurname('');
      setSex('U');
      setBorn('');
      setBackup(true);
      setTimeout(() => first.current?.focus(), 30);
    }
  }, [open]);
  if (!open) return null;
  const close = () => useUI.setState({ newTreeOpen: false });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (backup && count) download(`${slug(d.name)}-backup.json`, JSON.stringify(d, null, 1), 'application/json');
    const name = family.trim() || (surname.trim() ? `The ${surname.trim()} Family` : 'My Family');
    const fresh = emptyDynasty(name);
    const p = newPerson({
      given: given.trim(),
      surname: surname.trim(),
      sex,
      events: born.trim() ? [{ id: uid('e'), type: 'birth', date: born.trim(), confidence: 'verified' }] : [],
    });
    fresh.people[p.id] = p;
    fresh.rootId = p.id;
    fresh.annals.push({ id: uid('a'), at: Date.now(), text: `Started the family tree “${name}”.` });
    replaceDynasty(fresh);
    useUI.setState({ newTreeOpen: false, mode: 'family', panel: null });
    setTimeout(() => {
      select(p.id);
      camera.flyTo(p.id, 1);
      toast('Your new tree is ready — hover the tile to add parents, a partner or children.');
    }, 120);
  };

  return (
    <div className="modal-backdrop dialog-backdrop" data-nopan onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="dialog new-tree" role="dialog" aria-modal="true" aria-label="Start a new family tree" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <h2>Start a new family tree</h2>
        <p className="muted">Begin with one person — usually yourself — and grow the tree from there.</p>
        <label className="field">
          <span>Family / tree name</span>
          <input value={family} onChange={(e) => setFamily(e.target.value)} placeholder={surname ? `The ${surname} Family` : 'e.g. The Perera Family'} />
        </label>
        <div className="row2">
          <label className="field">
            <span>First name</span>
            <input ref={first} value={given} onChange={(e) => setGiven(e.target.value)} required />
          </label>
          <label className="field">
            <span>Surname</span>
            <input value={surname} onChange={(e) => setSurname(e.target.value)} />
          </label>
        </div>
        <div className="row2">
          <label className="field">
            <span>Sex</span>
            <select value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
              <option value="U">Prefer not to say</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </label>
          <label className="field">
            <span>Born</span>
            <input value={born} onChange={(e) => setBorn(e.target.value)} placeholder="e.g. 1990 or 12 Mar 1990" />
          </label>
        </div>
        {count > 0 && (
          <div className="note">
            This replaces the tree you have open now ({count} people) — only one tree is kept in this browser.
            <label className="check">
              <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} /> Download a backup of the current tree first
            </label>
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Start new tree
          </button>
        </div>
      </form>
    </div>
  );
}
