import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Tense } from '../../data/tenses';
import { copyToClipboard } from '../../utils/clipboard';
import type { SelectionData } from '../../utils/deepLink';
import { buildTenseUrl, parseTenseHash } from '../../utils/deepLink';
import {
  applySelection,
  getSelectionData,
  lockSelection,
  restoreSelectionData,
} from '../../utils/selection';
import '../selectionLock.css';

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

interface LockedSel {
  selData: SelectionData;
  text: string;
  message: string;
}

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
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

  // Locked selection state
  const [lockedSel, setLockedSel] = useState<LockedSel | null>(null);
  const [lockCopied, setLockCopied] = useState(false);
  const [lockRects, setLockRects] = useState<HighlightRect[]>([]);
  const [lockAnchor, setLockAnchor] = useState<{ x: number; y: number } | null>(null);
  const lockedSelRef = useRef(lockedSel);
  lockedSelRef.current = lockedSel;

  // Deep-link message card state
  const [deepMsg, setDeepMsg] = useState<string | null>(null);
  const [deepMsgAnchor, setDeepMsgAnchor] = useState<{ x: number; y: number } | null>(null);
  const [deepMsgRects, setDeepMsgRects] = useState<HighlightRect[]>([]);
  // Stored so the scroll listener can recompute the anchor without stale closure
  const deepMsgSelDataRef = useRef<SelectionData | null>(null);
  const deepMsgRef = useRef(deepMsg);
  deepMsgRef.current = deepMsg;

  // True while the page is scrolling — panels are unmounted so they remount
  // with their appear animation once scrolling stops
  const [isScrolling, setIsScrolling] = useState(false);
  const isScrollingRef = useRef(false);

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

      const rect = range.getBoundingClientRect();
      if (rect.width || rect.height) {
        window.scrollTo({
          top: rect.top + window.scrollY - window.innerHeight / 2,
          behavior: 'smooth',
        });
      }

      // Show message card if the link sender attached one — keep highlight
      // via custom rects (same as locked selection) so it persists until closed
      if (data.message) {
        deepMsgSelDataRef.current = data;
        setDeepMsg(data.message);
        setDeepMsgAnchor({ x: (rect.left + rect.right) / 2, y: rect.bottom });
        setDeepMsgRects(
          Array.from(range.getClientRects()).map((r) => ({
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
          })),
        );
      } else {
        // No message — fall back to native browser selection + glow
        setDeepHighlighted(true);
        applySelection(range);
      }

      const stopGlow = () => {
        if (location.hash.includes('~')) {
          history.replaceState(null, '', '/');
        }
        setDeepHighlighted(false);
      };
      const opts: AddEventListenerOptions = { once: true, passive: true };
      window.addEventListener('pointerdown', stopGlow, opts);
      window.addEventListener('touchstart', stopGlow, opts);
    }, 300);

    return () => clearTimeout(timer);
  }, [tenseKey]);

  // Track selection changes to show the ephemeral share/lock popover
  useEffect(() => {
    function onSelectionChange() {
      // Don't interfere while a lock panel or deep-link message card is open
      if (lockedSelRef.current) return;
      if (deepMsgRef.current) return;

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

  // Unified effect: recalculate positions and manage isScrolling state.
  // Panels are hidden while scrolling (isScrolling=true) and remount with their
  // CSS appear animation once scrolling stops.
  useEffect(() => {
    const hasLock = lockedSel !== null;
    const hasMsg = deepMsg !== null;

    if (!hasLock) {
      setLockRects([]);
      setLockAnchor(null);
    }
    if (!hasMsg) {
      setDeepMsgRects([]);
    }
    if (!hasLock && !hasMsg) {
      isScrollingRef.current = false;
      setIsScrolling(false);
      return;
    }

    function updateAll() {
      const ls = lockedSelRef.current;
      if (ls && containerRef.current) {
        const range = restoreSelectionData(containerRef.current, ls.selData);
        if (range) {
          setLockRects(
            Array.from(range.getClientRects()).map((r) => ({
              top: r.top,
              left: r.left,
              width: r.width,
              height: r.height,
            })),
          );
          const b = range.getBoundingClientRect();
          setLockAnchor({ x: (b.left + b.right) / 2, y: b.bottom });
        }
      }
      const msgSel = deepMsgSelDataRef.current;
      if (msgSel && containerRef.current) {
        const range = restoreSelectionData(containerRef.current, msgSel);
        if (range) {
          setDeepMsgRects(
            Array.from(range.getClientRects()).map((r) => ({
              top: r.top,
              left: r.left,
              width: r.width,
              height: r.height,
            })),
          );
          const rect = range.getBoundingClientRect();
          setDeepMsgAnchor({ x: (rect.left + rect.right) / 2, y: rect.bottom });
        }
      }
    }

    let scrollTimer: ReturnType<typeof setTimeout>;

    function onScrollEnd() {
      updateAll();
      isScrollingRef.current = false;
      setIsScrolling(false);
    }

    function onScrollStart() {
      if (!isScrollingRef.current) {
        isScrollingRef.current = true;
        setIsScrolling(true);
      }
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(onScrollEnd, 150);
    }

    updateAll();
    window.addEventListener('scroll', onScrollStart, { passive: true });
    window.addEventListener(
      'scrollend',
      () => {
        clearTimeout(scrollTimer);
        onScrollEnd();
      },
      { passive: true },
    );
    window.addEventListener('resize', updateAll, { passive: true });
    return () => {
      clearTimeout(scrollTimer);
      isScrollingRef.current = false;
      window.removeEventListener('scroll', onScrollStart);
      window.removeEventListener('resize', updateAll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedSel !== null, deepMsg !== null]);

  // ── Handlers ──────────────────────────────────────────────────────────────

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

  function handleLock() {
    if (!containerRef.current) return;
    const handle = lockSelection(containerRef.current);
    if (!handle) return;

    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    if (range) {
      const rects = Array.from(range.getClientRects()).map((r) => ({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      }));
      const b = range.getBoundingClientRect();
      setLockRects(rects);
      setLockAnchor({ x: (b.left + b.right) / 2, y: b.bottom });
    }

    setLockedSel({ selData: handle.selData, text: handle.text, message: '' });
    setSelPop(null);
  }

  async function handleLockCopy() {
    if (!lockedSel || !containerRef.current) return;
    const selDataWithMsg: SelectionData = {
      ...lockedSel.selData,
      message: lockedSel.message.trim() || undefined,
    };
    const url = buildTenseUrl(tenseKey, selDataWithMsg);
    history.replaceState(null, '', `#tense-${tenseKey}~${url.split('~')[1]}`);
    await copyToClipboard(url);
    setLockCopied(true);
    setTimeout(() => setLockCopied(false), 2000);
  }

  async function handleShare(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const url = buildTenseUrl(tenseKey);
    history.replaceState(null, '', '/');
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

      {/* Ephemeral share / lock popover */}
      {selPop &&
        !isScrolling &&
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
            <div className="sel-share-pop-inner">
              <button
                className="sel-share-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleSelShare}
              >
                {selCopied ? '✓ Ссылка скопирована' : '⛓ Поделиться'}
              </button>
              <button
                className="sel-lock-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleLock}
              >
                📌 Закрепить
              </button>
            </div>
          </div>,
          document.body,
        )}

      {/* Locked selection: highlight overlay + message panel */}
      {lockedSel &&
        !isScrolling &&
        lockAnchor &&
        createPortal(
          <>
            <div className="sel-highlight-layer">
              {lockRects.map((r, i) => (
                <div
                  key={i}
                  className="sel-highlight-rect"
                  style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
                />
              ))}
            </div>

            <div className="sel-lock-panel" style={{ left: lockAnchor.x, top: lockAnchor.y + 10 }}>
              <div className="sel-lock-panel-header">
                <div className="sel-lock-panel-title">
                  📌
                  <span className="sel-lock-panel-preview">
                    "
                    {lockedSel.text.length > 32
                      ? `${lockedSel.text.slice(0, 32)}…`
                      : lockedSel.text}
                    "
                  </span>
                </div>
                <button
                  className="sel-lock-close"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setLockedSel(null);
                    if (location.hash.includes('~')) {
                      history.replaceState(null, '', '/');
                    }
                  }}
                  title="Закрыть"
                >
                  ×
                </button>
              </div>
              <div className="sel-lock-panel-body">
                <textarea
                  className="sel-lock-textarea"
                  placeholder="Добавьте комментарий…"
                  value={lockedSel.message}
                  onChange={(e) =>
                    setLockedSel((prev) => (prev ? { ...prev, message: e.target.value } : null))
                  }
                />
                <button
                  className={`sel-lock-copy-btn${lockCopied ? ' copied' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleLockCopy}
                >
                  {lockCopied ? '✓ Ссылка скопирована' : '⛓ Скопировать ссылку'}
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}

      {/* Deep-link message card shown to the recipient */}
      {deepMsg &&
        !isScrolling &&
        deepMsgAnchor &&
        createPortal(
          <>
            {/* Highlight rects — persist until the card is closed */}
            <div className="sel-highlight-layer">
              {deepMsgRects.map((r, i) => (
                <div
                  key={i}
                  className="sel-highlight-rect sel-highlight-rect--deep"
                  style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
                />
              ))}
            </div>

            <div
              className="sel-deep-msg-card"
              style={{ left: deepMsgAnchor.x, top: deepMsgAnchor.y + 10 }}
            >
              <div className="sel-deep-msg-header">
                <span className="sel-deep-msg-title">💬 Сообщение</span>
                <button
                  className="sel-deep-msg-close"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setDeepMsg(null);
                    setDeepMsgRects([]);
                    deepMsgSelDataRef.current = null;
                    if (location.hash.includes('~')) {
                      history.replaceState(null, '', '/');
                    }
                  }}
                  title="Закрыть"
                >
                  ×
                </button>
              </div>
              <div className="sel-deep-msg-body">{deepMsg}</div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
