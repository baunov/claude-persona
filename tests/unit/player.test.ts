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
import { randomElement, play, playRandom, buildVolumeOpts } from '../../src/player.js';

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

describe('buildVolumeOpts', () => {
  it('returns empty object for undefined volume', () => {
    expect(buildVolumeOpts(undefined)).toEqual({});
  });

  it('returns empty object for volume 1.0', () => {
    expect(buildVolumeOpts(1.0)).toEqual({});
  });

  it('returns player-specific args for volume 0.6', () => {
    const opts = buildVolumeOpts(0.6);
    expect(opts.afplay).toEqual(['-v', '0.6']);
    expect(opts.mpg123).toEqual(['-f', '19661']);
    expect(opts.mpg321).toEqual(['-f', '19661']);
    expect(opts.play).toEqual(['-v', '0.6']);
    expect(opts.mplayer).toEqual(['-volume', '60']);
  });
});

describe('play with volume', () => {
  it('passes volume opts to player.play when volume < 1.0', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    mockPlay.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: null) => void;
      cb(null);
    });

    await play('/some/file.mp3', 0.6);
    expect(mockPlay).toHaveBeenCalledTimes(1);

    const callArgs = mockPlay.mock.calls[0];
    expect(callArgs[0]).toBe('/some/file.mp3');
    // Second arg should be the volume opts object
    expect(callArgs[1]).toHaveProperty('afplay');
    expect(callArgs[1].afplay).toEqual(['-v', '0.6']);
  });

  it('does not pass volume opts when volume is 1.0', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    mockPlay.mockImplementation((_path: string, cb: (err: null) => void) => cb(null));

    await play('/some/file.mp3', 1.0);
    expect(mockPlay).toHaveBeenCalledWith('/some/file.mp3', expect.any(Function));
  });

  it('does not pass volume opts when volume is undefined', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    mockPlay.mockImplementation((_path: string, cb: (err: null) => void) => cb(null));

    await play('/some/file.mp3');
    expect(mockPlay).toHaveBeenCalledWith('/some/file.mp3', expect.any(Function));
  });
});
