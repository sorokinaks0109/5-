import { useState } from 'react';
import { api } from '../api/index.ts';
import { pc } from '../content.ts';
import { useApp } from '../hooks.ts';

export function ProfileScreen() {
  const { me, refresh, error, go, logout } = useApp();
  const [nick, setNick] = useState(me.nick ?? '');
  const [dep, setDep] = useState(me.department ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.setProfile(nick, dep);
      await refresh();
      go('/');
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="topbar">
        <div className="title">Снаряжение альпиниста</div>
        {me.nick ? (
          <button className="btn btn-ghost btn-small" onClick={() => go('/')}>
            Назад
          </button>
        ) : (
          <button className="btn btn-ghost btn-small" onClick={logout}>
            Выйти
          </button>
        )}
      </header>
      <main className="container">
        <div className="card">
          <h1>Кто идёт в экспедицию?</h1>
          <p className="muted">
            Придумайте ник — он появится на горе рядом с вашим флажком и в сертификате. Не пишите ФИО: рейтинг увидят
            все участники.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label className="field">
              <span>Игровое имя (ник)</span>
              <input type="text" value={nick} maxLength={24} onChange={(e) => setNick(e.target.value)} placeholder="Например, Снежный барс" />
            </label>
            <label className="field">
              <span>Подразделение</span>
              <select value={dep} onChange={(e) => setDep(e.target.value)}>
                <option value="">— выберите —</option>
                {pc.departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-block" disabled={busy || nick.trim().length < 2 || !dep}>
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
