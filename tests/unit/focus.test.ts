import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before imports
const mockExecFileSync = vi.hoisted(() => vi.fn());
const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
  execFile: mockExecFile,
}));

vi.mock('node:util', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:util')>();
  return {
    ...original,
    promisify: (fn: Function) => {
      if (fn === mockExecFile) {
        // Return an async function that calls mockExecFile and resolves with { stdout, stderr }
        return (...args: unknown[]) => {
          return new Promise((resolve, reject) => {
            const result = mockExecFile(...args);
            if (result instanceof Error) {
              reject(result);
            } else {
              resolve(result);
            }
          });
        };
      }
      return original.promisify(fn as any);
    },
  };
});

import {
  detectVolume,
  detectVolumeAsync,
  detectVolumeForPid,
  getTerminalAppPid,
  BACKGROUND_VOLUME,
} from '../../src/focus.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// Save and restore process.platform
const originalPlatform = process.platform;
function setPlatform(platform: string): void {
  Object.defineProperty(process, 'platform', { value: platform, writable: true });
}
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
});

describe('detectVolume (sync)', () => {
  it('returns 1.0 when process is descendant of frontmost app (macOS)', () => {
    setPlatform('darwin');
    const currentPid = process.pid;

    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'osascript') {
        return `${currentPid}\n`;
      }
      if (cmd === 'ps') {
        return '1\n';
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    expect(detectVolume()).toBe(1.0);
  });

  it('returns BACKGROUND_VOLUME when process is NOT descendant of frontmost app', () => {
    setPlatform('darwin');

    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'osascript') {
        return '99999\n';
      }
      if (cmd === 'ps') {
        const pidArg = args[args.length - 1];
        if (pidArg === '1') return '0\n';
        return '1\n';
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    expect(detectVolume()).toBe(BACKGROUND_VOLUME);
  });

  it('returns 1.0 when getFrontmostPid fails (unsupported platform)', () => {
    setPlatform('win32');
    expect(detectVolume()).toBe(1.0);
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('returns 1.0 when osascript throws an error', () => {
    setPlatform('darwin');
    mockExecFileSync.mockImplementation((cmd: string) => {
      if (cmd === 'osascript') throw new Error('osascript not found');
      return '1\n';
    });

    expect(detectVolume()).toBe(1.0);
  });
});

describe('detectVolumeAsync', () => {
  it('returns 1.0 when process is ancestor of frontmost app', async () => {
    setPlatform('darwin');
    const currentPid = process.pid;

    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'osascript') {
        return { stdout: `${currentPid}\n`, stderr: '' };
      }
      if (cmd === 'ps') {
        // Build a process tree: currentPid -> 1
        const lines = [
          '  PID  PPID',
          `    ${currentPid}     1`,
        ].join('\n');
        return { stdout: lines, stderr: '' };
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    expect(await detectVolumeAsync()).toBe(1.0);
  });

  it('returns BACKGROUND_VOLUME when process is NOT ancestor of frontmost app', async () => {
    setPlatform('darwin');
    const currentPid = process.pid;

    mockExecFile.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'osascript') {
        return { stdout: '99999\n', stderr: '' };
      }
      if (cmd === 'ps') {
        // Process tree: currentPid -> 500 -> 1, 99999 -> 88888 -> 1
        const lines = [
          '  PID  PPID',
          `    ${currentPid}   500`,
          '  500     1',
          '99999 88888',
          '88888     1',
        ].join('\n');
        return { stdout: lines, stderr: '' };
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    expect(await detectVolumeAsync()).toBe(BACKGROUND_VOLUME);
  });

  it('returns 1.0 on unsupported platform', async () => {
    setPlatform('win32');
    expect(await detectVolumeAsync()).toBe(1.0);
  });

  it('returns 1.0 when osascript fails', async () => {
    setPlatform('darwin');
    mockExecFile.mockImplementation((cmd: string) => {
      if (cmd === 'osascript') throw new Error('osascript not found');
      return { stdout: '', stderr: '' };
    });

    expect(await detectVolumeAsync()).toBe(1.0);
  });

  it('returns 1.0 when ps fails (empty tree)', async () => {
    setPlatform('darwin');
    const currentPid = process.pid;

    mockExecFile.mockImplementation((cmd: string) => {
      if (cmd === 'osascript') {
        return { stdout: `${currentPid}\n`, stderr: '' };
      }
      if (cmd === 'ps') {
        throw new Error('ps not found');
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    // frontPid matches process.pid, but tree is empty so isAncestorInTree
    // will find process.pid === frontPid on the first iteration
    expect(await detectVolumeAsync()).toBe(1.0);
  });
});

describe('detectVolumeForPid', () => {
  it('returns 1.0 when terminalPid is null', () => {
    expect(detectVolumeForPid(null)).toBe(1.0);
  });

  it('returns 1.0 when terminalPid matches frontmost PID', () => {
    setPlatform('darwin');
    mockExecFileSync.mockImplementation((cmd: string) => {
      if (cmd === 'osascript') return '12345\n';
      if (cmd === 'ps') return '1\n';
      throw new Error(`unexpected: ${cmd}`);
    });

    expect(detectVolumeForPid(12345)).toBe(1.0);
  });

  it('returns BACKGROUND_VOLUME when terminalPid does not match', () => {
    setPlatform('darwin');
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'osascript') return '99999\n';
      if (cmd === 'ps') {
        const pidArg = args[args.length - 1];
        if (pidArg === '1' || pidArg === '0') return '0\n';
        return '1\n';
      }
      throw new Error(`unexpected: ${cmd}`);
    });

    expect(detectVolumeForPid(12345)).toBe(BACKGROUND_VOLUME);
  });

  it('returns 1.0 when getFrontmostPid fails', () => {
    setPlatform('darwin');
    mockExecFileSync.mockImplementation(() => {
      throw new Error('command failed');
    });

    expect(detectVolumeForPid(12345)).toBe(1.0);
  });
});

describe('getTerminalAppPid', () => {
  it('walks up process tree and returns terminal PID', () => {
    const currentPid = process.pid;

    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd !== 'ps') throw new Error(`unexpected: ${cmd}`);
      const pidArg = args[args.length - 1];
      if (pidArg === String(currentPid)) return '500\n';
      if (pidArg === '500') return '400\n';
      if (pidArg === '400') return '1\n';
      return '0\n';
    });

    expect(getTerminalAppPid()).toBe(400);
  });

  it('returns null-safe result when ps fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('ps not found');
    });

    const result = getTerminalAppPid();
    expect(typeof result).toBe('number');
  });
});
