import { useEffect, useRef, useState } from 'react';
import { DATA } from '../../data/grammar';
import type { DoneMap } from '../../hooks/useProgress';
import { countAll } from '../../hooks/useProgress';
import { copyToClipboard } from '../../utils/clipboard';
import { buildGlobalTestPrompt } from '../../utils/prompts';
import { LevelBlock } from './LevelBlock';

interface Props {
  done: DoneMap;
  onToggleRule: (id: string) => void;
  onReset: () => void;
  targetRuleId?: string | null;
}

export function GrammarTab({ done, onToggleRule, onReset, targetRuleId }: Props) {
  const { total, checked } = countAll(done);
  const pct = total ? Math.round((checked / total) * 100) : 0;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [confirmReset, setConfirmReset] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = searchQuery.trim().toLowerCase();

  const forceOpenSet = new Set<string>();
  if (q) {
    DATA.forEach((lvl) => {
      if (lvl.id.toLowerCase().includes(q) || lvl.name.toLowerCase().includes(q)) {
        forceOpenSet.add(lvl.id);
        return;
      }
      lvl.categories.forEach((cat) => {
        if (cat.name.toLowerCase().includes(q)) {
          forceOpenSet.add(lvl.id);
          return;
        }
        cat.rules.forEach((rule) => {
          if (`${rule.text} ${rule.note || ''}`.toLowerCase().includes(q)) {
            forceOpenSet.add(lvl.id);
          }
        });
      });
    });
  }
  if (targetRuleId) {
    DATA.forEach((lvl) => {
      if (lvl.categories.some((cat) => cat.rules.some((r) => r.id === targetRuleId))) {
        forceOpenSet.add(lvl.id);
      }
    });
  }

  const hasResults = !q || forceOpenSet.size > 0;

  function toggleSearch() {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchQuery('');
    } else {
      setSearchOpen(true);
    }
  }

  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setSearchQuery('');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  // Clear reset confirm timer on unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  function handleReset() {
    if (!confirmReset) {
      setConfirmReset(true);
      resetTimerRef.current = setTimeout(() => {
        setConfirmReset(false);
        resetTimerRef.current = null;
      }, 3000);
    } else {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      setConfirmReset(false);
      onReset();
    }
  }

  async function handleGlobalTest(e: React.MouseEvent<HTMLButtonElement>) {
    const btn = e.currentTarget;
    const doneRules: {
      rule: import('../../data/grammar').Rule;
      level: import('../../data/grammar').Level;
      category: import('../../data/grammar').Category;
    }[] = [];
    DATA.forEach((lvl) => {
      lvl.categories.forEach((cat) => {
        cat.rules.forEach((rule) => {
          if (done[rule.id]) doneRules.push({ rule, level: lvl, category: cat });
        });
      });
    });
    if (doneRules.length === 0) {
      alert('Сначала отметь хотя бы одно правило как изученное!');
      return;
    }
    const orig = btn.innerHTML;
    const prompt = buildGlobalTestPrompt(doneRules);
    await copyToClipboard(prompt);
    btn.textContent = '✓ Скопировано!';
    setTimeout(() => {
      if (btn) btn.innerHTML = orig;
    }, 2000);
  }

  return (
    <div id="pane-grammar" className="tab-pane active">
      <div className="grammar-header">
        <div className="grammar-progress-block">
          <div className="grammar-progress-nums">
            <span className="grammar-checked">{checked}</span>
            <span className="grammar-total"> / {total} правил</span>
          </div>
          <div className="grammar-bar-bg">
            <div className="grammar-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="grammar-pct">{pct}% завершено</div>
        </div>
        <div className="grammar-header-right">
          <button
            className={`tab-reset-btn${confirmReset ? ' confirming' : ''}`}
            onClick={handleReset}
            aria-label={confirmReset ? 'Нажмите ещё раз для подтверждения' : 'Сбросить прогресс'}
            title={confirmReset ? 'Нажмите ещё раз для подтверждения' : 'Сбросить прогресс'}
          >
            {confirmReset ? (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            ) : (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 .49-4.96" />
              </svg>
            )}
          </button>
          <button
            className={`grammar-search-btn${searchOpen ? ' active' : ''}`}
            onClick={toggleSearch}
            aria-label={searchOpen ? 'Закрыть поиск' : 'Поиск'}
            title={searchOpen ? 'Закрыть поиск' : 'Поиск'}
          >
            {searchOpen ? (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            )}
          </button>
          <button className="global-test-btn" onClick={handleGlobalTest}>
            <span className="btn-icon">🧠</span> Тест по изученному
          </button>
        </div>
      </div>

      <div
        className={`reset-confirm-banner${confirmReset ? ' open' : ''}`}
        role="alert"
        aria-live="polite"
      >
        <div className="reset-confirm-inner">
          <span className="reset-confirm-text">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ flexShrink: 0 }}
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Нажмите кнопку сброса ещё раз, чтобы подтвердить
          </span>
          <button
            className="reset-confirm-cancel"
            onClick={() => {
              setConfirmReset(false);
              if (resetTimerRef.current) {
                clearTimeout(resetTimerRef.current);
                resetTimerRef.current = null;
              }
            }}
            tabIndex={confirmReset ? 0 : -1}
          >
            Отмена
          </button>
        </div>
      </div>

      <div className={`grammar-search-row${searchOpen ? ' open' : ''}`}>
        <div className="grammar-search-inner">
          <span className="grammar-search-icon" aria-hidden="true">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            ref={searchInputRef}
            className="grammar-search-input"
            type="search"
            placeholder="Поиск по теме, правилу..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            tabIndex={searchOpen ? 0 : -1}
            aria-hidden={searchOpen ? undefined : true}
          />
          {searchQuery && (
            <button
              className="grammar-search-clear"
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              aria-label="Очистить поиск"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="level-path">
        {DATA.map((level) => (
          <LevelBlock
            key={level.id}
            level={level}
            done={done}
            onToggleRule={onToggleRule}
            searchQuery={searchQuery}
            forceOpen={forceOpenSet.has(level.id)}
            targetRuleId={targetRuleId}
          />
        ))}
      </div>
      {!hasResults && <div className="no-results">Ничего не найдено по запросу</div>}
    </div>
  );
}
