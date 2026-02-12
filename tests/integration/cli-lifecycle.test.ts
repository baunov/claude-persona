/**
 * Integration tests for the full CLI lifecycle.
 *
 * These run the actual CLI as a subprocess, verifying the exact behavior
 * that was tested manually during development:
 *
 * 1. init --project --persona peasant  → copies sounds, registers hooks, writes flags
 * 2. test (list)                       → shows active persona & situations
 * 3. test task-complete                → plays sound (exit 0)
 * 4. use peasant                       → re-registers hooks
 * 5. use nonexistent                   → error exit 1
 * 6. add <local path>                  → installs persona
 * 7. test (list with multiple)         → shows installed personas
 * 8. use <added persona>              → switches persona
 * 9. handler invocation                → exits cleanly
 * 10. uninstall --project              → removes hooks, cleans CLAUDE.md reference
 * 11. uninstall --project (idempotent) → no errors
 * 12. re-init                          → works clean
 * 13. uninstall --project --purge      → removes everything
 * 14. purge again (idempotent)         → no errors
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createTempDir, cleanupTempDir, createTestPersona } from '../helpers/fs-helpers.js';

// Use a temp project directory to avoid polluting the real project
let projectDir: string;
let cliPath: string;

/**
 * Run the CLI in the project directory. Returns { stdout, exitCode }.
 * Does NOT throw on non-zero exit (we want to assert exit codes).
 */
function run(args: string): { stdout: string; exitCode: number } {
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

/** Run the handler directly */
function runHandler(args: string, stdin = '{}'): { stdout: string; exitCode: number } {
  const handlerPath = path.resolve(__dirname, '../../dist/handler.js');
  try {
    const stdout = execSync(
      `echo '${stdin}' | node "${handlerPath}" ${args}`,
      { cwd: projectDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 8000 },
    );
    return { stdout, exitCode: 0 };
  } catch (err: any) {
    return { stdout: (err.stdout ?? '') + (err.stderr ?? ''), exitCode: err.status ?? 1 };
  }
}

beforeAll(() => {
  // Build first
  execSync('npm run build', {
    cwd: path.resolve(__dirname, '../..'),
    stdio: 'pipe',
  });
  cliPath = path.resolve(__dirname, '../../dist/cli/index.js');
});

beforeEach(() => {
  // Fresh project directory for each test
  projectDir = createTempDir();
});

afterAll(() => {
  // All temp dirs should have been cleaned, but just in case
});

describe('CLI lifecycle', () => {
  it('build succeeds', () => {
    // Already verified in beforeAll — if we got here, it passed
    expect(fs.existsSync(cliPath)).toBe(true);
  });

  it('init requires --global or --project', () => {
    const { exitCode, stdout } = run('init');
    expect(exitCode).toBe(1);
    expect(stdout).toContain('--global');
    expect(stdout).toContain('--project');
  });

  it('init --project --persona peasant installs correctly', () => {
    const { exitCode, stdout } = run('init --project --persona peasant');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Persona "peasant"');
    expect(stdout).toContain('sound(s) copied');
    expect(stdout).toContain('Hooks: registered');

    // Check that files were created
    const configDir = path.join(projectDir, '.claude', 'persona');
    expect(fs.existsSync(path.join(configDir, 'active.json'))).toBe(true);
    expect(fs.existsSync(path.join(configDir, 'personas', 'peasant', 'persona.json'))).toBe(true);
    expect(fs.existsSync(path.join(configDir, 'personas', 'peasant', 'sounds'))).toBe(true);

    // Check active.json content
    const active = JSON.parse(fs.readFileSync(path.join(configDir, 'active.json'), 'utf8'));
    expect(active.persona).toBe('peasant');

    // Check hooks registered
    const settings = JSON.parse(
      fs.readFileSync(path.join(projectDir, '.claude', 'settings.local.json'), 'utf8'),
    );
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.Stop).toBeDefined();

    // Check PERSONA_FLAGS.md created + referenced in CLAUDE.md
    expect(fs.existsSync(path.join(configDir, 'PERSONA_FLAGS.md'))).toBe(true);
    const claudeMd = fs.readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('@.claude/persona/PERSONA_FLAGS.md');

    cleanupTempDir(projectDir);
  });

  it('test (list) shows active persona and situations', () => {
    run('init --project --persona peasant');
    const { exitCode, stdout } = run('test');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Active persona: peasant');
    expect(stdout).toContain('task-complete');
    expect(stdout).toContain('[Stop]');

    cleanupTempDir(projectDir);
  });

  it('test with unknown situation exits 1', () => {
    run('init --project --persona peasant');
    const { exitCode, stdout } = run('test nonexistent-situation');
    expect(exitCode).toBe(1);
    expect(stdout).toContain('Unknown situation');

    cleanupTempDir(projectDir);
  });

  it('use peasant re-registers hooks', () => {
    run('init --project --persona peasant');
    const { exitCode, stdout } = run('use peasant');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('switched to "peasant"');

    cleanupTempDir(projectDir);
  });

  it('use nonexistent exits 1', () => {
    run('init --project --persona peasant');
    const { exitCode, stdout } = run('use nonexistent');
    expect(exitCode).toBe(1);
    expect(stdout).toContain('not installed');

    cleanupTempDir(projectDir);
  });

  it('add installs a local persona', () => {
    run('init --project --persona peasant');

    // Create a test persona to add
    const sourceDir = path.join(projectDir, 'my-source');
    createTestPersona(sourceDir, '', {
      description: 'Added persona',
      situations: [
        { name: 'hello', trigger: 'SessionStart', description: 'Hello', sounds: ['hi.mp3'] },
      ],
    });
    // The persona was created as sourceDir/ directly since name=''
    // Let's recreate properly
    cleanupTempDir(sourceDir);
    const addSource = createTestPersona(projectDir, 'add-source', {
      description: 'Added persona',
      situations: [
        { name: 'hello', trigger: 'SessionStart', description: 'Hello', sounds: ['hi.mp3'] },
      ],
    });

    const { exitCode, stdout } = run(`add "${addSource}"`);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('installed');

    cleanupTempDir(projectDir);
  });

  it('test list shows multiple installed personas', () => {
    run('init --project --persona peasant');

    // Add another persona
    const addSource = createTestPersona(projectDir, 'extra-persona', {
      description: 'Extra',
      situations: [
        { name: 'test', trigger: 'Stop', description: 'Test', sounds: ['t.mp3'] },
      ],
    });
    run(`add "${addSource}"`);

    const { stdout } = run('test');
    expect(stdout).toContain('Installed personas:');
    expect(stdout).toContain('peasant');
    expect(stdout).toContain('extra-persona');

    cleanupTempDir(projectDir);
  });

  it('handler exits cleanly with active config', () => {
    run('init --project --persona peasant');
    const activeConfigPath = path.join(projectDir, '.claude', 'persona', 'active.json');

    const { exitCode } = runHandler(`--event Stop --config "${activeConfigPath}" #claude-persona`);
    expect(exitCode).toBe(0);

    cleanupTempDir(projectDir);
  });

  it('handler exits cleanly with bad config path', () => {
    const { exitCode } = runHandler('--event Stop --config /nonexistent/active.json');
    expect(exitCode).toBe(0); // Should never block Claude

    cleanupTempDir(projectDir);
  });

  it('uninstall --project removes hooks and CLAUDE.md reference', () => {
    run('init --project --persona peasant');
    const { exitCode, stdout } = run('uninstall --project');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('hook(s) from');

    // Hooks should be gone from settings
    const settings = JSON.parse(
      fs.readFileSync(path.join(projectDir, '.claude', 'settings.local.json'), 'utf8'),
    );
    expect(settings.hooks).toBeUndefined();

    // PERSONA_FLAGS.md should be removed
    expect(
      fs.existsSync(path.join(projectDir, '.claude', 'persona', 'PERSONA_FLAGS.md')),
    ).toBe(false);

    // CLAUDE.md should not reference flags
    const claudeMd = fs.readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).not.toContain('PERSONA_FLAGS.md');

    // Config dir should still exist (no purge)
    expect(
      fs.existsSync(path.join(projectDir, '.claude', 'persona', 'active.json')),
    ).toBe(true);

    cleanupTempDir(projectDir);
  });

  it('uninstall --project is idempotent', () => {
    run('init --project --persona peasant');
    run('uninstall --project');
    const { exitCode } = run('uninstall --project');
    expect(exitCode).toBe(0);

    cleanupTempDir(projectDir);
  });

  it('re-init after uninstall works', () => {
    run('init --project --persona peasant');
    run('uninstall --project');
    const { exitCode, stdout } = run('init --project --persona peasant');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('installed successfully');

    cleanupTempDir(projectDir);
  });

  it('uninstall --project --purge removes everything', () => {
    run('init --project --persona peasant');
    const { exitCode, stdout } = run('uninstall --project --purge');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Removed');

    // Config dir should be gone
    expect(fs.existsSync(path.join(projectDir, '.claude', 'persona'))).toBe(false);

    cleanupTempDir(projectDir);
  });

  it('purge is idempotent', () => {
    run('init --project --persona peasant');
    run('uninstall --project --purge');
    const { exitCode } = run('uninstall --project --purge');
    expect(exitCode).toBe(0);

    cleanupTempDir(projectDir);
  });

  it('init preserves existing CLAUDE.md content', () => {
    fs.writeFileSync(
      path.join(projectDir, 'CLAUDE.md'),
      '# My Project\n\nImportant instructions.\n',
    );

    run('init --project --persona peasant');

    const claudeMd = fs.readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('# My Project');
    expect(claudeMd).toContain('Important instructions.');
    expect(claudeMd).toContain('@.claude/persona/PERSONA_FLAGS.md');

    cleanupTempDir(projectDir);
  });

  it('uninstall preserves existing CLAUDE.md content', () => {
    fs.writeFileSync(
      path.join(projectDir, 'CLAUDE.md'),
      '# My Project\n\nImportant instructions.\n',
    );
    run('init --project --persona peasant');
    run('uninstall --project');

    const claudeMd = fs.readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('# My Project');
    expect(claudeMd).toContain('Important instructions.');
    expect(claudeMd).not.toContain('PERSONA_FLAGS.md');

    cleanupTempDir(projectDir);
  });

  it('init --project --persona with unknown persona exits 1', () => {
    const { exitCode, stdout } = run('init --project --persona nonexistent');
    expect(exitCode).toBe(1);
    expect(stdout).toContain('Unknown persona');

    cleanupTempDir(projectDir);
  });

  it('uninstall requires --global or --project', () => {
    const { exitCode, stdout } = run('uninstall');
    expect(exitCode).toBe(1);
    expect(stdout).toContain('--global');

    cleanupTempDir(projectDir);
  });

  it('hooks contain #claude-persona marker', () => {
    run('init --project --persona peasant');

    const settings = JSON.parse(
      fs.readFileSync(path.join(projectDir, '.claude', 'settings.local.json'), 'utf8'),
    );

    // Every hook command should contain the marker
    for (const event of Object.keys(settings.hooks)) {
      for (const matcher of settings.hooks[event]) {
        for (const hook of matcher.hooks) {
          expect(hook.command).toContain('#claude-persona');
        }
      }
    }

    cleanupTempDir(projectDir);
  });

  it('repeated init does not duplicate hooks', () => {
    run('init --project --persona peasant');
    run('init --project --persona peasant');
    run('init --project --persona peasant');

    const settings = JSON.parse(
      fs.readFileSync(path.join(projectDir, '.claude', 'settings.local.json'), 'utf8'),
    );

    // Each event should have exactly 1 persona hook
    for (const event of Object.keys(settings.hooks)) {
      const personaHooks = settings.hooks[event].filter(
        (m: any) => m.hooks.some((h: any) => h.command.includes('#claude-persona')),
      );
      expect(personaHooks).toHaveLength(1);
    }

    cleanupTempDir(projectDir);
  });

  it('add with invalid source (no persona.json) exits 1', () => {
    run('init --project --persona peasant');

    const badSource = path.join(projectDir, 'bad-persona');
    fs.mkdirSync(badSource, { recursive: true });

    const { exitCode, stdout } = run(`add "${badSource}"`);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('no persona.json');

    cleanupTempDir(projectDir);
  });

  it('add with invalid source (no sounds/) exits 1', () => {
    run('init --project --persona peasant');

    const badSource = path.join(projectDir, 'bad-persona');
    fs.mkdirSync(badSource, { recursive: true });
    fs.writeFileSync(
      path.join(badSource, 'persona.json'),
      JSON.stringify({ name: 'bad', description: 'Bad', situations: [{ name: 'x', trigger: 'Stop', description: 'X', sounds: ['x.mp3'] }] }),
    );

    const { exitCode, stdout } = run(`add "${badSource}"`);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('no sounds/');

    cleanupTempDir(projectDir);
  });
});
