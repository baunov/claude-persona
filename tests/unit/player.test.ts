import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to track the mock function from inside the vi.mock factory
// Use vi.hoisted() so it's available before the mock factory runs
const mockPlay = vi.hoisted(() => vi.fn());

vi.mock('play-sound', () => ({
  default: () => ({
    play: mockPlay,
  }),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
    },
  };
});

import fs from 'node:fs';
import { randomElement, play, playRandom } from '../../src/player.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('randomElement', () => {
  it('returns an element from the array', () => {
    const arr = [1, 2, 3, 4, 5];
    const result = randomElement(arr);
    expect(arr).toContain(result);
  });

  it('returns the only element from a single-item array', () => {
    expect(randomElement(['only'])).toBe('only');
  });

  it('can return different elements (statistical)', () => {
    const arr = ['a', 'b', 'c'];
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      results.add(randomElement(arr));
    }
    // With 100 tries over 3 elements, extremely unlikely to not see at least 2
    expect(results.size).toBeGreaterThanOrEqual(2);
  });
});

describe('play', () => {
  it('resolves when file exists and playback succeeds', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    mockPlay.mockImplementation((_path: string, cb: (err: null) => void) => cb(null));

    await expect(play('/some/file.mp3')).resolves.toBeUndefined();
    expect(mockPlay).toHaveBeenCalledWith('/some/file.mp3', expect.any(Function));
  });

  it('resolves without playing if file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(play('/missing/file.mp3')).resolves.toBeUndefined();
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('resolves on playback error (silent fail)', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    mockPlay.mockImplementation((_path: string, cb: (err: Error) => void) =>
      cb(new Error('playback failed')),
    );

    await expect(play('/some/file.mp3')).resolves.toBeUndefined();
  });
});

describe('playRandom', () => {
  it('resolves immediately for empty array', async () => {
    await expect(playRandom([])).resolves.toBeUndefined();
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('plays one sound from the list', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    mockPlay.mockImplementation((_path: string, cb: (err: null) => void) => cb(null));

    await playRandom(['/a.mp3', '/b.mp3']);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });
});
