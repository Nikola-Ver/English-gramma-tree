export interface SelectionData {
  startPath: number[];
  startOffset: number;
  endPath: number[];
  endOffset: number;
}

function encodeSelection(data: SelectionData): string {
  return [data.startPath.join('-'), data.startOffset, data.endPath.join('-'), data.endOffset].join(
    ':',
  );
}

function decodeSelection(encoded: string): SelectionData | null {
  const parts = encoded.split(':');
  if (parts.length !== 4) return null;
  const startPath = parts[0] ? parts[0].split('-').map(Number) : [];
  const startOffset = Number(parts[1]);
  const endPath = parts[2] ? parts[2].split('-').map(Number) : [];
  const endOffset = Number(parts[3]);
  if ([...startPath, startOffset, ...endPath, endOffset].some(isNaN)) return null;
  return { startPath, startOffset, endPath, endOffset };
}

/** Returns a shareable URL for a rule, optionally with a path-based selection. */
export function buildRuleUrl(ruleId: string, selectionData?: SelectionData): string {
  const base = `${location.origin}${location.pathname}`;
  const hash = `rule-${ruleId}`;
  if (selectionData) {
    return `${base}#${hash}~${encodeSelection(selectionData)}`;
  }
  return `${base}#${hash}`;
}

/** Reads the current URL hash and extracts rule ID and optional selection data. */
export function parseRuleHash(): { ruleId: string; selectionData: SelectionData | null } | null {
  const match = location.hash.match(/^#rule-([^~\s]+?)(?:~(.+))?$/);
  if (!match) return null;
  return {
    ruleId: match[1],
    selectionData: match[2] ? decodeSelection(match[2]) : null,
  };
}

/** Returns a shareable URL for a tense, optionally with a path-based selection. */
export function buildTenseUrl(tenseKey: string, selectionData?: SelectionData): string {
  const base = `${location.origin}${location.pathname}`;
  const hash = `tense-${tenseKey}`;
  if (selectionData) {
    return `${base}#${hash}~${encodeSelection(selectionData)}`;
  }
  return `${base}#${hash}`;
}

/** Reads the current URL hash and extracts tense key and optional selection data. */
export function parseTenseHash(): { tenseKey: string; selectionData: SelectionData | null } | null {
  const match = location.hash.match(/^#tense-([^~\s]+?)(?:~(.+))?$/);
  if (!match) return null;
  return {
    tenseKey: match[1],
    selectionData: match[2] ? decodeSelection(match[2]) : null,
  };
}
