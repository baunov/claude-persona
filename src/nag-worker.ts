#!/usr/bin/env node

/**
 * Nag worker — standalone detached process that plays escalating reminder sounds.
 *
 * Usage: node nag-worker.js <state-file-path>
 *
 * Reads NagState from the state file. Sleeps through each timeout interval,
 * playing a random sound on each tick. Exits when the state file is deleted
 * (meaning the user responded) or after a max lifetime safety of 10 minutes.
 */

import fs from 'node:fs';
// @ts-expect-error no types for play-sound
import playSound from 'play-sound';
import { detectVolumeForPid } from './focus.js';
import { buildVolumeOpts } from './player.js';

const player = playSound();
const MAX_LIFETIME_MS = 10 * 60 * 1000; // 10 minutes

interface NagState {
  soundPaths: string[];
  timeouts: number[];
  startedAt: number;
  terminalPid?: number | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function playFile(filePath: string, volume?: number): Promise<void> {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      resolve();
      return;
    }
    const opts = buildVolumeOpts(volume);
    const args = Object.keys(opts).length > 0 ? [filePath, opts] : [filePath];
    player.play(...args, () => resolve());
  });
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

async function main(): Promise<void> {
  const statePath = process.argv[2];
  if (!statePath) {
    process.exit(0);
  }

  let state: NagState;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    process.exit(0);
  }

  const { soundPaths, timeouts, startedAt, terminalPid } = state;
  if (!soundPaths?.length || !timeouts?.length) {
    process.exit(0);
  }

  // Safety: enforce max lifetime
  const deadline = startedAt + MAX_LIFETIME_MS;

  for (const timeoutSec of timeouts) {
    // Sleep the interval
    await sleep(timeoutSec * 1000);

    // Check if cancelled (state file deleted)
    if (!fs.existsSync(statePath)) {
      process.exit(0);
    }

    // Check max lifetime
    if (Date.now() > deadline) {
      process.exit(0);
    }

    // Play a random sound (with focus-aware volume)
    const volume = detectVolumeForPid(terminalPid ?? null);
    await playFile(pickRandom(soundPaths), volume);
  }

  // All timeouts exhausted — clean up and exit
  try {
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
  } catch {
    // ignore
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
