export type Mode = 'read' | 'progressive' | 'firstletter' | 'fill' | 'order' | 'recall' | 'refquiz';
export type Status = 'learning' | 'memorized' | 'needs-review' | 'mastered';

export interface HistoryEntry {
  date: string; // YYYY-MM-DD (local)
  acc: number; // 0..1 word accuracy of a full recall
  pass: boolean;
  interval: number; // review interval (days) that this attempt satisfied; 0 = first pass / relearn
}

export interface Verse {
  ref: string; // canonical, e.g. "Proverbs 3:5-6"
  text: string;
  custom: boolean; // text was supplied/edited by the user
  addedAt: string;
  startedOn: string | null;
  step: number; // index into INTERVALS of the scheduled interval, -1 = never passed
  due: string | null;
  relearn: boolean; // failed a review; must pass again (first-letter first)
  history: HistoryEntry[];
  awarded: Partial<Record<Mode, string>>; // last day points were given per mode
  memorizedAt: string | null;
  masteredAt: string | null;
}

export interface Settings {
  lenient: boolean;
  theme: 'auto' | 'light' | 'dark';
}

export interface AppData {
  version: 1;
  verses: Verse[];
  settings: Settings;
  points: number;
  activity: string[]; // days with a completed session
}
