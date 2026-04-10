import { useCallback, useEffect, useRef, useState } from 'react';
import './LevelBlock.css';
import type { Category, Level, Rule } from '../../data/grammar';
import type { DoneMap } from '../../hooks/useProgress';
import { countLevel } from '../../hooks/useProgress';
import { RuleItem } from './RuleItem';

interface Props {
  level: Level;
  done: DoneMap;
  onToggleRule: (id: string) => void;
  searchQuery: string;
  forceOpen: boolean;
  promptBuilder?: (rule: Rule, level: Level, cat: Category) => string;
}

export function LevelBlock({
  level,
  done,
  onToggleRule,
  searchQuery,
  forceOpen,
  promptBuilder,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const closingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const k = level.id.toLowerCase();
  const { total, checked } = countLevel(level, done);
  const pct = total ? Math.round((checked / total) * 100) : 0;

  const open = isOpen || forceOpen;

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    if (open) {
      if (closingTimer.current) {
        clearTimeout(closingTimer.current);
        closingTimer.current = null;
      }
      setIsClosing(false);
      setEverOpened(true);

      el.style.transition = 'none';
      el.style.maxHeight = '0';
      el.style.opacity = '0';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = 'max-height 0.54s cubic-bezier(0.22,1,0.36,1), opacity 0.36s ease';
          el.style.maxHeight = `${el.scrollHeight}px`;
          el.style.opacity = '1';

          const onEnd = (e: TransitionEvent) => {
            if (e.propertyName === 'max-height') {
              el.style.maxHeight = 'none';
              el.removeEventListener('transitionend', onEnd);
            }
          };
          el.addEventListener('transitionend', onEnd);
        });
      });
    } else {
      if (!everOpened) return;

      setIsClosing(true);
      el.style.maxHeight = `${el.scrollHeight}px`;
      el.style.opacity = '1';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition =
            'max-height 0.44s cubic-bezier(0.4,0,0.6,1), opacity 0.3s ease 0.06s';
          el.style.maxHeight = '0';
          el.style.opacity = '0';

          closingTimer.current = setTimeout(() => {
            setIsClosing(false);
            closingTimer.current = null;
          }, 460);
        });
      });
    }
  }, [open, everOpened]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (closingTimer.current) clearTimeout(closingTimer.current);
    };
  }, []);

  const toggleOpen = useCallback(() => {
    setIsOpen((v) => !v);
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const levelMatches = q
    ? level.id.toLowerCase().includes(q) || level.name.toLowerCase().includes(q)
    : false;

  return (
    <div
      className={`level-block${open ? ' open' : ''}${isClosing ? ' closing' : ''}`}
      id={`level-${k}`}
    >
      <div className="level-header" onClick={toggleOpen}>
        <div
          className="level-dot"
          style={{ color: level.color, borderColor: level.color, background: level.colorBg }}
        >
          {level.id}
        </div>
        <div className="level-info">
          <div className="level-name">{level.name}</div>
          <div className="level-sub">{level.sub}</div>
        </div>
        <div className="level-stats">
          <div className="level-frac" style={{ color: level.color }}>
            {checked}/{total}
          </div>
          <div className="level-pct">{pct}%</div>
        </div>
        <div className="level-toggle">▾</div>
      </div>
      <div className="level-progress-bar">
        <div
          className="level-progress-fill"
          style={{ background: level.color, width: `${pct}%` }}
        />
      </div>
      <div ref={contentRef} className="level-content">
        {everOpened &&
          level.categories.map((cat, ci) => {
            const catMatches = q ? cat.name.toLowerCase().includes(q) : false;
            let ruleIdx = 0;
            const ruleItems = cat.rules.map((rule) => {
              const searchHidden =
                q && !levelMatches && !catMatches
                  ? !`${rule.text} ${rule.note || ''}`.toLowerCase().includes(q)
                  : false;
              const delay = 0.05 + ruleIdx * 0.028;
              ruleIdx++;
              return { rule, searchHidden, delay };
            });

            if (q && ruleItems.every((r) => r.searchHidden)) return null;

            return (
              <div
                key={cat.name}
                className="category"
                style={{ animationDelay: `${0.02 + ci * 0.06}s` }}
              >
                <div className="category-title">{cat.name}</div>
                <div className="rules-grid">
                  {ruleItems.map(({ rule, searchHidden, delay }) => (
                    <RuleItem
                      key={rule.id}
                      rule={rule}
                      level={level}
                      categoryName={cat.name}
                      isDone={!!done[rule.id]}
                      animDelay={delay}
                      onToggle={onToggleRule}
                      searchHidden={searchHidden}
                      promptBuilder={promptBuilder}
                    />
                  ))}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
