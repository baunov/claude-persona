import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nagStatePath, startNagger, cancelNagger } from '../../src/nagger.js';

const TEST_SESSION = 'test-session-nagger';

function cleanNagFile(): void {
  const p = nagStatePath(TEST_SESSION);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
  }
}

beforeEach(() => {
  cleanNagFile();
});

afterEach(() => {
  cleanNagFile();
});

describe('nagStatePath', () => {
  it('returns a path in tmpdir with session id', () => {
    const p = nagStatePath('my-session');
    expect(p).toBe(path.join(os.tmpdir(), 'claude-persona-nag-my-session.json'));
  });
});

describe('startNagger', () => {
  it('creates a state file with correct contents', () => {
    // We pass fake sound paths — the worker won't actually run successfully in test
    // but we can verify the state file is created
    startNagger(TEST_SESSION, ['/fake/sound.mp3'], [30, 60]);

    const statePath = nagStatePath(TEST_SESSION);
    expect(fs.existsSync(statePath)).toBe(true);

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(state.soundPaths).toEqual(['/fake/sound.mp3']);
    expect(state.timeouts).toEqual([30, 60]);
    expect(state.startedAt).toBeGreaterThan(0);
    expect(state.terminalPid).toBeNull();
  });

  it('stores terminalPid in state file when provided', () => {
    startNagger(TEST_SESSION, ['/fake/sound.mp3'], [30, 60], 12345);

    const statePath = nagStatePath(TEST_SESSION);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(state.terminalPid).toBe(12345);
  });

  it('does nothing if soundPaths is empty', () => {
    startNagger(TEST_SESSION, [], [30]);
    expect(fs.existsSync(nagStatePath(TEST_SESSION))).toBe(false);
  });

  it('does nothing if timeouts is empty', () => {
    startNagger(TEST_SESSION, ['/fake/sound.mp3'], []);
    expect(fs.existsSync(nagStatePath(TEST_SESSION))).toBe(false);
  });
});

describe('cancelNagger', () => {
  it('removes the state file', () => {
    const statePath = nagStatePath(TEST_SESSION);
    fs.writeFileSync(statePath, JSON.stringify({ test: true }));

    cancelNagger(TEST_SESSION);
    expect(fs.existsSync(statePath)).toBe(false);
  });

  it('does nothing if no state file exists', () => {
    // Should not throw
    expect(() => cancelNagger(TEST_SESSION)).not.toThrow();
  });
});
