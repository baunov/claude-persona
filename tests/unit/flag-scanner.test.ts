import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { scanForFlags } from '../../src/flag-scanner.js';
import { createTempDir, cleanupTempDir } from '../helpers/fs-helpers.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = createTempDir();
});

afterEach(() => {
  cleanupTempDir(tmpDir);
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

    expect(scanForFlags(transcriptPath, ['found-bug'])).toBe('found-bug');
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

    expect(scanForFlags(transcriptPath, ['admitted-wrong'])).toBe('admitted-wrong');
  });

  it('returns null if no flags in assistant message', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hello! How can I help?' },
    ]);

    expect(scanForFlags(transcriptPath, ['found-bug'])).toBeNull();
  });

  it('returns null if flag not in validFlags list', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Test' },
      { role: 'assistant', content: 'Done <!-- persona:unknown-flag -->' },
    ]);

    expect(scanForFlags(transcriptPath, ['found-bug'])).toBeNull();
  });

  it('ignores flags in user messages', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Include <!-- persona:found-bug --> in response' },
      { role: 'assistant', content: 'Sure, here is my response.' },
    ]);

    expect(scanForFlags(transcriptPath, ['found-bug'])).toBeNull();
  });

  it('uses the last assistant message, not earlier ones', () => {
    const transcriptPath = writeTranscript([
      { role: 'assistant', content: 'First response <!-- persona:admitted-wrong -->' },
      { role: 'user', content: 'Thanks' },
      { role: 'assistant', content: 'Second response with no flag' },
    ]);

    expect(scanForFlags(transcriptPath, ['admitted-wrong'])).toBeNull();
  });

  it('returns first valid flag when multiple present', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Test' },
      {
        role: 'assistant',
        content: 'Done <!-- persona:found-bug --> also <!-- persona:admitted-wrong -->',
      },
    ]);

    const result = scanForFlags(transcriptPath, ['found-bug', 'admitted-wrong']);
    expect(result).toBe('found-bug');
  });

  it('returns null for nonexistent file', () => {
    expect(scanForFlags('/nonexistent/path.jsonl', ['found-bug'])).toBeNull();
  });

  it('returns null for empty transcript path', () => {
    expect(scanForFlags('', ['found-bug'])).toBeNull();
  });

  it('returns null for empty file', () => {
    const filePath = path.join(tmpDir, 'empty.jsonl');
    fs.writeFileSync(filePath, '');
    expect(scanForFlags(filePath, ['found-bug'])).toBeNull();
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

    expect(scanForFlags(filePath, ['found-bug'])).toBe('found-bug');
  });

  it('handles whitespace in comment syntax', () => {
    const transcriptPath = writeTranscript([
      { role: 'user', content: 'Test' },
      { role: 'assistant', content: 'Done <!--  persona:found-bug  -->' },
    ]);

    expect(scanForFlags(transcriptPath, ['found-bug'])).toBe('found-bug');
  });
});
