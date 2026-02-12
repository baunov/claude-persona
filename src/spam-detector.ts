import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STAMP_FILE = path.join(os.tmpdir(), 'claude-persona-stamps.json');
const SPAM_WINDOW_MS = 15_000;
const SPAM_THRESHOLD = 3;

function getTimestamps(): number[] {
  try {
    if (fs.existsSync(STAMP_FILE)) {
      return JSON.parse(fs.readFileSync(STAMP_FILE, 'utf8'));
    }
  } catch {
    // ignore corrupt file
  }
  return [];
}

function saveTimestamps(stamps: number[]): void {
  fs.writeFileSync(STAMP_FILE, JSON.stringify(stamps));
}

/**
 * Record a prompt timestamp and check if the user is spamming.
 * Returns true if 3+ prompts were submitted within 15 seconds.
 */
export function checkSpam(): boolean {
  const now = Date.now();
  const stamps = getTimestamps().filter((t) => now - t < SPAM_WINDOW_MS);
  stamps.push(now);
  saveTimestamps(stamps);
  return stamps.length >= SPAM_THRESHOLD;
}
