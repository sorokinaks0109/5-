import { useState } from 'react';
import { api } from '../api/index.ts';
import { Emblem } from '../components/Emblem.tsx';
import { Snow } from '../components/Snow.tsx';
import { DEMO_CODES } from '../core/demoSeed.ts';
import { pc } from '../content.ts';
import { errorText } from '../hooks.ts';

export function LoginScreen({ onLogin }: { onLogin: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (c = code) => {
    if (!c.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await onLogin(c);
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  };

  return (
    <div className="splash">
      <Snow />
      <svg className="splash-mountains" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 120 L0 70 L60 30 L110 60 L180 5 L250 55 L320 20 L400 60 L400 120 Z" fill="#a78bfa" opacity="0.45" />
        <path d="M0 120 L0 95 L80 60 L140 85 L220 40 L300 80 L360 55 L400 75 L400 120 Z" fill="#f5f3ff" opacity="0.95" />
      </svg>
      <div className="splash-inner">
        <Emblem size={104} />
        <h1>{pc.settings.gameName}</h1>
        <p className="lead">
          {pc.settings.tagline}
          <br />
          <b>{pc.settings.tourName}</b>
        </p>
        <div className="card">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label className="field">
              <span>Ваш личный код</span>
              <input
                type="text"
                className="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="XXXX-XXXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
              />
            </label>
            {err && <div className="notice error">{err}</div>}
            <button className="btn btn-block" disabled={busy || !code.trim()}>
              {busy ? 'Входим…' : 'Начать восхождение'}
            </button>
          </form>
          <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
            Код выдаёт организатор. Мы не храним ФИО, телефон и почту — только код, ник и подразделение.
          </p>
        </div>

        {api.mode === 'demo' && (
          <div className="card">
            <div className="row">
              <span className="tag draft">ДЕМО-РЕЖИМ</span>
              <span className="small muted">данные хранятся только в этом браузере</span>
            </div>
            <p className="small" style={{ marginTop: 8 }}>Нажмите на код, чтобы войти:</p>
            <div className="row small">
              <b>Участник:</b>
              {DEMO_CODES.participants.map((c) => (
                <button key={c} className="btn btn-ghost btn-small mono" onClick={() => submit(c)} disabled={busy}>
                  {c}
                </button>
              ))}
            </div>
            <div className="row small" style={{ marginTop: 8 }}>
              <b>Жюри:</b>
              {DEMO_CODES.jury.map((c) => (
                <button key={c} className="btn btn-ghost btn-small mono" onClick={() => submit(c)} disabled={busy}>
                  {c}
                </button>
              ))}
            </div>
            <div className="row small" style={{ marginTop: 8 }}>
              <b>Организатор:</b>
              <button className="btn btn-ghost btn-small mono" onClick={() => submit(DEMO_CODES.organizer)} disabled={busy}>
                {DEMO_CODES.organizer}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
