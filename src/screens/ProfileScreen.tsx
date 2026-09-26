import { useState } from 'react';
import { api } from '../api/index.ts';
import { useApp } from '../hooks.ts';

export function ProfileScreen() {
  const { me, refresh, error, go, logout } = useApp();
  const [nick, setNick] = useState(me.nick ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.setProfile(nick);
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
          <h1>Как вас назвать в экспедиции?</h1>
          <p className="muted">
            Придумайте ник. Он будет стоять рядом с вашим флажком на горе и в сертификате. Настоящее имя лучше не писать:
            рейтинг увидят все участники.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label className="field">
              <span>Ваш ник</span>
              <input
                type="text"
                value={nick}
                maxLength={24}
                onChange={(e) => setNick(e.target.value)}
                placeholder="Например, Снежный барс"
              />
            </label>
            <button className="btn btn-block" disabled={busy || nick.trim().length < 2}>
              {busy ? 'Сохраняем…' : 'В путь!'}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
