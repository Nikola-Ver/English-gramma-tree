import type { SyncStatus } from '../../context/AuthSyncContext';
import { useAuthSync } from '../../context/AuthSyncContext';
import './Header.css';

interface Props {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onAvatarClick: () => void;
  onTitleClick: () => void;
}

function SyncStatusDot({ status }: { status: SyncStatus }) {
  if (status === 'idle') return null;
  return <span className={`avatar-sync-dot avatar-sync-dot--${status}`} aria-hidden="true" />;
}

function Avatar() {
  const { user, syncStatus } = useAuthSync();

  if (user?.photoURL) {
    return (
      <span className="avatar-img-wrap">
        <img
          className="avatar-img"
          src={user.photoURL}
          alt={user.displayName ?? 'Аватар'}
          referrerPolicy="no-referrer"
        />
        <SyncStatusDot status={syncStatus} />
      </span>
    );
  }

  if (user) {
    const name = user.displayName ?? user.email ?? '';
    const initial = name[0]?.toUpperCase() ?? '?';
    return (
      <span className="avatar-initials-wrap">
        <span className="avatar-initials">{initial}</span>
        <SyncStatusDot status={syncStatus} />
      </span>
    );
  }

  return (
    <span className="avatar-icon-wrap">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </span>
  );
}

export function Header({ theme, onToggleTheme, onAvatarClick, onTitleClick }: Props) {
  const { user } = useAuthSync();

  return (
    <header>
      <div className="header-top">
        <div className="title-block">
          <h1>
            <button type="button" className="title-btn" onClick={onTitleClick}>
              English <span>Grammar</span> Tree
            </button>
          </h1>
        </div>
        <div className="header-controls">
          <button
            className="theme-toggle"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          >
            {theme === 'dark' ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          <button
            className="avatar-btn"
            onClick={onAvatarClick}
            aria-label={user ? 'Аккаунт' : 'Войти'}
            title={user ? (user.displayName ?? user.email ?? 'Аккаунт') : 'Войти'}
          >
            <Avatar />
          </button>
        </div>
      </div>
    </header>
  );
}
