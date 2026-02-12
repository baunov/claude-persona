import fs from 'node:fs';

const FLAG_PATTERN = /<!--\s*persona:(\S+)\s*-->/g;

interface TranscriptEntry {
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
}

/**
 * Scan the transcript for persona flags in the last assistant message.
 * Returns the first matching flag name, or null if none found.
 */
export function scanForFlags(
  transcriptPath: string,
  validFlags: string[],
): string | null {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return null;
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

  // Find the last assistant message
  let lastAssistantText = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry: TranscriptEntry = JSON.parse(lines[i]!);
      if (entry.role === 'assistant') {
        if (typeof entry.content === 'string') {
          lastAssistantText = entry.content;
        } else if (Array.isArray(entry.content)) {
          lastAssistantText = entry.content
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

  if (!lastAssistantText) return null;

  // Scan for persona flags
  let match: RegExpExecArray | null;
  while ((match = FLAG_PATTERN.exec(lastAssistantText)) !== null) {
    const flagName = match[1]!;
    if (validFlags.includes(flagName)) {
      return flagName;
    }
  }

  return null;
}
