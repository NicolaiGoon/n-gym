/** Swaps an item with its neighbour in a list ordered by position. Returns the new order of ids. */
export function moveInOrder<T extends { id: number }>(items: T[], id: number, direction: 'up' | 'down'): number[] {
  const ids = items.map((i) => i.id);
  const from = ids.indexOf(id);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}
