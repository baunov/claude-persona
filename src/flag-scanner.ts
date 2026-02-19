import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FLAG_PATTERN = /<!--\s*persona:(\S+)\s*-->/g;

export const FLAG_STAMP_FILE = path.join(os.tmpdir(), 'claude-persona-flag-stamp.json');

interface TranscriptEntry {
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
}

interface FlagStamp {
  fingerprint: string;
}

function makeFingerprint(text: string): string {
  return `${text.length}:${text.slice(0, 64)}:${text.slice(-64)}`;
}

function loadFlagStamp(): FlagStamp | null {
  try {
    if (fs.existsSync(FLAG_STAMP_FILE)) {
      return JSON.parse(fs.readFileSync(FLAG_STAMP_FILE, 'utf8'));
    }
  } catch {
    // ignore corrupt file
  }
  return null;
}

function saveFlagStamp(stamp: FlagStamp): void {
  fs.writeFileSync(FLAG_STAMP_FILE, JSON.stringify(stamp));
}

/**
 * Extract the last assistant message text from the transcript JSONL file.
 * Used as fallback when last_assistant_message isn't available in hook input.
 */
function extractLastAssistantText(transcriptPath: string): string {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return '';
  }

  // Read last 30KB of transcript
  const stat = fs.statSync(transcriptPath);
  const readSize = Math.min(stat.size, 30 * 1024);
  const fd = fs.openSync(transcriptPath, 'r');
  const buffer = Buffer.alloc(readSize);
  fs.readSync(fd, buffer, 0, readSize, Math.max(0, stat.size - readSize));
  fs.closeSync(fd);

  const tail = buffer.toString('utf8');
  const lines = tail.split('\n').filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry: TranscriptEntry = JSON.parse(lines[i]!);
      if (entry.role === 'assistant') {
        if (typeof entry.content === 'string') {
          return entry.content;
        } else if (Array.isArray(entry.content)) {
          return entry.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join(' ');
        }
        break;
      }
    } catch {
      // Skip malformed lines
    }
  }

  return '';
}

/**
 * Scan for persona flags in the last assistant message.
 * Returns the first matching flag name, or null if none found.
 * Deduplicates by fingerprinting the assistant message — if the same message
 * was already scanned, returns null to avoid replaying the same sound.
 *
 * Accepts the message text directly (from hook input's last_assistant_message)
 * or falls back to parsing the transcript JSONL file.
 */
export function scanForFlags(
  validFlags: string[],
  lastAssistantMessage?: string,
  transcriptPath?: string,
): string | null {
  const lastAssistantText = lastAssistantMessage || extractLastAssistantText(transcriptPath ?? '');

  if (!lastAssistantText) return null;

  // Scan for persona flags
  FLAG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  let flagName: string | null = null;
  while ((match = FLAG_PATTERN.exec(lastAssistantText)) !== null) {
    const candidate = match[1]!;
    if (validFlags.includes(candidate)) {
      flagName = candidate;
      break;
    }
  }

  if (!flagName) return null;

  // Deduplication: check fingerprint of the assistant message
  const fingerprint = makeFingerprint(lastAssistantText);
  const stamp = loadFlagStamp();
  if (stamp && stamp.fingerprint === fingerprint) {
    return null; // Already processed this message
  }

  // New match — save fingerprint
  saveFlagStamp({ fingerprint });

  return flagName;
}
