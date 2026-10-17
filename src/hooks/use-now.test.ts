import { describe, expect, it } from 'vitest';

import { formatDuration } from './use-now';

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(95)).toBe('1:35');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});
