import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STAMP_FILE = path.join(os.tmpdir(), 'claude-persona-stamps.json');
export const DEFAULT_SPAM_WINDOW_MS = 10_000;
export const DEFAULT_SPAM_THRESHOLD = 5;

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
 * Returns true if threshold+ prompts were submitted within the window.
 */
export function checkSpam(
  threshold = DEFAULT_SPAM_THRESHOLD,
  windowMs = DEFAULT_SPAM_WINDOW_MS,
): boolean {
  const now = Date.now();
  const stamps = getTimestamps().filter((t) => now - t < windowMs);
  stamps.push(now);
  saveTimestamps(stamps);
  return stamps.length >= threshold;
}
