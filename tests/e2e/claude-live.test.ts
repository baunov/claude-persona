/**
 * Live Claude E2E tests — actually runs `claude -p` with hooks installed.
 *
 * Skipped unless CLAUDE_E2E=1 is set. Requires:
 *   - `claude` CLI installed and authenticated
 *   - API access (uses haiku, costs ~$0.01-0.05)
 *
 * Run: CLAUDE_E2E=1 npm run test:e2e:live
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createTempDir, cleanupTempDir } from '../helpers/fs-helpers.js';

const ROOT = path.resolve(__dirname, '../..');
const SKIP = !process.env.CLAUDE_E2E;

let projectDir: string;
let logFile: string;
let cliPath: string;

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

function readLog(): Array<Record<string, unknown>> {
  if (!fs.existsSync(logFile)) return [];
  return fs.readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe.skipIf(SKIP)('Live Claude E2E', () => {
  beforeAll(() => {
    // Verify claude CLI is available
    try {
      execSync('claude --version', { stdio: 'pipe' });
    } catch {
      throw new Error(
        'claude CLI not found. Install it to run live E2E tests: npm i -g @anthropic-ai/claude-code',
      );
    }

    execSync('npm run build', { cwd: ROOT, stdio: 'pipe' });
    cliPath = path.join(ROOT, 'dist/cli/index.js');

    projectDir = createTempDir();
    logFile = path.join(projectDir, 'persona.log');

    // Install peasant persona in the sandboxed project
    const { exitCode } = cli('init --project --persona peasant');
    expect(exitCode).toBe(0);
  });

  afterAll(() => {
    if (projectDir) cleanupTempDir(projectDir);
  });

  it('simple prompt triggers UserPromptSubmit and Stop hooks', () => {
    const cmd = [
      'claude',
      '-p', '"Say the word hello and nothing else"',
      '--model', 'haiku',
      '--max-budget-usd', '0.05',
      '--dangerously-skip-permissions',
      '--no-session-persistence',
    ].join(' ');

    execSync(cmd, {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
      env: { ...process.env, CLAUDE_PERSONA_LOG: logFile },
    });

    const log = readLog();
    const events = log.map((e) => e.event);

    expect(events).toContain('UserPromptSubmit');
    expect(events).toContain('Stop');
  }, 60000);
});
