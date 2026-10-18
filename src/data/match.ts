import { LIBRARY, type LibraryExercise } from './library';

/** Words that name equipment or a variation count for less than the movement itself. */
const LIGHT = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'lever', 'leverage', 'band', 'kettlebell', 'ez', 'bar', 'rope', 'seated', 'standing', 'grip', 'medium', 'one', 'arm', 'single']);
/** Two names that mention different equipment are rarely the same exercise. */
const EQUIPMENT = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'smith', 'band', 'kettlebell', 'ez']);
const STOP = new Set(['with', 'the', 'a', 'on', 'to', 'of', 'and', 'attachment', 'exercise']);
const JOINED: [string, string][] = [
  ['pull up', 'pullup'],
  ['chin up', 'chinup'],
  ['push up', 'pushup'],
  ['sit up', 'situp'],
  ['skull crusher', 'skullcrusher'],
  ['bent over', 'bentover'],
  ['cross over', 'crossover'],
  ['hyper extension', 'hyperextension'],
  ['lat pull down', 'pulldown'],
  ['pull down', 'pulldown'],
  ['press down', 'pushdown'],
  ['push down', 'pushdown'],
  ['military press', 'shoulder press'],
  ['overhead press', 'shoulder press'],
];

/** Lowercase word set of an exercise name, with plurals and common spellings evened out. */
export function nameWords(name: string): Set<string> {
  let text = ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  for (const [from, to] of JOINED) text = text.replaceAll(` ${from} `, ` ${to} `).replaceAll(` ${from}s `, ` ${to} `);
  const words = text
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .map((w) => (w === 'flye' ? 'fly' : w));
  return new Set(words);
}

const weight = (word: string) => (LIGHT.has(word) ? 0.4 : 1);

/** How alike two names are, from 0 to 1. */
export function nameSimilarity(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  let total = 0;
  for (const w of new Set([...a, ...b])) {
    total += weight(w);
    if (a.has(w) && b.has(w)) shared += weight(w);
  }
  if (!total) return 0;
  const equipmentA = [...a].filter((w) => EQUIPMENT.has(w));
  const equipmentB = [...b].filter((w) => EQUIPMENT.has(w));
  const clash = equipmentA.length && equipmentB.length && !equipmentA.some((w) => b.has(w));
  return (shared / total) * (clash ? 0.6 : 1);
}

const LIBRARY_WORDS = LIBRARY.map((e) => ({ exercise: e, words: nameWords(e.name) }));

/** A score this high is almost always the same exercise. */
export const GOOD_MATCH = 0.75;

/** The library exercises whose names are most like `name`, best first. */
export function similarLibraryExercises(name: string, limit = 3): { exercise: LibraryExercise; score: number }[] {
  const words = nameWords(name);
  return LIBRARY_WORDS.map(({ exercise, words: other }) => ({ exercise, score: nameSimilarity(words, other) }))
    .filter((m) => m.score > 0.3)
    .sort((x, y) => y.score - x.score || x.exercise.name.length - y.exercise.name.length)
    .slice(0, limit);
}
