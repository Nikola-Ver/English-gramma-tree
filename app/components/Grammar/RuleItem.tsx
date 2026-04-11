import { useCallback, useEffect, useRef } from 'react';
import './RuleItem.css';
import { useState } from 'react';
import type { Category, Level, Rule } from '../../data/grammar';
import { IconCheck, IconShare } from '../../icons';
import { copyToClipboard } from '../../utils/clipboard';
import { buildRuleUrl } from '../../utils/deepLink';
import { spawnParticles } from '../../utils/particles';
import { buildRulePrompt } from '../../utils/prompts';
import { RuleExpansion } from './RuleExpansion';

interface Props {
  rule: Rule;
  level: Level;
  categoryName: string;
  isDone: boolean;
  animDelay: number;
  onToggle: (id: string) => void;
  searchHidden: boolean;
  isTarget?: boolean;
  promptBuilder?: (rule: Rule, level: Level, cat: Category) => string;
}

export function RuleItem({
  rule,
  level,
  isDone,
  animDelay,
  onToggle,
  searchHidden,
  isTarget = false,
  promptBuilder,
}: Props) {
  const [expOpen, setExpOpen] = useState(isTarget);
  const [shareCopied, setShareCopied] = useState(false);
  const checkRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only scroll-to-target
  useEffect(() => {
    if (!isTarget) return;
    const el = document.getElementById(`ri-${rule.id}`);
    if (!el) return;
    const timer = setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('rule-target-highlight');
      setTimeout(() => el.classList.remove('rule-target-highlight'), 2400);
    }, 650);
    return () => clearTimeout(timer);
  }, []);

  const handleCheck = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const el = checkRef.current;
      if (el && !isDone) {
        el.classList.add('anim-check');
        spawnParticles(el, level.color);
        setTimeout(() => el.classList.remove('anim-check'), 600);
      }
      setExpOpen(false);
      onToggle(rule.id);
    },
    [isDone, level.color, onToggle, rule.id],
  );

  const handleExpToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (rule.exp) setExpOpen((v) => !v);
    },
    [rule.exp],
  );

  async function handleTest(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const orig = btn.textContent;
    const cat = level.categories.find((c) => c.rules.some((r) => r.id === rule.id));
    if (!cat) return;
    const build = promptBuilder ?? buildRulePrompt;
    const prompt = build(rule, level, cat);
    await copyToClipboard(prompt);
    btn.textContent = '✓ Скопировано!';
    btn.classList.add('copied');
    setTimeout(() => {
      if (btn) {
        btn.textContent = orig;
        btn.classList.remove('copied');
      }
    }, 2000);
  }

  async function handleShare(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const url = buildRuleUrl(rule.id);
    history.replaceState(null, '', `#rule-${rule.id}`);
    await copyToClipboard(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  const checkStyle = isDone
    ? { background: level.color, borderColor: level.color, color: '#000' }
    : { borderColor: 'var(--border2)' };

  const titleNode = rule.unitUrl ? (
    <a
      className="rule-text rule-unit-link"
      href={rule.unitUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      {rule.text}
    </a>
  ) : (
    <div className="rule-text">{rule.text}</div>
  );

  return (
    <div
      className={`rule-item${isDone ? ' done' : ''}${searchHidden ? ' hidden-search' : ''}`}
      id={`ri-${rule.id}`}
      style={{ '--anim-delay': `${animDelay}s` } as React.CSSProperties}
    >
      <div className="rule-top" onClick={handleExpToggle}>
        <div ref={checkRef} className="rule-check" onClick={handleCheck} style={checkStyle}>
          {isDone && <IconCheck className="chk-svg" />}
        </div>
        <div className="rule-main">
          {titleNode}
          {rule.note && <span className="rule-note">{rule.note}</span>}
        </div>
        <div className="rule-actions">
          <button
            className={`share-btn${shareCopied ? ' copied' : ''}`}
            onClick={handleShare}
            title="Copy link to this rule"
          >
            {shareCopied ? '✓' : <IconShare />}
          </button>
          {rule.exp && (
            <button className="test-btn" onClick={handleTest}>
              ✦ Тест
            </button>
          )}
          {rule.exp && <span className={`rule-arrow${expOpen ? ' open' : ''}`}>▾</span>}
        </div>
      </div>
      {rule.exp && <RuleExpansion rule={rule} isOpen={expOpen} />}
    </div>
  );
}
