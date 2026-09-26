import { TextRun } from '../types/editor';

/**
 * Bridge between the Toolbar (outside the text box) and whichever text box
 * currently holds a live caret/selection.
 *
 * The Toolbar cannot read the DOM selection itself because the editable lives
 * in a separate React subtree, so the focused RichTextEditor registers itself
 * here. `formatActiveTextSelection` returns false when there is no active
 * non-collapsed selection, which is the signal for the Toolbar to fall back to
 * element-level formatting.
 */

export interface ActiveTextSelection {
  elementId: string;
  start: number;
  end: number;
  isCollapsed: boolean;
  /** Uniform style across the range; null when the range is mixed. */
  style: TextRun | null;
}

export type SelectionFormatter = (patch: Partial<Omit<TextRun, 'text'>>) => boolean;
export type SelectionListener = (selection: ActiveTextSelection | null) => void;

let current: ActiveTextSelection | null = null;
let formatter: SelectionFormatter | null = null;
const listeners = new Set<SelectionListener>();

function emit() {
  for (const listener of listeners) listener(current);
}

export function setActiveTextSelection(
  selection: ActiveTextSelection,
  format: SelectionFormatter
) {
  const changed =
    !current ||
    current.elementId !== selection.elementId ||
    current.start !== selection.start ||
    current.end !== selection.end ||
    current.isCollapsed !== selection.isCollapsed;

  current = selection;
  formatter = format;
  if (changed) emit();
}

export function clearActiveTextSelection(elementId?: string) {
  if (elementId && current && current.elementId !== elementId) return;
  if (!current) return;
  current = null;
  formatter = null;
  emit();
}

export function getActiveTextSelection(): ActiveTextSelection | null {
  return current;
}

export function hasActiveTextSelection(): boolean {
  return !!current && !current.isCollapsed;
}

/** Format the current selection. Returns false when there is nothing selected. */
export function formatActiveTextSelection(
  patch: Partial<Omit<TextRun, 'text'>>
): boolean {
  if (!formatter || !current || current.isCollapsed) return false;
  return formatter(patch);
}

export function subscribeTextSelection(listener: SelectionListener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
