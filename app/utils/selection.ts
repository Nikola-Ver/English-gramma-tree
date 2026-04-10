import type { SelectionData } from './deepLink';

export function getSelectionData(rootElement: HTMLElement): SelectionData | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);

  const getPath = (node: Node): number[] => {
    const path: number[] = [];
    while (node !== rootElement) {
      const parent = node.parentNode;
      if (!parent) return path;
      path.push(Array.from(parent.childNodes).indexOf(node as ChildNode));
      node = parent;
    }
    return path;
  };

  return {
    startPath: getPath(range.startContainer),
    startOffset: range.startOffset,
    endPath: getPath(range.endContainer),
    endOffset: range.endOffset,
  };
}

export function restoreSelectionData(rootElement: HTMLElement, data: SelectionData): Range | null {
  const nodeFromPath = (path: number[]): Node | null => {
    let node: Node = rootElement;
    for (let i = path.length - 1; i >= 0; i--) {
      const child = node.childNodes[path[i]];
      if (!child) return null;
      node = child;
    }
    return node;
  };

  const startNode = nodeFromPath(data.startPath);
  const endNode = nodeFromPath(data.endPath);
  if (!startNode || !endNode) return null;

  try {
    const range = document.createRange();
    range.setStart(startNode, data.startOffset);
    range.setEnd(endNode, data.endOffset);
    return range;
  } catch {
    return null;
  }
}

export function applySelection(range: Range) {
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}
