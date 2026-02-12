import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STAMP_FILE = path.join(os.tmpdir(), 'claude-persona-stamps.json');

// We need to test checkSpam in isolation with controlled time
// Since the module uses Date.now() at call time, we can mock it

beforeEach(() => {
  // Clean stamp file before each test
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

  it('returns false for 2 prompts within window', async () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    // Need to re-import to get fresh module with fake timer
    const { checkSpam } = await import('../../src/spam-detector.js');

    // Reset stamp file
    fs.writeFileSync(STAMP_FILE, JSON.stringify([]));

    checkSpam(); // 1st
    vi.advanceTimersByTime(1000);
    expect(checkSpam()).toBe(false); // 2nd - still only 2
  });

  it('returns true for 3 prompts within 15s', async () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { checkSpam } = await import('../../src/spam-detector.js');

    // Reset stamp file
    fs.writeFileSync(STAMP_FILE, JSON.stringify([]));

    checkSpam(); // 1st
    vi.advanceTimersByTime(1000);
    checkSpam(); // 2nd
    vi.advanceTimersByTime(1000);
    expect(checkSpam()).toBe(true); // 3rd — spam!
  });

  it('clears old timestamps outside window', async () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { checkSpam } = await import('../../src/spam-detector.js');

    // Seed with old timestamps (16s ago)
    const now = Date.now();
    fs.writeFileSync(STAMP_FILE, JSON.stringify([now - 16000, now - 16000]));

    // New prompt should not count old ones
    expect(checkSpam()).toBe(false);
  });

  it('handles corrupt stamp file gracefully', async () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { checkSpam } = await import('../../src/spam-detector.js');

    fs.writeFileSync(STAMP_FILE, 'not valid json');
    expect(checkSpam()).toBe(false); // Should not throw
  });

  it('handles missing stamp file', async () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { checkSpam } = await import('../../src/spam-detector.js');

    // No stamp file — should create one
    expect(checkSpam()).toBe(false);
    expect(fs.existsSync(STAMP_FILE)).toBe(true);
  });
});
