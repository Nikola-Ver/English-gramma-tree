import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Tense } from '../../data/tenses';
import { copyToClipboard } from '../../utils/clipboard';
import type { SelectionData } from '../../utils/deepLink';
import { buildTenseUrl, parseTenseHash } from '../../utils/deepLink';
import { applySelection, getSelectionData, restoreSelectionData } from '../../utils/selection';

interface Props {
  tenseKey: string;
  tense: Tense;
  breadcrumbs: { q: string; a: string }[];
  onRestart: () => void;
}

interface SelectionPop {
  selData: SelectionData;
  text: string;
  x: number;
  y: number;
}

const SVG_LINK = (
  <svg
    width="11"
    height="11"
    viewBox="0 0 11 11"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <path d="M4.5 6.5l2-2" />
    <path d="M3.5 5L2 6.5a2.2 2.2 0 003.1 3.1L6.5 8" />
    <path d="M7.5 6L9 4.5A2.2 2.2 0 005.9 1.4L4.5 3" />
  </svg>
);

export function TenseResult({ tenseKey, tense, breadcrumbs, onRestart }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selPop, setSelPop] = useState<SelectionPop | null>(null);
  const [selCopied, setSelCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [deepHighlighted, setDeepHighlighted] = useState(false);
  const highlightApplied = useRef(false);

  // Restore deep-link selection on mount
  useEffect(() => {
    if (highlightApplied.current || !containerRef.current) return;
    const parsed = parseTenseHash();
    if (!parsed || parsed.tenseKey !== tenseKey || !parsed.selectionData) return;

    const data = parsed.selectionData;
    const container = containerRef.current;

    const timer = setTimeout(() => {
      if (highlightApplied.current || !document.body.contains(container)) return;
      highlightApplied.current = true;

      const range = restoreSelectionData(container, data);
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
    }, 300);

    return () => clearTimeout(timer);
  }, [tenseKey]);

  // Selection popover
  useEffect(() => {
    function onSelectionChange() {
      const container = containerRef.current;
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
  }, [deepHighlighted]);

  async function handleSelShare() {
    if (!selPop || !containerRef.current) return;
    const range = restoreSelectionData(containerRef.current, selPop.selData);
    if (range) applySelection(range);
    const url = buildTenseUrl(tenseKey, selPop.selData);
    history.replaceState(null, '', `#tense-${tenseKey}~${url.split('~')[1]}`);
    await copyToClipboard(url);
    setSelCopied(true);
    setTimeout(() => setSelCopied(false), 2000);
  }

  async function handleShare(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const url = buildTenseUrl(tenseKey);
    history.replaceState(null, '', `#tense-${tenseKey}`);
    await copyToClipboard(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  const markers = tense.markers ? tense.markers.split(',') : [];

  return (
    <>
      {breadcrumbs.length > 0 && (
        <div className="tt-breadcrumb">
          {breadcrumbs.map((p, i) => (
            <span key={i} className="tt-crumb">
              {p.a}
            </span>
          ))}
        </div>
      )}

      <div ref={containerRef} className={`tt-result${deepHighlighted ? ' deep-highlighted' : ''}`}>
        <div className="tt-result-left">
          <div className="tt-result-name-row">
            <div className="tt-result-name" style={{ color: tense.color }}>
              {tense.name}
            </div>
            <button
              className={`tense-share-btn${shareCopied ? ' copied' : ''}`}
              onClick={handleShare}
              title="Copy link to this tense"
            >
              {shareCopied ? '✓' : SVG_LINK}
            </button>
          </div>
          <div className="tt-result-formula">{tense.formula}</div>
          <div className="tt-result-desc" style={{ marginTop: 8 }}>
            {tense.desc}
          </div>
          {markers.length > 0 && (
            <>
              <div
                style={{ fontSize: 11, fontWeight: 600, color: 'var(--b1)', margin: '10px 0 5px' }}
              >
                ⏱ Маркеры времени
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {markers.map((m, i) => (
                  <span
                    key={i}
                    style={{
                      background: 'var(--bg3)',
                      border: '1px solid rgba(56,189,248,0.2)',
                      borderRadius: 4,
                      padding: '2px 7px',
                      fontFamily: "'DM Mono',monospace",
                      fontSize: 11,
                      color: 'var(--b1)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.trim()}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="tt-result-right">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted2)', marginBottom: 5 }}>
            Примеры
          </div>
          <ul className="tt-result-ex">
            {tense.examples.map(([en, ru], i) => (
              <li key={i}>
                {en}
                {ru && <span className="tr">{ru}</span>}
              </li>
            ))}
          </ul>
          {tense.mistakes && tense.mistakes.length > 0 && (
            <div className="tt-mistakes" style={{ marginTop: 10 }}>
              <strong>🚫 Типичные ошибки:</strong>
              <ul style={{ margin: '4px 0 0 14px', padding: 0, listStyle: 'disc' }}>
                {tense.mistakes.map((m, i) => (
                  <li
                    key={i}
                    style={{ marginBottom: 3, lineHeight: 1.6 }}
                    dangerouslySetInnerHTML={{ __html: m }}
                  />
                ))}
              </ul>
            </div>
          )}
          <button className="tt-restart" onClick={onRestart}>
            ↺ Начать сначала
          </button>
        </div>
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
