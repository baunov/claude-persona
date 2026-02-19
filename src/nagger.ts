import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NAG_PREFIX = 'claude-persona-nag-';

/** Build the path to a nag state file for a given session */
export function nagStatePath(sessionId: string): string {
  return path.join(os.tmpdir(), `${NAG_PREFIX}${sessionId}.json`);
}

export interface NagState {
  soundPaths: string[];
  timeouts: number[];
  startedAt: number;
  terminalPid: number | null;
}

/**
 * Start a background nagger process that plays escalating reminder sounds
 * at the configured timeout intervals until cancelled.
 */
export function startNagger(
  sessionId: string,
  soundPaths: string[],
  timeouts: number[],
  terminalPid: number | null = null,
): void {
  if (soundPaths.length === 0 || timeouts.length === 0) return;

  const statePath = nagStatePath(sessionId);

  // Write state file — the worker reads this
  const state: NagState = {
    soundPaths,
    timeouts,
    startedAt: Date.now(),
    terminalPid,
  };
  fs.writeFileSync(statePath, JSON.stringify(state));

  // Spawn detached worker
  const workerPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'nag-worker.js',
  );

  const child = fork(workerPath, [statePath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

/**
 * Cancel any active nagger for a session by removing its state file.
 * The worker self-terminates when the state file is gone.
 */
export function cancelNagger(sessionId: string): void {
  const statePath = nagStatePath(sessionId);
  try {
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
  } catch {
    // ignore — file may already be gone
  }
}
