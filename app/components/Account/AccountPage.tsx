import { useState } from 'react';
import type { SyncStatus } from '../../context/AuthSyncContext';
import { useAuthSync } from '../../context/AuthSyncContext';
import './AccountPage.css';

interface Props {
  onBack: () => void;
}

function SyncDot({ status }: { status: SyncStatus }) {
  const labels: Record<SyncStatus, string> = {
    idle: 'Не активно',
    syncing: 'Синхронизация…',
    synced: 'Синхронизировано',
    offline: 'Офлайн',
    error: 'Ошибка синхронизации',
  };
  return <span className={`account-sync-dot account-sync-dot--${status}`} title={labels[status]} />;
}

function formatDate(d: Date): string {
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getInitials(name: string | null, email: string | null): string {
  if (name?.trim()) return name.trim()[0].toUpperCase();
  if (email) return email[0].toUpperCase();
  return '?';
}

export function AccountPage({ onBack }: Props) {
  const { user, syncStatus, lastSyncAt, signOut, deleteAccount, syncNow } = useAuthSync();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  if (!user) return null;

  const displayName = user.displayName ?? null;
  const email = user.email ?? null;
  const photoURL = user.photoURL ?? null;
  const initials = getInitials(displayName, email);

  async function handleSyncNow() {
    setSyncing(true);
    try {
      await syncNow();
    } finally {
      setSyncing(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount();
      onBack();
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/requires-recent-login') {
        setDeleteError('Выйдите из аккаунта и войдите снова, затем повторите попытку.');
      } else {
        setDeleteError('Не удалось удалить аккаунт. Попробуйте ещё раз.');
      }
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const statusText: Record<SyncStatus, string> = {
    idle: 'Не активно',
    syncing: 'Синхронизация…',
    synced: 'Синхронизировано',
    offline: 'Офлайн — данные синхронизируются при подключении',
    error: 'Ошибка синхронизации — повтор в очереди',
  };

  return (
    <div className="account-page">
      <div className="account-card">
        {/* Avatar + identity */}
        <div className="account-identity">
          {photoURL ? (
            <img className="account-avatar" src={photoURL} alt={displayName ?? 'Аватар'} />
          ) : (
            <div className="account-avatar account-avatar--initials">{initials}</div>
          )}
          <div className="account-info">
            {displayName && <p className="account-name">{displayName}</p>}
            {email && <p className="account-email">{email}</p>}
          </div>
        </div>

        {/* Sync status */}
        <div className="account-sync-row">
          <div className="account-sync-label">
            <SyncDot status={syncStatus} />
            <span>{statusText[syncStatus]}</span>
          </div>
          {lastSyncAt && (
            <p className="account-last-sync">Последняя синхронизация: {formatDate(lastSyncAt)}</p>
          )}
        </div>

        {/* Actions */}
        <button
          type="button"
          className="account-btn account-btn--secondary"
          onClick={handleSyncNow}
          disabled={syncing || syncStatus === 'syncing'}
        >
          {syncing || syncStatus === 'syncing' ? 'Синхронизация…' : 'Синхронизировать'}
        </button>

        <button type="button" className="account-btn account-btn--secondary" onClick={signOut}>
          Выйти
        </button>

        <div className="account-divider" />

        {!confirmDelete ? (
          <button
            type="button"
            className="account-btn account-btn--danger"
            onClick={() => setConfirmDelete(true)}
          >
            Удалить аккаунт
          </button>
        ) : (
          <div className="account-delete-confirm">
            <p className="account-delete-warning">
              Аккаунт и все синхронизированные данные будут удалены безвозвратно. Локальный прогресс
              тоже будет очищен. Это действие нельзя отменить.
            </p>
            {deleteError && <p className="account-delete-error">{deleteError}</p>}
            <div className="account-delete-actions">
              <button
                type="button"
                className="account-btn account-btn--ghost"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Отмена
              </button>
              <button
                type="button"
                className="account-btn account-btn--danger"
                onClick={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting ? 'Удаление…' : 'Да, удалить всё'}
              </button>
            </div>
          </div>
        )}

        <button type="button" className="account-back-btn" onClick={onBack}>
          ← Назад
        </button>
      </div>
    </div>
  );
}
