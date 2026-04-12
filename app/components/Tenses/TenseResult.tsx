import { useEffect, useRef, useState } from 'react';
import type { Tense } from '../../data/tenses';
import { useNotes } from '../../hooks/useNotes';
import { IconNote, IconPin, IconShare, IconTrash } from '../../icons';
import { copyToClipboard } from '../../utils/clipboard';
import type { SelectionData } from '../../utils/deepLink';
import { buildTenseUrl, parseTenseHash } from '../../utils/deepLink';
import {
  anchorFromRangeInContainer,
  type HighlightRect,
  hlPosClass,
  rectsFromRangeInContainer,
} from '../../utils/highlightRects';
import { deleteNote, type StoredNote, saveNote } from '../../utils/notesStorage';
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

interface NoteDraft {
  selData: SelectionData;
  text: string;
  message: string;
  rects: HighlightRect[];
  anchor: { x: number; y: number };
}

export function TenseResult({ tenseKey, tense, breadcrumbs, onRestart }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selPop, setSelPop] = useState<SelectionPop | null>(null);
  const selPopRef = useRef(selPop);
  selPopRef.current = selPop;
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
  const deepMsgSelDataRef = useRef<SelectionData | null>(null);
  const deepMsgRef = useRef(deepMsg);
  deepMsgRef.current = deepMsg;

  // Notes state — reacts to local actions and real-time Firestore sync
  const [notes, setNotes] = useNotes(tenseKey, 'tense');
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const [noteRects, setNoteRects] = useState<Map<string, HighlightRect[]>>(new Map());
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null);
  const noteDraftRef = useRef(noteDraft);
  noteDraftRef.current = noteDraft;
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const activeNoteIdRef = useRef(activeNoteId);
  activeNoteIdRef.current = activeNoteId;
  const [activeNoteAnchor, setActiveNoteAnchor] = useState<{ x: number; y: number } | null>(null);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);

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

      if (data.message) {
        deepMsgSelDataRef.current = data;
        setDeepMsg(data.message);
        setDeepMsgAnchor(anchorFromRangeInContainer(range, container));
        setDeepMsgRects(rectsFromRangeInContainer(range, container));
      } else {
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

  // Track selection changes to show the ephemeral share/lock/note popover
  useEffect(() => {
    function onSelectionChange() {
      if (lockedSelRef.current) return;
      if (deepMsgRef.current) return;
      if (noteDraftRef.current) return;

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
      const box = container.getBoundingClientRect();
      const rect = range.getBoundingClientRect();
      setSelPop({
        selData,
        text,
        x: (rect.left + rect.right) / 2 - box.left - container.clientLeft,
        y: rect.bottom - box.top - container.clientTop,
      });
    }

    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [deepHighlighted]);

  // Recalculate container-relative positions on resize or state changes.
  useEffect(() => {
    const hasLock = lockedSel !== null;
    const hasMsg = deepMsg !== null;
    const hasPop = selPop !== null;
    const hasNotes = notes.length > 0;
    const hasDraft = noteDraft !== null;

    if (!hasLock) {
      setLockRects([]);
      setLockAnchor(null);
    }
    if (!hasMsg) {
      setDeepMsgRects([]);
    }
    if (!hasNotes && !hasDraft) {
      setNoteRects(new Map());
    }

    if (!hasLock && !hasMsg && !hasPop && !hasNotes && !hasDraft) return;

    function updateAll() {
      const container = containerRef.current;

      const ls = lockedSelRef.current;
      if (ls && container) {
        const range = restoreSelectionData(container, ls.selData);
        if (range) {
          setLockRects(rectsFromRangeInContainer(range, container));
          setLockAnchor(anchorFromRangeInContainer(range, container));
        }
      }

      const msgSel = deepMsgSelDataRef.current;
      if (msgSel && container) {
        const range = restoreSelectionData(container, msgSel);
        if (range) {
          setDeepMsgRects(rectsFromRangeInContainer(range, container));
          setDeepMsgAnchor(anchorFromRangeInContainer(range, container));
        }
      }

      const sp = selPopRef.current;
      if (sp && container) {
        const range = restoreSelectionData(container, sp.selData);
        if (range) {
          const anchor = anchorFromRangeInContainer(range, container);
          setSelPop((prev) => (prev ? { ...prev, x: anchor.x, y: anchor.y } : null));
        }
      }

      const ns = notesRef.current;
      if (ns.length > 0 && container) {
        const newMap = new Map<string, HighlightRect[]>();
        for (const note of ns) {
          const range = restoreSelectionData(container, note.selData);
          if (range) {
            newMap.set(note.id, rectsFromRangeInContainer(range, container));
          }
        }
        setNoteRects(newMap);
      }

      const anId = activeNoteIdRef.current;
      if (anId && container) {
        const note = notesRef.current.find((n) => n.id === anId);
        if (note) {
          const range = restoreSelectionData(container, note.selData);
          if (range) {
            setActiveNoteAnchor(anchorFromRangeInContainer(range, container));
          }
        }
      }

      const nd = noteDraftRef.current;
      if (nd && container) {
        const range = restoreSelectionData(container, nd.selData);
        if (range) {
          const rects = rectsFromRangeInContainer(range, container);
          const anchor = anchorFromRangeInContainer(range, container);
          setNoteDraft((prev) => (prev ? { ...prev, rects, anchor } : null));
        }
      }
    }

    updateAll();
    window.addEventListener('resize', updateAll, { passive: true });
    return () => {
      window.removeEventListener('resize', updateAll);
    };
  }, [lockedSel, deepMsg, selPop, notes, noteDraft]);

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
      setLockRects(rectsFromRangeInContainer(range, containerRef.current));
      setLockAnchor(anchorFromRangeInContainer(range, containerRef.current));
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

  function handleNoteStart() {
    if (!selPop) return;
    const container = containerRef.current;
    if (!container) return;
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const rects = range ? rectsFromRangeInContainer(range, container) : [];
    const anchor = range
      ? anchorFromRangeInContainer(range, container)
      : { x: selPop.x, y: selPop.y };

    window.getSelection()?.removeAllRanges();
    setNoteDraft({ selData: selPop.selData, text: selPop.text, message: '', rects, anchor });
    setSelPop(null);
  }

  function handleNoteSave() {
    if (!noteDraft) return;
    const now = Date.now();
    const note: StoredNote = {
      id: crypto.randomUUID(),
      contextId: tenseKey,
      contextType: 'tense',
      selData: noteDraft.selData,
      text: noteDraft.text,
      message: noteDraft.message,
      createdAt: now,
      updatedAt: now,
    };
    saveNote(note);
    setNotes((prev) => [...prev, note]);
    setNoteDraft(null);
  }

  function handleNoteDelete(id: string) {
    deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeNoteId === id) {
      setActiveNoteId(null);
      setActiveNoteAnchor(null);
    }
  }

  function handleNoteHighlightClick(noteId: string) {
    if (activeNoteId === noteId) {
      setActiveNoteId(null);
      setActiveNoteAnchor(null);
      return;
    }
    setActiveNoteId(noteId);
    const note = notes.find((n) => n.id === noteId);
    const container = containerRef.current;
    if (note && container) {
      const range = restoreSelectionData(container, note.selData);
      if (range) {
        setActiveNoteAnchor(anchorFromRangeInContainer(range, container));
      }
    }
  }

  const markers = tense.markers ? tense.markers.split(',') : [];
  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null;

  return (
    <>
      {breadcrumbs.length > 0 && (
        <div className="tt-breadcrumb">
          {breadcrumbs.map((p) => (
            <span key={p.a} className="tt-crumb">
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
              title="Поделиться ссылкой"
            >
              {shareCopied ? '✓' : <IconShare />}
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
                {markers.map((m) => (
                  <span
                    key={m}
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
            {tense.examples.map(([en, ru]) => (
              <li key={en}>
                {en}
                {ru && <span className="tr">{ru}</span>}
              </li>
            ))}
          </ul>
          {tense.mistakes && tense.mistakes.length > 0 && (
            <div className="tt-mistakes" style={{ marginTop: 10 }}>
              <strong>🚫 Типичные ошибки:</strong>
              <ul style={{ margin: '4px 0 0 14px', padding: 0, listStyle: 'disc' }}>
                {tense.mistakes.map((m) => (
                  <li
                    key={m}
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

        {/* Inline highlight layers — scroll with the container */}

        {lockedSel && (
          <div className="sel-highlight-layer--inline">
            {lockRects.map((r, i) => (
              <div
                key={`${r.top}-${r.left}-${r.width}-${r.height}`}
                className={`sel-highlight-rect ${hlPosClass(i, lockRects.length)}`}
                style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
              />
            ))}
          </div>
        )}

        {notes.length > 0 && (
          <div className="sel-highlight-layer--inline">
            {notes.map((note) => {
              const rects = noteRects.get(note.id) ?? [];
              const isHovered = hoveredNoteId === note.id;
              const isActive = activeNoteId === note.id;
              return rects.map((r, i) => (
                <div
                  key={`${note.id}-${r.top}-${r.left}-${r.width}-${r.height}`}
                  className={`sel-highlight-rect--note ${hlPosClass(i, rects.length)}${isActive ? ' hl-active' : isHovered ? ' hl-hovered' : ''}`}
                  style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
                  onMouseEnter={() => setHoveredNoteId(note.id)}
                  onMouseLeave={() => setHoveredNoteId(null)}
                  onClick={() => handleNoteHighlightClick(note.id)}
                />
              ));
            })}
          </div>
        )}

        {noteDraft && (
          <div className="sel-highlight-layer--inline">
            {noteDraft.rects.map((r, i) => (
              <div
                key={`${r.top}-${r.left}-${r.width}-${r.height}`}
                className={`sel-highlight-rect--note ${hlPosClass(i, noteDraft.rects.length)}`}
                style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
              />
            ))}
          </div>
        )}

        {deepMsg && (
          <div className="sel-highlight-layer--inline">
            {deepMsgRects.map((r, i) => (
              <div
                key={`${r.top}-${r.left}-${r.width}-${r.height}`}
                className={`sel-highlight-rect sel-highlight-rect--deep ${hlPosClass(i, deepMsgRects.length)}`}
                style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
              />
            ))}
          </div>
        )}

        {/* Inline panels — scroll with the container */}

        {selPop && (
          <div
            className="sel-share-pop"
            style={{
              position: 'absolute',
              left: selPop.x,
              top: selPop.y + 8,
              transform: 'translateX(-50%)',
              zIndex: 9998,
            }}
          >
            <div className="sel-share-pop-inner">
              <button
                className={`sel-pop-btn sel-pop-btn--share${selCopied ? ' copied' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleSelShare}
                title="Поделиться"
              >
                <IconShare />
              </button>
              <button
                className="sel-pop-btn sel-pop-btn--pin"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleLock}
                title="Закрепить"
              >
                <IconPin />
              </button>
              <button
                className="sel-pop-btn sel-pop-btn--note"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleNoteStart}
                title="Пометка"
              >
                <IconNote />
              </button>
            </div>
          </div>
        )}

        {lockedSel && lockAnchor && (
          <div className="sel-lock-panel" style={{ left: lockAnchor.x, top: lockAnchor.y + 10 }}>
            <div className="sel-lock-panel-header">
              <div className="sel-lock-panel-title">
                <IconPin size={11} />
                <span className="sel-lock-panel-preview">
                  "{lockedSel.text.length > 32 ? `${lockedSel.text.slice(0, 32)}…` : lockedSel.text}
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
        )}

        {noteDraft && (
          <div
            className="sel-note-panel"
            style={{ left: noteDraft.anchor.x, top: noteDraft.anchor.y + 10 }}
          >
            <div className="sel-note-panel-header">
              <div className="sel-note-panel-title">
                <IconNote size={11} />
                <span className="sel-note-panel-preview">
                  "{noteDraft.text.length > 28 ? `${noteDraft.text.slice(0, 28)}…` : noteDraft.text}
                  "
                </span>
              </div>
              <button
                className="sel-note-close"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setNoteDraft(null)}
                title="Отмена"
              >
                ×
              </button>
            </div>
            <div className="sel-note-panel-body">
              <textarea
                className="sel-note-textarea"
                placeholder="Ваша пометка…"
                value={noteDraft.message}
                onChange={(e) =>
                  setNoteDraft((prev) => (prev ? { ...prev, message: e.target.value } : null))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleNoteSave();
                }}
              />
              <button
                className="sel-note-save-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleNoteSave}
              >
                Сохранить
              </button>
            </div>
          </div>
        )}

        {activeNote && activeNoteAnchor && (
          <div
            className="sel-note-card"
            style={{ left: activeNoteAnchor.x, top: activeNoteAnchor.y + 10 }}
          >
            <div className="sel-note-card-header">
              <div className="sel-note-card-title">
                <IconNote size={11} />
                <span className="sel-note-card-excerpt">
                  "
                  {activeNote.text.length > 26
                    ? `${activeNote.text.slice(0, 26)}…`
                    : activeNote.text}
                  "
                </span>
              </div>
              <div className="sel-note-card-actions">
                <button
                  className="sel-note-card-delete"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleNoteDelete(activeNote.id)}
                  title="Удалить пометку"
                >
                  <IconTrash />
                </button>
                <button
                  className="sel-note-card-close"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setActiveNoteId(null);
                    setActiveNoteAnchor(null);
                  }}
                  title="Закрыть"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="sel-note-card-body">
              {activeNote.message ? (
                activeNote.message
              ) : (
                <span className="sel-note-card-empty">Пометка без текста</span>
              )}
            </div>
          </div>
        )}

        {deepMsg && deepMsgAnchor && (
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
        )}
      </div>
    </>
  );
}
