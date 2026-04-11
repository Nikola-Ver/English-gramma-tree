import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './RuleExpansion.css';
import type { Rule } from '../../data/grammar';
import { copyToClipboard } from '../../utils/clipboard';
import type { SelectionData } from '../../utils/deepLink';
import { buildRuleUrl } from '../../utils/deepLink';
import { applySelection, getSelectionData, restoreSelectionData } from '../../utils/selection';

interface Props {
  rule: Rule;
  isOpen: boolean;
}

interface SelectionPop {
  selData: SelectionData;
  text: string;
  x: number;
  y: number;
}

export function RuleExpansion({ rule, isOpen }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [everOpened, setEverOpened] = useState(false);
  const [selPop, setSelPop] = useState<SelectionPop | null>(null);
  const [selCopied, setSelCopied] = useState(false);
  const [deepHighlighted, setDeepHighlighted] = useState(false);
  const highlightApplied = useRef(false);

  // Restore a path-based selection from the URL hash once the content renders
  useEffect(() => {
    if (!everOpened || highlightApplied.current || !ref.current) return;
    const hashMatch = location.hash.match(/^#rule-([^~\s]+?)(?:~(.+))?$/);
    if (!hashMatch || hashMatch[1] !== rule.id || !hashMatch[2]) return;

    highlightApplied.current = true;

    const parts = hashMatch[2].split(':');
    if (parts.length !== 4) return;
    const sp = parts[0] ? parts[0].split('-').map(Number) : [];
    const so = Number(parts[1]);
    const ep = parts[2] ? parts[2].split('-').map(Number) : [];
    const eo = Number(parts[3]);
    if ([...sp, so, ...ep, eo].some(isNaN)) return;

    const data: SelectionData = { startPath: sp, startOffset: so, endPath: ep, endOffset: eo };

    const timer = setTimeout(() => {
      if (!ref.current) return;
      const range = restoreSelectionData(ref.current, data);
      if (!range) return;

      setDeepHighlighted(true);
      applySelection(range);

      const rect = range.getBoundingClientRect();
      if (rect.width || rect.height) {
        window.scrollTo({
          top: rect.top + window.scrollY - window.innerHeight / 2,
          behavior: 'smooth',
        });
      }

      const stopGlow = () => setDeepHighlighted(false);
      const opts: AddEventListenerOptions = { once: true, passive: true };
      window.addEventListener('pointerdown', stopGlow, opts);
      window.addEventListener('touchstart', stopGlow, opts);
    }, 500);

    return () => clearTimeout(timer);
  }, [everOpened, rule.id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (isOpen) {
      setEverOpened(true);
      el.style.transition = 'none';
      el.style.maxHeight = '0';
      el.style.opacity = '0';
      el.style.padding = '0 13px';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition =
            'max-height 0.44s cubic-bezier(0.22,1,0.36,1), opacity 0.28s ease, padding 0.3s ease';
          el.style.maxHeight = `${el.scrollHeight + 30}px`;
          el.style.opacity = '1';
          el.style.padding = '11px 13px';

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
      el.style.maxHeight = `${el.scrollHeight + 30}px`;
      el.style.opacity = '1';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition =
            'max-height 0.32s cubic-bezier(0.4,0,0.6,1), opacity 0.2s ease, padding 0.25s ease';
          el.style.maxHeight = '0';
          el.style.opacity = '0';
          el.style.padding = '0 13px';
        });
      });
    }
  }, [isOpen, everOpened]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) {
      setSelPop(null);
      return;
    }

    function onSelectionChange() {
      const container = ref.current;
      if (!container) return;
      if (deepHighlighted) {
        setSelPop(null);
        return;
      }

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelPop(null);
        return;
      }

      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setSelPop(null);
        return;
      }

      const text = sel.toString().trim();
      const selData = getSelectionData(container);
      if (!text || !selData) {
        setSelPop(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      setSelPop({ selData, text, x: (rect.left + rect.right) / 2, y: rect.bottom });
    }

    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [isOpen, deepHighlighted]);

  async function handleSelShare() {
    if (!selPop || !ref.current) return;
    // Restore the exact selection so it stays visible during the confirmation
    const range = restoreSelectionData(ref.current, selPop.selData);
    if (range) applySelection(range);
    const url = buildRuleUrl(rule.id, selPop.selData);
    history.replaceState(null, '', `#rule-${rule.id}~${url.split('~')[1]}`);
    await copyToClipboard(url);
    setSelCopied(true);
    setTimeout(() => setSelCopied(false), 2000);
  }

  if (!rule.exp) return null;

  return (
    <>
      <div ref={ref} className={`rule-exp${deepHighlighted ? ' deep-highlighted' : ''}`}>
        {everOpened && (
          <>
            <div dangerouslySetInnerHTML={{ __html: rule.exp }} />
            {rule.ex && rule.ex.length > 0 && (
              <ul className="ex-list">
                {rule.ex.map(([en, ru], i) => (
                  <li key={i}>
                    {en}
                    {ru && <span className="tr">{ru}</span>}
                  </li>
                ))}
              </ul>
            )}
            {rule.exc && (
              <div className="exc-block">
                <strong>⚠️ Исключения:</strong>{' '}
                <span dangerouslySetInnerHTML={{ __html: rule.exc }} />
              </div>
            )}
            {rule.tip && (
              <div className="tip-block">
                <strong>💡 Совет:</strong> <span dangerouslySetInnerHTML={{ __html: rule.tip }} />
              </div>
            )}
            {rule.markers && rule.markers.tags.length > 0 && (
              <div className="markers-block">
                <strong>⏱ Маркеры времени</strong>
                <div className="markers-wrap">
                  {rule.markers.tags.map((t, i) => (
                    <span key={i} className="marker-tag">
                      {t}
                    </span>
                  ))}
                </div>
                {rule.markers.note && <div className="markers-note">{rule.markers.note}</div>}
              </div>
            )}
            {rule.mistakes && rule.mistakes.length > 0 && (
              <div className="mistakes-block">
                <strong>🚫 Типичные ошибки:</strong>
                <ul>
                  {rule.mistakes.map((m, i) => (
                    <li key={i} dangerouslySetInnerHTML={{ __html: m }} />
                  ))}
                </ul>
              </div>
            )}
            {rule.links && rule.links.length > 0 && (
              <div className="link-row">
                {rule.links.map((l, i) => {
                  const icon = l.type === 'yt' ? '▶' : l.type === 'ru' ? 'RU' : 'EN';
                  return (
                    <a
                      key={i}
                      className={`lnk ${l.type}`}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="lnk-dot" />
                      {icon} {l.label}
                    </a>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {selPop &&
        createPortal(
          <div
            className={`sel-share-pop${selCopied ? ' copied' : ''}`}
            style={{
              position: 'fixed',
              left: selPop.x,
              top: selPop.y + 8,
              transform: 'translateX(-50%)',
              zIndex: 9998,
            }}
          >
            <button
              className="sel-share-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSelShare}
            >
              {selCopied ? '✓ Ссылка скопирована' : '⛓ Поделиться выделенным текстом'}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
