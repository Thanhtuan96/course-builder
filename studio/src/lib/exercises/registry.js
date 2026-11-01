/**
 * Widget registry — the single seam between an exercise `type` and the component that renders it.
 *
 * Unknown types resolve to `null` and are skipped by the surface, so a future spec cannot break a
 * lesson that predates its widget.
 */
import { JournalEntryWidget } from '../../components/exercises/JournalEntryWidget.jsx';
import { gradeJournalEntry } from './journal-entry.js';

const WIDGETS = Object.freeze({
  'journal-entry': Object.freeze({ Component: JournalEntryWidget, grade: gradeJournalEntry }),
});

/** @param {string} type */
export function resolveWidget(type) {
  return WIDGETS[type] || null;
}

export const WIDGET_TYPES = Object.freeze(Object.keys(WIDGETS));
