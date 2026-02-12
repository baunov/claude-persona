import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getTargetPaths,
  findConfigDir,
  detectMode,
  copyPersonaDir,
  registerHooks,
  updateClaudeMdFlags,
  removeClaudeMdReference,
} from '../../src/cli/shared.js';
import { loadPersonaConfig } from '../../src/config.js';
import {
  createTempDir,
  cleanupTempDir,
  createTestPersona,
  createFullPersona,
  setupInstalledConfig,
  writeSettings,
  readJson,
} from '../helpers/fs-helpers.js';
import type { ClaudeSettings } from '../../src/types.js';

let tmpDir: string;
let origCwd: string;

beforeEach(() => {
  // Use fs.realpathSync to resolve symlinks (macOS: /var -> /private/var)
  tmpDir = fs.realpathSync(createTempDir());
  origCwd = process.cwd();
});

afterEach(() => {
  process.chdir(origCwd);
  cleanupTempDir(tmpDir);
});

// ── getTargetPaths ──

describe('getTargetPaths', () => {
  it('returns global paths', () => {
    const result = getTargetPaths('global');
    expect(result.targetDir).toBe(path.join(os.homedir(), '.claude-persona'));
    expect(result.settingsPath).toBe(path.join(os.homedir(), '.claude', 'settings.json'));
    expect(result.activeConfigPath).toContain('active.json');
  });

  it('returns project paths relative to cwd', () => {
    process.chdir(tmpDir);
    const result = getTargetPaths('project');
    expect(result.targetDir).toBe(path.join(tmpDir, '.claude', 'persona'));
    expect(result.settingsPath).toBe(path.join(tmpDir, '.claude', 'settings.local.json'));
    expect(result.activeConfigPath).toContain('active.json');
  });
});

// ── findConfigDir ──

describe('findConfigDir', () => {
  it('returns project dir when active.json exists', () => {
    process.chdir(tmpDir);
    const projectDir = path.join(tmpDir, '.claude', 'persona');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'active.json'), '{}');

    expect(findConfigDir()).toBe(projectDir);
  });

  it('returns null when no config exists', () => {
    process.chdir(tmpDir);
    // Mock homedir so the global fallback doesn't find the real ~/.claude-persona
    vi.spyOn(os, 'homedir').mockReturnValue(tmpDir);
    expect(findConfigDir()).toBeNull();
    vi.restoreAllMocks();
  });
});

// ── detectMode ──

describe('detectMode', () => {
  it('returns global for homedir path', () => {
    const globalDir = path.join(os.homedir(), '.claude-persona');
    expect(detectMode(globalDir)).toBe('global');
  });

  it('returns project for other paths', () => {
    expect(detectMode('/some/project/.claude/persona')).toBe('project');
  });
});

// ── copyPersonaDir ──

describe('copyPersonaDir', () => {
  it('copies persona.json and sound files', () => {
    const sourceDir = createTestPersona(tmpDir, 'source', {
      situations: [
        { name: 'test', trigger: 'Stop', description: 'Test', sounds: ['a.mp3', 'b.wav'] },
      ],
    });
    const targetDir = path.join(tmpDir, 'target');

    const copied = copyPersonaDir(sourceDir, targetDir);

    expect(copied).toBe(2);
    expect(fs.existsSync(path.join(targetDir, 'persona.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'sounds', 'a.mp3'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'sounds', 'b.wav'))).toBe(true);
  });

  it('does not overwrite existing sound files', () => {
    const sourceDir = createTestPersona(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'target', 'sounds');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'done.mp3'), 'existing content');

    const parentTarget = path.join(tmpDir, 'target');
    const copied = copyPersonaDir(sourceDir, parentTarget);

    expect(copied).toBe(0); // File already existed
    expect(fs.readFileSync(path.join(targetDir, 'done.mp3'), 'utf8')).toBe('existing content');
  });

  it('creates target directories', () => {
    const sourceDir = createTestPersona(tmpDir, 'source');
    const targetDir = path.join(tmpDir, 'deep', 'nested', 'target');

    copyPersonaDir(sourceDir, targetDir);
    expect(fs.existsSync(path.join(targetDir, 'persona.json'))).toBe(true);
  });
});

// ── registerHooks ──

describe('registerHooks', () => {
  it('registers hooks in a new settings file', () => {
    const personaDir = createTestPersona(tmpDir, 'test');
    const config = loadPersonaConfig(path.join(tmpDir, 'test'));
    const settingsPath = path.join(tmpDir, 'settings.json');
    const handlerPath = '/path/to/handler.js';
    const activeConfigPath = '/path/to/active.json';

    registerHooks(config, settingsPath, handlerPath, activeConfigPath);

    const settings = readJson(settingsPath) as ClaudeSettings;
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks!['Stop']).toHaveLength(1);
    expect(settings.hooks!['Stop']![0]!.hooks[0]!.command).toContain('#claude-persona');
  });

  it('preserves existing non-persona hooks', () => {
    const personaDir = createTestPersona(tmpDir, 'test');
    const config = loadPersonaConfig(path.join(tmpDir, 'test'));
    const settingsPath = path.join(tmpDir, 'settings.json');

    writeSettings(settingsPath, {
      hooks: {
        Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo other' }] }],
      },
    });

    registerHooks(config, settingsPath, '/handler.js', '/active.json');

    const settings = readJson(settingsPath) as ClaudeSettings;
    expect(settings.hooks!['Stop']).toHaveLength(2); // other + persona
    expect(settings.hooks!['Stop']![0]!.hooks[0]!.command).toBe('echo other');
  });

  it('removes old persona hooks before adding new ones', () => {
    const personaDir = createTestPersona(tmpDir, 'test');
    const config = loadPersonaConfig(path.join(tmpDir, 'test'));
    const settingsPath = path.join(tmpDir, 'settings.json');

    // Register once
    registerHooks(config, settingsPath, '/handler.js', '/active.json');
    // Register again
    registerHooks(config, settingsPath, '/handler.js', '/active.json');

    const settings = readJson(settingsPath) as ClaudeSettings;
    // Should have exactly 1 persona hook, not 2
    expect(settings.hooks!['Stop']).toHaveLength(1);
  });

  it('adds async flag hook for Stop event when persona has flags', () => {
    const personaDir = createFullPersona(tmpDir);
    const config = loadPersonaConfig(personaDir);
    const settingsPath = path.join(tmpDir, 'settings.json');

    registerHooks(config, settingsPath, '/handler.js', '/active.json');

    const settings = readJson(settingsPath) as ClaudeSettings;
    const stopHooks = settings.hooks!['Stop']![0]!.hooks;
    expect(stopHooks).toHaveLength(2); // normal + async flags
    expect(stopHooks[1]!.command).toContain('--flags');
    expect(stopHooks[1]!.async).toBe(true);
  });

  it('cleans up events no longer needed', () => {
    // First install with SessionStart
    const settingsPath = path.join(tmpDir, 'settings.json');

    const fullPersonaDir = createFullPersona(tmpDir);
    const fullConfig = loadPersonaConfig(fullPersonaDir);
    registerHooks(fullConfig, settingsPath, '/handler.js', '/active.json');

    // Now re-register with simple persona (no SessionStart)
    const simpleDir = createTestPersona(path.join(tmpDir, 'personas'), 'simple');
    const simpleConfig = loadPersonaConfig(simpleDir);
    registerHooks(simpleConfig, settingsPath, '/handler.js', '/active.json');

    const settings = readJson(settingsPath) as ClaudeSettings;
    expect(settings.hooks!['SessionStart']).toBeUndefined();
  });

  it('handles corrupt settings file gracefully', () => {
    const settingsPath = path.join(tmpDir, 'settings.json');
    fs.writeFileSync(settingsPath, 'not json');

    const personaDir = createTestPersona(tmpDir, 'test');
    const config = loadPersonaConfig(path.join(tmpDir, 'test'));

    // Should not throw
    registerHooks(config, settingsPath, '/handler.js', '/active.json');

    const settings = readJson(settingsPath) as ClaudeSettings;
    expect(settings.hooks).toBeDefined();
  });
});

// ── updateClaudeMdFlags ──

describe('updateClaudeMdFlags', () => {
  it('writes standalone PERSONA_FLAGS.md and adds reference to CLAUDE.md', () => {
    process.chdir(tmpDir);
    const configDir = path.join(tmpDir, '.claude', 'persona');
    fs.mkdirSync(configDir, { recursive: true });

    const personaDir = createFullPersona(tmpDir);
    const config = loadPersonaConfig(personaDir);
    updateClaudeMdFlags(config);

    // Check standalone file
    const flagsPath = path.join(configDir, 'PERSONA_FLAGS.md');
    expect(fs.existsSync(flagsPath)).toBe(true);
    const flagsContent = fs.readFileSync(flagsPath, 'utf8');
    expect(flagsContent).toContain('persona:admitted-wrong');
    expect(flagsContent).toContain('persona:found-bug');

    // Check CLAUDE.md reference
    const claudeMd = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('@.claude/persona/PERSONA_FLAGS.md');
  });

  it('does not duplicate reference on repeated calls', () => {
    process.chdir(tmpDir);
    const configDir = path.join(tmpDir, '.claude', 'persona');
    fs.mkdirSync(configDir, { recursive: true });

    const personaDir = createFullPersona(tmpDir);
    const config = loadPersonaConfig(personaDir);
    updateClaudeMdFlags(config);
    updateClaudeMdFlags(config);
    updateClaudeMdFlags(config);

    const claudeMd = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    const matches = claudeMd.match(/@\.claude\/persona\/PERSONA_FLAGS\.md/g);
    expect(matches).toHaveLength(1);
  });

  it('preserves existing CLAUDE.md content', () => {
    process.chdir(tmpDir);
    const configDir = path.join(tmpDir, '.claude', 'persona');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# My Project\n\nImportant stuff.\n');

    const personaDir = createFullPersona(tmpDir);
    const config = loadPersonaConfig(personaDir);
    updateClaudeMdFlags(config);

    const claudeMd = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('# My Project');
    expect(claudeMd).toContain('Important stuff.');
    expect(claudeMd).toContain('@.claude/persona/PERSONA_FLAGS.md');
  });

  it('removes flags file and reference when no flag situations', () => {
    process.chdir(tmpDir);
    const configDir = path.join(tmpDir, '.claude', 'persona');
    fs.mkdirSync(configDir, { recursive: true });

    // First install with flags
    const fullDir = createFullPersona(tmpDir);
    const fullConfig = loadPersonaConfig(fullDir);
    updateClaudeMdFlags(fullConfig);
    expect(fs.existsSync(path.join(configDir, 'PERSONA_FLAGS.md'))).toBe(true);

    // Now switch to persona without flags
    const simpleDir = createTestPersona(path.join(tmpDir, 'personas'), 'simple');
    const simpleConfig = loadPersonaConfig(simpleDir);
    updateClaudeMdFlags(simpleConfig);

    expect(fs.existsSync(path.join(configDir, 'PERSONA_FLAGS.md'))).toBe(false);
    const claudeMd = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).not.toContain('PERSONA_FLAGS.md');
  });
});

// ── removeClaudeMdReference ──

describe('removeClaudeMdReference', () => {
  it('removes the reference line from CLAUDE.md', () => {
    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, '# My Project\n\n@.claude/persona/PERSONA_FLAGS.md\n');

    removeClaudeMdReference(claudeMdPath);

    const content = fs.readFileSync(claudeMdPath, 'utf8');
    expect(content).not.toContain('PERSONA_FLAGS.md');
    expect(content).toContain('# My Project');
  });

  it('does nothing if reference not present', () => {
    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, '# My Project\n');

    removeClaudeMdReference(claudeMdPath);

    const content = fs.readFileSync(claudeMdPath, 'utf8');
    expect(content).toContain('# My Project');
  });

  it('does nothing if CLAUDE.md does not exist', () => {
    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
    // Should not throw
    removeClaudeMdReference(claudeMdPath);
  });

  it('handles file becoming empty after removal', () => {
    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, '@.claude/persona/PERSONA_FLAGS.md\n');

    removeClaudeMdReference(claudeMdPath);

    const content = fs.readFileSync(claudeMdPath, 'utf8');
    expect(content).toBe('');
  });

  it('is idempotent — running twice is safe', () => {
    const claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, '# My Project\n\n@.claude/persona/PERSONA_FLAGS.md\n');

    removeClaudeMdReference(claudeMdPath);
    removeClaudeMdReference(claudeMdPath);

    const content = fs.readFileSync(claudeMdPath, 'utf8');
    expect(content).toContain('# My Project');
    expect(content).not.toContain('PERSONA_FLAGS.md');
  });
});
