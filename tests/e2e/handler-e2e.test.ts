/**
 * E2E tests for the handler invocation path.
 *
 * These run the **exact compiled handler commands** that Claude Code would run —
 * same args, same stdin JSON format, same subprocess model. Outcomes are verified
 * via the CLAUDE_PERSONA_LOG JSONL mechanism.
 *
 * No API cost, fully deterministic.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createTempDir, cleanupTempDir } from '../helpers/fs-helpers.js';

const ROOT = path.resolve(__dirname, '../..');
const SPAM_STAMP = path.join(os.tmpdir(), 'claude-persona-stamps.json');
const FLAG_STAMP = path.join(os.tmpdir(), 'claude-persona-flag-stamp.json');

let projectDir: string;
let logFile: string;
let cliPath: string;
let handlerPath: string;
let activeConfigPath: string;

/** Run the CLI in the project directory */
function cli(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(
      `node "${cliPath}" ${args}`,
      { cwd: projectDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return { stdout, exitCode: 0 };
  } catch (err: any) {
    return { stdout: (err.stdout ?? '') + (err.stderr ?? ''), exitCode: err.status ?? 1 };
  }
}

/** Invoke the handler exactly as Claude Code would — piped stdin, same args */
function handler(
  event: string,
  stdinObj: Record<string, unknown> = {},
  extraArgs = '',
): number {
  const stdin = JSON.stringify({
    session_id: 'e2e-test',
    hook_event_name: event,
    ...stdinObj,
  });
  // Escape single quotes in JSON for shell
  const escaped = stdin.replace(/'/g, "'\\''");
  const cmd = `echo '${escaped}' | node "${handlerPath}" --event ${event} --config "${activeConfigPath}" ${extraArgs} #claude-persona`;
  try {
    execSync(cmd, {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 8000,
      env: { ...process.env, CLAUDE_PERSONA_LOG: logFile },
    });
    return 0;
  } catch (err: any) {
    return err.status ?? 1;
  }
}

/** Read all JSONL log entries */
function readLog(): Array<Record<string, unknown>> {
  if (!fs.existsSync(logFile)) return [];
  return fs.readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** Clean up shared temp files that could leak between tests */
function clearTempFiles(): void {
  for (const f of [SPAM_STAMP, FLAG_STAMP]) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
  // Clean nag state files
  for (const f of fs.readdirSync(os.tmpdir())) {
    if (f.startsWith('claude-persona-nag-')) {
      try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch { /* ignore */ }
    }
  }
}

describe('Handler E2E', () => {
  beforeAll(() => {
    execSync('npm run build', { cwd: ROOT, stdio: 'pipe' });
    cliPath = path.join(ROOT, 'dist/cli/index.js');
    handlerPath = path.join(ROOT, 'dist/handler.js');
  });

  beforeEach(() => {
    projectDir = createTempDir();
    logFile = path.join(projectDir, 'persona.log');

    // Install peasant persona (the real one, with all trigger types)
    const { exitCode } = cli('init --project --persona peasant');
    expect(exitCode).toBe(0);
    activeConfigPath = path.join(projectDir, '.claude', 'persona', 'active.json');

    clearTempFiles();
  });

  afterEach(() => {
    clearTempFiles();
    cleanupTempDir(projectDir);
  });

  // ── Hook event types ──

  it('resolves situation for UserPromptSubmit', () => {
    handler('UserPromptSubmit');
    const log = readLog();
    // May have nagger cancelled entry too, filter to normal
    const normal = log.filter((e) => e.mode === 'normal');
    expect(normal).toHaveLength(1);
    expect(normal[0]).toMatchObject({
      event: 'UserPromptSubmit',
      situation: 'prompt-submitted',
      mode: 'normal',
    });
    expect(normal[0]!.sound).toBeDefined();
  });

  it('resolves situation for Stop', () => {
    handler('Stop');
    const log = readLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      event: 'Stop',
      situation: 'task-complete',
      mode: 'normal',
    });
  });

  it('resolves situation for SessionStart', () => {
    handler('SessionStart');
    const log = readLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      event: 'SessionStart',
      situation: 'session-start',
      mode: 'normal',
    });
  });

  it('resolves situation for SessionEnd', () => {
    handler('SessionEnd');
    const log = readLog();
    // May have nagger cancelled entry too
    const normal = log.filter((e) => e.mode === 'normal');
    expect(normal).toHaveLength(1);
    expect(normal[0]).toMatchObject({
      event: 'SessionEnd',
      situation: 'session-end',
      mode: 'normal',
    });
  });

  it('resolves situation for Notification (permission_prompt starts nagger)', () => {
    handler('Notification', { notification_type: 'permission_prompt' });
    const log = readLog();
    // Permission notification triggers both nagger start and normal situation
    const nagEntry = log.find((e) => e.mode === 'nagger');
    const normalEntry = log.find((e) => e.mode === 'normal');
    expect(nagEntry).toMatchObject({ event: 'Notification', nagger: 'started' });
    expect(normalEntry).toMatchObject({
      event: 'Notification',
      situation: 'notification',
      mode: 'normal',
    });
  });

  it('non-permission Notification does NOT start nagger', () => {
    handler('Notification', { notification_type: 'idle_prompt' });
    const log = readLog();
    const nagEntry = log.find((e) => e.mode === 'nagger');
    const normalEntry = log.find((e) => e.mode === 'normal');
    expect(nagEntry).toBeUndefined();
    expect(normalEntry).toMatchObject({
      event: 'Notification',
      situation: 'notification',
      mode: 'normal',
    });
  });

  it('resolves situation for SubagentStart', () => {
    handler('SubagentStart');
    const log = readLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      event: 'SubagentStart',
      situation: 'subagent-start',
      mode: 'normal',
    });
  });

  it('resolves situation for PostToolUseFailure', () => {
    handler('PostToolUseFailure');
    const log = readLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      event: 'PostToolUseFailure',
      situation: 'tool-failed',
      mode: 'normal',
    });
  });

  // ── Run actual registered commands ──

  it('registered hook commands from settings.json are valid and produce log entries', () => {
    const settingsPath = path.join(projectDir, '.claude', 'settings.local.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    const testedEvents: string[] = [];
    for (const [event, matchers] of Object.entries(settings.hooks)) {
      for (const matcher of matchers as any[]) {
        for (const hook of matcher.hooks) {
          if (hook.async) continue; // Skip async flag hooks — they need a transcript

          const stdin = JSON.stringify({ session_id: 'cmd-test', hook_event_name: event });
          const escaped = stdin.replace(/'/g, "'\\''");
          const cmd = `echo '${escaped}' | ${hook.command}`;

          try {
            execSync(cmd, {
              cwd: projectDir,
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'pipe'],
              timeout: 8000,
              env: { ...process.env, CLAUDE_PERSONA_LOG: logFile },
            });
          } catch {
            // Handler should never throw — exit 0 always
          }

          testedEvents.push(event);
        }
      }
    }

    expect(testedEvents.length).toBeGreaterThan(0);
    const log = readLog();
    // At least some events should have produced log entries
    expect(log.length).toBeGreaterThan(0);
    // Verify we tested the main events
    expect(testedEvents).toContain('Stop');
    expect(testedEvents).toContain('UserPromptSubmit');
  }, 60000);

  // ── Spam detection ──

  it('spam triggers after reaching threshold', () => {
    // Default threshold is 5 prompts within 10s window
    for (let i = 0; i < 5; i++) {
      handler('UserPromptSubmit');
    }

    const log = readLog();
    const spamEntries = log.filter((e) => e.mode === 'spam');
    expect(spamEntries.length).toBeGreaterThanOrEqual(1);
    expect(spamEntries[0]).toMatchObject({
      event: 'UserPromptSubmit',
      situation: 'spam-detected',
      mode: 'spam',
    });
  }, 60000);

  it('no spam when below threshold', () => {
    // 4 prompts is below the default threshold of 5
    for (let i = 0; i < 4; i++) {
      handler('UserPromptSubmit');
    }

    const log = readLog();
    const spamEntries = log.filter((e) => e.mode === 'spam');
    expect(spamEntries).toHaveLength(0);
  }, 30000);

  // ── Flag scanning ──

  it('flag scanning detects persona flag in transcript', () => {
    // Create a fake transcript JSONL with a flag in the assistant message
    const transcriptPath = path.join(projectDir, 'transcript.jsonl');
    const entry = {
      role: 'assistant',
      content: 'I found a bug in the code! <!-- persona:found-bug -->',
    };
    fs.writeFileSync(transcriptPath, JSON.stringify(entry) + '\n');

    handler('Stop', { transcript_path: transcriptPath }, '--flags');

    const log = readLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      event: 'Stop',
      flag: 'found-bug',
      situation: 'found-bug',
      mode: 'flag',
    });
  }, 15000);

  it('flag deduplication prevents replaying same flag', () => {
    const transcriptPath = path.join(projectDir, 'transcript.jsonl');
    const entry = {
      role: 'assistant',
      content: 'Found the bug <!-- persona:found-bug -->',
    };
    fs.writeFileSync(transcriptPath, JSON.stringify(entry) + '\n');

    // First invocation should detect the flag
    handler('Stop', { transcript_path: transcriptPath }, '--flags');
    // Second invocation on the same transcript should be deduped
    handler('Stop', { transcript_path: transcriptPath }, '--flags');

    const log = readLog();
    expect(log).toHaveLength(1); // Only one entry — second was deduped
  }, 20000);

  // ── Nagger lifecycle ──

  it('nagger state file created on permission Notification, deleted on UserPromptSubmit', () => {
    const sessionId = 'nag-lifecycle-test';
    const nagPath = path.join(os.tmpdir(), `claude-persona-nag-${sessionId}.json`);

    // Clean up any leftover from previous runs
    try { fs.unlinkSync(nagPath); } catch { /* ignore */ }

    // Permission notification should create nag state file
    handler('Notification', { session_id: sessionId, notification_type: 'permission_prompt' });
    expect(fs.existsSync(nagPath)).toBe(true);

    // UserPromptSubmit should cancel the nagger (delete state file)
    handler('UserPromptSubmit', { session_id: sessionId });
    expect(fs.existsSync(nagPath)).toBe(false);

    const log = readLog();
    const nagStarted = log.find((e) => e.nagger === 'started');
    const nagCancelled = log.find((e) => e.nagger === 'cancelled');
    expect(nagStarted).toBeDefined();
    expect(nagCancelled).toBeDefined();
  });

  // ── Bad config ──

  it('handler exits 0 with no log entry on bad config', () => {
    const cmd = `echo '{}' | node "${handlerPath}" --event Stop --config /nonexistent/active.json`;
    let exitCode = 0;
    try {
      execSync(cmd, {
        cwd: projectDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 8000,
        env: { ...process.env, CLAUDE_PERSONA_LOG: logFile },
      });
    } catch (err: any) {
      exitCode = err.status ?? 1;
    }

    expect(exitCode).toBe(0);
    const log = readLog();
    expect(log).toHaveLength(0);
  });

  it('handler exits 0 with no config arg', () => {
    const cmd = `echo '{}' | node "${handlerPath}" --event Stop`;
    let exitCode = 0;
    try {
      execSync(cmd, {
        cwd: projectDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 8000,
        env: { ...process.env, CLAUDE_PERSONA_LOG: logFile },
      });
    } catch (err: any) {
      exitCode = err.status ?? 1;
    }

    expect(exitCode).toBe(0);
    const log = readLog();
    expect(log).toHaveLength(0);
  });
});
