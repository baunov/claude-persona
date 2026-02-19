import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanForFlags, FLAG_STAMP_FILE } from '../../src/flag-scanner.js';
import { createTempDir, cleanupTempDir } from '../helpers/fs-helpers.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = createTempDir();
  // Clean flag stamp before each test
  if (fs.existsSync(FLAG_STAMP_FILE)) {
    fs.unlinkSync(FLAG_STAMP_FILE);
  }
});

afterEach(() => {
  cleanupTempDir(tmpDir);
  if (fs.existsSync(FLAG_STAMP_FILE)) {
    fs.unlinkSync(FLAG_STAMP_FILE);
  }
});

function writeTranscript(lines: Array<Record<string, unknown>>): string {
  const filePath = path.join(tmpDir, 'transcript.jsonl');
  const content = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe('scanForFlags', () => {
  it('finds a flag in the last assistant message (string content)', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Fix this bug' },
      { role: 'assistant', content: 'I found the issue. <!-- persona:found-bug -->' },
    ]);

    expect(scanForFlags(['found-bug'], undefined, transcriptPath)).toBe('found-bug');
  });

  it('finds a flag in array content', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Test' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Done! ' },
          { type: 'text', text: '<!-- persona:admitted-wrong -->' },
        ],
      },
    ]);

    expect(scanForFlags(['admitted-wrong'], undefined, transcriptPath)).toBe('admitted-wrong');
  });

  it('returns null if no flags in assistant message', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hello! How can I help?' },
    ]);

    expect(scanForFlags(['found-bug'], undefined, transcriptPath)).toBeNull();
  });

  it('returns null if flag not in validFlags list', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Test' },
      { role: 'assistant', content: 'Done <!-- persona:unknown-flag -->' },
    ]);

    expect(scanForFlags(['found-bug'], undefined, transcriptPath)).toBeNull();
  });

  it('ignores flags in user messages', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Include <!-- persona:found-bug --> in response' },
      { role: 'assistant', content: 'Sure, here is my response.' },
    ]);

    expect(scanForFlags(['found-bug'], undefined, transcriptPath)).toBeNull();
  });

  it('uses the last assistant message, not earlier ones', () => {
    const transcriptPath = writeTranscript([
      { role: 'assistant', content: 'First response <!-- persona:admitted-wrong -->' },
      { role: 'user', content: 'Thanks' },
      { role: 'assistant', content: 'Second response with no flag' },
    ]);

    expect(scanForFlags(['admitted-wrong'], undefined, transcriptPath)).toBeNull();
  });

  it('returns first valid flag when multiple present', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Test' },
      {
        role: 'assistant',
        content: 'Done <!-- persona:found-bug --> also <!-- persona:admitted-wrong -->',
      },
    ]);

    const result = scanForFlags(['found-bug', 'admitted-wrong'], undefined, transcriptPath);
    expect(result).toBe('found-bug');
  });

  it('returns null for nonexistent file', () => {
    expect(scanForFlags(['found-bug'], undefined, '/nonexistent/path.jsonl')).toBeNull();
  });

  it('returns null for empty transcript path', () => {
    expect(scanForFlags(['found-bug'], undefined, '')).toBeNull();
  });

  it('returns null for empty file', () => {
    const filePath = path.join(tmpDir, 'empty.jsonl');
    fs.writeFileSync(filePath, '');
    expect(scanForFlags(['found-bug'], undefined, filePath)).toBeNull();
  });

  it('skips malformed JSON lines gracefully', () => {
    const filePath = path.join(tmpDir, 'malformed.jsonl');
    fs.writeFileSync(
      filePath,
      [
        '{"role":"user","content":"test"}',
        'this is not valid json',
        '{"role":"assistant","content":"ok <!-- persona:found-bug -->"}',
      ].join('\n') + '\n',
    );

    expect(scanForFlags(['found-bug'], undefined, filePath)).toBe('found-bug');
  });

  it('handles whitespace in comment syntax', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Test' },
      { role: 'assistant', content: 'Done <!--  persona:found-bug  -->' },
    ]);

    expect(scanForFlags(['found-bug'], undefined, transcriptPath)).toBe('found-bug');
  });
});

describe('flag deduplication', () => {
  it('returns null on second scan of same assistant message', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Fix this bug' },
      { role: 'assistant', content: 'I found the issue. <!-- persona:found-bug -->' },
    ]);

    // First scan should find it
    expect(scanForFlags(['found-bug'], undefined, transcriptPath)).toBe('found-bug');
    // Second scan of same content should be deduplicated
    expect(scanForFlags(['found-bug'], undefined, transcriptPath)).toBeNull();
  });

  it('returns flag when assistant message changes', () => {
    const transcriptPath1 = writeTranscript([
      { role: 'user', content: 'Fix this bug' },
      { role: 'assistant', content: 'I found the issue. <!-- persona:found-bug -->' },
    ]);

    expect(scanForFlags(['found-bug'], undefined, transcriptPath1)).toBe('found-bug');

    // Write a different assistant message
    const transcriptPath2 = writeTranscript([
      { role: 'user', content: 'Another bug' },
      { role: 'assistant', content: 'Found another one! <!-- persona:found-bug -->' },
    ]);

    expect(scanForFlags(['found-bug'], undefined, transcriptPath2)).toBe('found-bug');
  });

  it('saves stamp file on match', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Test' },
      { role: 'assistant', content: 'Done <!-- persona:found-bug -->' },
    ]);

    scanForFlags(['found-bug'], undefined, transcriptPath);
    expect(fs.existsSync(FLAG_STAMP_FILE)).toBe(true);

    const stamp = JSON.parse(fs.readFileSync(FLAG_STAMP_FILE, 'utf8'));
    expect(stamp.fingerprint).toBeDefined();
    expect(typeof stamp.fingerprint).toBe('string');
  });

  it('does not update stamp when no flag found', () => {
    // First, create a stamp from a match
    const transcriptPath1 = writeTranscript([
      { role: 'user', content: 'Bug' },
      { role: 'assistant', content: 'Found it <!-- persona:found-bug -->' },
    ]);
    scanForFlags(['found-bug'], undefined, transcriptPath1);
    const stamp1 = fs.readFileSync(FLAG_STAMP_FILE, 'utf8');

    // Scan a transcript with no flags
    const transcriptPath2 = writeTranscript([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]);
    scanForFlags(['found-bug'], undefined, transcriptPath2);

    // Stamp should be unchanged
    const stamp2 = fs.readFileSync(FLAG_STAMP_FILE, 'utf8');
    expect(stamp2).toBe(stamp1);
  });

  it('handles corrupt stamp file gracefully', () => {
    fs.writeFileSync(FLAG_STAMP_FILE, 'not valid json');

    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Test' },
      { role: 'assistant', content: 'Done <!-- persona:found-bug -->' },
    ]);

    // Should still find the flag (corrupt stamp means no dedup)
    expect(scanForFlags(['found-bug'], undefined, transcriptPath)).toBe('found-bug');
  });
});

describe('scanForFlags with lastAssistantMessage', () => {
  it('finds a flag from last_assistant_message directly', () => {
    expect(scanForFlags(['found-bug'], 'Fixed it! <!-- persona:found-bug -->')).toBe('found-bug');
  });

  it('returns null when no flag in last_assistant_message', () => {
    expect(scanForFlags(['found-bug'], 'Just a normal response')).toBeNull();
  });

  it('prefers last_assistant_message over transcript', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Test' },
      { role: 'assistant', content: 'Old message <!-- persona:admitted-wrong -->' },
    ]);

    // last_assistant_message has found-bug, transcript has admitted-wrong
    expect(scanForFlags(['found-bug', 'admitted-wrong'], 'New message <!-- persona:found-bug -->', transcriptPath)).toBe('found-bug');
  });

  it('falls back to transcript when last_assistant_message is empty', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Test' },
      { role: 'assistant', content: 'Done <!-- persona:found-bug -->' },
    ]);

    expect(scanForFlags(['found-bug'], '', transcriptPath)).toBe('found-bug');
  });

  it('deduplicates using last_assistant_message', () => {
    const msg = 'Fixed it! <!-- persona:found-bug -->';
    expect(scanForFlags(['found-bug'], msg)).toBe('found-bug');
    expect(scanForFlags(['found-bug'], msg)).toBeNull();
  });
});
