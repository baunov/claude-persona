import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STAMP_FILE = path.join(os.tmpdir(), 'claude-persona-stamps.json');

beforeEach(() => {
  if (fs.existsSync(STAMP_FILE)) {
    fs.unlinkSync(STAMP_FILE);
  }
  vi.useFakeTimers();
});

afterEach(() => {
  if (fs.existsSync(STAMP_FILE)) {
    fs.unlinkSync(STAMP_FILE);
  }
  vi.useRealTimers();
});

describe('checkSpam', () => {
  it('returns false on first prompt', async () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { checkSpam } = await import('../../src/spam-detector.js');
    expect(checkSpam()).toBe(false);
  });

  it('returns false for 4 prompts within window (default threshold is 5)', async () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { checkSpam } = await import('../../src/spam-detector.js');

    fs.writeFileSync(STAMP_FILE, JSON.stringify([]));

    checkSpam(); // 1st
    vi.advanceTimersByTime(1000);
    checkSpam(); // 2nd
    vi.advanceTimersByTime(1000);
    checkSpam(); // 3rd
    vi.advanceTimersByTime(1000);
    expect(checkSpam()).toBe(false); // 4th — still below threshold of 5
  });

  it('returns true for 5 prompts within 10s (default)', async () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { checkSpam } = await import('../../src/spam-detector.js');

    fs.writeFileSync(STAMP_FILE, JSON.stringify([]));

    checkSpam(); // 1st
    vi.advanceTimersByTime(1000);
    checkSpam(); // 2nd
    vi.advanceTimersByTime(1000);
    checkSpam(); // 3rd
    vi.advanceTimersByTime(1000);
    checkSpam(); // 4th
    vi.advanceTimersByTime(1000);
    expect(checkSpam()).toBe(true); // 5th — spam!
  });

  it('respects custom threshold override', async () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { checkSpam } = await import('../../src/spam-detector.js');

    fs.writeFileSync(STAMP_FILE, JSON.stringify([]));

    checkSpam(3); // 1st
    vi.advanceTimersByTime(1000);
    checkSpam(3); // 2nd
    vi.advanceTimersByTime(1000);
    expect(checkSpam(3)).toBe(true); // 3rd — hits custom threshold of 3
  });

  it('respects custom window override', async () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { checkSpam } = await import('../../src/spam-detector.js');

    fs.writeFileSync(STAMP_FILE, JSON.stringify([]));

    checkSpam(5, 3000); // 1st
    vi.advanceTimersByTime(1000);
    checkSpam(5, 3000); // 2nd
    vi.advanceTimersByTime(1000);
    checkSpam(5, 3000); // 3rd
    vi.advanceTimersByTime(1000);
    checkSpam(5, 3000); // 4th
    vi.advanceTimersByTime(1000);
    // Only stamps from last 3s are counted (at most 3), so not 5
    expect(checkSpam(5, 3000)).toBe(false);
  });

  it('clears old timestamps outside window', async () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { checkSpam } = await import('../../src/spam-detector.js');

    // Seed with old timestamps (11s ago, outside 10s window)
    const now = Date.now();
    fs.writeFileSync(STAMP_FILE, JSON.stringify([now - 11000, now - 11000, now - 11000, now - 11000]));

    expect(checkSpam()).toBe(false);
  });

  it('handles corrupt stamp file gracefully', async () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { checkSpam } = await import('../../src/spam-detector.js');

    fs.writeFileSync(STAMP_FILE, 'not valid json');
    expect(checkSpam()).toBe(false);
  });

  it('handles missing stamp file', async () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { checkSpam } = await import('../../src/spam-detector.js');

    expect(checkSpam()).toBe(false);
    expect(fs.existsSync(STAMP_FILE)).toBe(true);
  });

  it('exports default constants', async () => {
    const { DEFAULT_SPAM_THRESHOLD, DEFAULT_SPAM_WINDOW_MS } = await import('../../src/spam-detector.js');
    expect(DEFAULT_SPAM_THRESHOLD).toBe(5);
    expect(DEFAULT_SPAM_WINDOW_MS).toBe(10_000);
  });
});
