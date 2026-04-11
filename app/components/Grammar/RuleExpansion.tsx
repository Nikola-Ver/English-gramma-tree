import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './RuleExpansion.css';
import '../selectionLock.css';
import type { Rule } from '../../data/grammar';
import { copyToClipboard } from '../../utils/clipboard';
import type { SelectionData } from '../../utils/deepLink';
import { buildRuleUrl } from '../../utils/deepLink';
import {
  applySelection,
  getSelectionData,
  lockSelection,
  restoreSelectionData,
} from '../../utils/selection';

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

export function RuleExpansion({ rule, isOpen }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [everOpened, setEverOpened] = useState(false);
  const [selPop, setSelPop] = useState<SelectionPop | null>(null);
  const [selCopied, setSelCopied] = useState(false);
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
  // Stored so the scroll listener can recompute the anchor without stale closure
  const deepMsgSelDataRef = useRef<SelectionData | null>(null);

  // Restore a path-based selection from the URL hash once the content renders
  useEffect(() => {
    if (!everOpened || highlightApplied.current || !ref.current) return;
    const hashMatch = location.hash.match(/^#rule-([^~\s]+?)(?:~(.+))?$/);
    if (!hashMatch || hashMatch[1] !== rule.id || !hashMatch[2]) return;

    highlightApplied.current = true;

    const parts = hashMatch[2].split(':');
    if (parts.length < 4) return;
    const sp = parts[0] ? parts[0].split('-').map(Number) : [];
    const so = Number(parts[1]);
    const ep = parts[2] ? parts[2].split('-').map(Number) : [];
    const eo = Number(parts[3]);
    if ([...sp, so, ...ep, eo].some(isNaN)) return;

    let msg: string | undefined;
    if (parts.length > 4) {
      try {
        msg = decodeURIComponent(escape(atob(parts.slice(4).join(':'))));
      } catch {
        // ignore malformed message
      }
    }

    const data: SelectionData = {
      startPath: sp,
      startOffset: so,
      endPath: ep,
      endOffset: eo,
      message: msg,
    };

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

      // Show message card if the link sender attached one
      if (data.message) {
        deepMsgSelDataRef.current = data;
        setDeepMsg(data.message);
        setDeepMsgAnchor({ x: (rect.left + rect.right) / 2, y: rect.bottom });
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

  // Track selection changes to show the ephemeral share/lock popover
  useEffect(() => {
    if (!isOpen) {
      setSelPop(null);
      return;
    }

    function onSelectionChange() {
      // Don't interfere while a lock panel is open
      if (lockedSelRef.current) return;

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

  // Keep highlight rects + panel anchor synced after scroll/resize settles
  useEffect(() => {
    if (!lockedSel) {
      setLockRects([]);
      setLockAnchor(null);
      return;
    }

    const { selData } = lockedSel;

    function updateRects() {
      if (!ref.current) return;
      const range = restoreSelectionData(ref.current, selData);
      if (!range) return;
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

    function onScroll() {
      updateRects();
    }

    updateRects();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scrollend', updateRects, { passive: true });
    window.addEventListener('resize', updateRects, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', updateRects);
      window.removeEventListener('resize', updateRects);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedSel !== null]);

  // Reposition the deep-link message card after scroll settles
  useEffect(() => {
    if (!deepMsg) return;

    function updateDeepMsgAnchor() {
      const selData = deepMsgSelDataRef.current;
      if (!selData || !ref.current) return;
      const range = restoreSelectionData(ref.current, selData);
      if (!range) return;
      const rect = range.getBoundingClientRect();
      setDeepMsgAnchor({ x: (rect.left + rect.right) / 2, y: rect.bottom });
    }

    function onScroll() {
      updateDeepMsgAnchor();
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scrollend', updateDeepMsgAnchor, { passive: true });
    window.addEventListener('resize', updateDeepMsgAnchor, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', updateDeepMsgAnchor);
      window.removeEventListener('resize', updateDeepMsgAnchor);
    };
  }, [deepMsg]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSelShare() {
    if (!selPop || !ref.current) return;
    const range = restoreSelectionData(ref.current, selPop.selData);
    if (range) applySelection(range);
    const url = buildRuleUrl(rule.id, selPop.selData);
    history.replaceState(null, '', `#rule-${rule.id}~${url.split('~')[1]}`);
    await copyToClipboard(url);
    setSelCopied(true);
    setTimeout(() => setSelCopied(false), 2000);
  }

  function handleLock() {
    if (!ref.current) return;
    const handle = lockSelection(ref.current);
    if (!handle) return;

    // Capture viewport-relative rects before clearing the selection
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
    if (!lockedSel || !ref.current) return;
    const selDataWithMsg: SelectionData = {
      ...lockedSel.selData,
      message: lockedSel.message.trim() || undefined,
    };
    const url = buildRuleUrl(rule.id, selDataWithMsg);
    history.replaceState(null, '', `#rule-${rule.id}~${url.split('~')[1]}`);
    await copyToClipboard(url);
    setLockCopied(true);
    setTimeout(() => setLockCopied(false), 2000);
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

      {/* Ephemeral share / lock popover */}
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
        lockAnchor &&
        createPortal(
          <>
            {/* Highlight rects rendered in fixed space so they scroll with the page */}
            <div className="sel-highlight-layer">
              {lockRects.map((r, i) => (
                <div
                  key={i}
                  className="sel-highlight-rect"
                  style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
                />
              ))}
            </div>

            {/* Message panel */}
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
                  onClick={() => setLockedSel(null)}
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
        deepMsgAnchor &&
        createPortal(
          <div
            className="sel-deep-msg-card"
            style={{ left: deepMsgAnchor.x, top: deepMsgAnchor.y + 10 }}
          >
            <div className="sel-deep-msg-header">
              <span className="sel-deep-msg-title">💬 Сообщение</span>
              <button
                className="sel-deep-msg-close"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setDeepMsg(null)}
                title="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="sel-deep-msg-body">{deepMsg}</div>
          </div>,
          document.body,
        )}
    </>
  );
}
