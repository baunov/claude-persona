import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadActiveConfig,
  writeActiveConfig,
  loadPersonaConfig,
  resolvePersonaDir,
  resolveSoundPath,
  listBundledPersonas,
  listInstalledPersonas,
  getSituationsForTrigger,
  getSituationByName,
  getRequiredHookEvents,
  hasFlagSituations,
  hasSpamSituation,
  hasPermissionTimeoutSituation,
  getFlagNames,
} from '../../src/config.js';
import { createTempDir, cleanupTempDir, createTestPersona, createFullPersona } from '../helpers/fs-helpers.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = createTempDir();
});

afterEach(() => {
  cleanupTempDir(tmpDir);
});

// ── Active config ──

describe('loadActiveConfig', () => {
  it('loads a valid active.json', () => {
    const configPath = path.join(tmpDir, 'active.json');
    fs.writeFileSync(configPath, JSON.stringify({ persona: 'peasant' }));
    const config = loadActiveConfig(configPath);
    expect(config.persona).toBe('peasant');
  });

  it('throws if persona field missing', () => {
    const configPath = path.join(tmpDir, 'active.json');
    fs.writeFileSync(configPath, JSON.stringify({}));
    expect(() => loadActiveConfig(configPath)).toThrow();
  });

  it('throws if persona is not a string', () => {
    const configPath = path.join(tmpDir, 'active.json');
    fs.writeFileSync(configPath, JSON.stringify({ persona: 123 }));
    expect(() => loadActiveConfig(configPath)).toThrow();
  });

  it('throws if file does not exist', () => {
    expect(() => loadActiveConfig(path.join(tmpDir, 'nope.json'))).toThrow();
  });

  it('throws on invalid JSON', () => {
    const configPath = path.join(tmpDir, 'active.json');
    fs.writeFileSync(configPath, 'not json');
    expect(() => loadActiveConfig(configPath)).toThrow();
  });
});

describe('writeActiveConfig', () => {
  it('writes valid JSON with persona field', () => {
    const configPath = path.join(tmpDir, 'active.json');
    writeActiveConfig(configPath, 'peasant');
    const content = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(content).toEqual({ persona: 'peasant' });
  });

  it('creates parent directories if missing', () => {
    const configPath = path.join(tmpDir, 'deep', 'nested', 'active.json');
    writeActiveConfig(configPath, 'peasant');
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('file ends with newline', () => {
    const configPath = path.join(tmpDir, 'active.json');
    writeActiveConfig(configPath, 'peasant');
    const raw = fs.readFileSync(configPath, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
  });
});

// ── Persona config ──

describe('loadPersonaConfig', () => {
  it('loads a valid persona.json', () => {
    const personaDir = createTestPersona(tmpDir, 'test-persona');
    const config = loadPersonaConfig(personaDir);
    expect(config.name).toBe('test-persona');
    expect(config.situations.length).toBeGreaterThan(0);
  });

  it('throws if name is missing', () => {
    const personaDir = path.join(tmpDir, 'bad-persona');
    fs.mkdirSync(personaDir, { recursive: true });
    fs.writeFileSync(
      path.join(personaDir, 'persona.json'),
      JSON.stringify({ situations: [{ name: 'x', trigger: 'Stop', description: 'd', sounds: ['a.mp3'] }] }),
    );
    expect(() => loadPersonaConfig(personaDir)).toThrow('name');
  });

  it('throws if situations is empty', () => {
    const personaDir = path.join(tmpDir, 'empty-sit');
    fs.mkdirSync(personaDir, { recursive: true });
    fs.writeFileSync(
      path.join(personaDir, 'persona.json'),
      JSON.stringify({ name: 'test', situations: [] }),
    );
    expect(() => loadPersonaConfig(personaDir)).toThrow('situations');
  });

  it('throws if situations is not an array', () => {
    const personaDir = path.join(tmpDir, 'no-sit');
    fs.mkdirSync(personaDir, { recursive: true });
    fs.writeFileSync(
      path.join(personaDir, 'persona.json'),
      JSON.stringify({ name: 'test' }),
    );
    expect(() => loadPersonaConfig(personaDir)).toThrow('situations');
  });
});

// ── Path resolution ──

describe('resolvePersonaDir', () => {
  it('joins configDir and persona name', () => {
    expect(resolvePersonaDir('/config', 'peasant')).toBe(
      path.join('/config', 'personas', 'peasant'),
    );
  });
});

describe('resolveSoundPath', () => {
  it('joins personaDir, sounds, and filename', () => {
    expect(resolveSoundPath('/persona/peasant', 'done.mp3')).toBe(
      path.join('/persona/peasant', 'sounds', 'done.mp3'),
    );
  });
});

// ── Persona discovery ──

describe('listBundledPersonas', () => {
  it('returns configs for all valid persona dirs', () => {
    const personasDir = path.join(tmpDir, 'personas');
    fs.mkdirSync(personasDir, { recursive: true });
    createTestPersona(personasDir, 'alpha');
    createTestPersona(personasDir, 'beta');

    const personas = listBundledPersonas(tmpDir);
    expect(personas).toHaveLength(2);
    expect(personas.map((p) => p.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('returns empty array if personas/ does not exist', () => {
    expect(listBundledPersonas(tmpDir)).toEqual([]);
  });

  it('ignores directories without persona.json', () => {
    const personasDir = path.join(tmpDir, 'personas');
    fs.mkdirSync(path.join(personasDir, 'no-config'), { recursive: true });
    createTestPersona(personasDir, 'valid');

    const personas = listBundledPersonas(tmpDir);
    expect(personas).toHaveLength(1);
    expect(personas[0]!.name).toBe('valid');
  });
});

describe('listInstalledPersonas', () => {
  it('returns configs for installed personas', () => {
    const personasDir = path.join(tmpDir, 'personas');
    createTestPersona(personasDir, 'installed');

    const personas = listInstalledPersonas(tmpDir);
    expect(personas).toHaveLength(1);
    expect(personas[0]!.name).toBe('installed');
  });

  it('returns empty array if no personas/ dir', () => {
    expect(listInstalledPersonas(tmpDir)).toEqual([]);
  });
});

// ── Situation queries ──

describe('getSituationsForTrigger', () => {
  it('filters situations by trigger type', () => {
    const personaDir = createFullPersona(tmpDir);
    const config = loadPersonaConfig(personaDir);

    const stopSituations = getSituationsForTrigger(config, 'Stop');
    expect(stopSituations).toHaveLength(1);
    expect(stopSituations[0]!.name).toBe('task-complete');
  });

  it('returns empty array for no matches', () => {
    const personaDir = createTestPersona(tmpDir, 'simple');
    const config = loadPersonaConfig(path.join(tmpDir, 'simple'));

    const matches = getSituationsForTrigger(config, 'SessionEnd');
    expect(matches).toEqual([]);
  });

  it('returns multiple flag situations', () => {
    const personaDir = createFullPersona(tmpDir);
    const config = loadPersonaConfig(personaDir);

    const flagSituations = getSituationsForTrigger(config, 'flag');
    expect(flagSituations).toHaveLength(2);
  });
});

describe('getSituationByName', () => {
  it('finds a situation by name', () => {
    const personaDir = createFullPersona(tmpDir);
    const config = loadPersonaConfig(personaDir);

    const s = getSituationByName(config, 'task-complete');
    expect(s).toBeDefined();
    expect(s!.trigger).toBe('Stop');
  });

  it('returns undefined for unknown name', () => {
    const personaDir = createFullPersona(tmpDir);
    const config = loadPersonaConfig(personaDir);

    expect(getSituationByName(config, 'nonexistent')).toBeUndefined();
  });
});

describe('getRequiredHookEvents', () => {
  it('maps triggers to hook events', () => {
    const personaDir = createFullPersona(tmpDir);
    const config = loadPersonaConfig(personaDir);

    const events = getRequiredHookEvents(config);
    expect(events).toContain('UserPromptSubmit');
    expect(events).toContain('Stop');
    expect(events).toContain('PostToolUseFailure');
    expect(events).toContain('SessionStart');
  });

  it('maps flag trigger to Stop event', () => {
    const personaDir = createTestPersona(tmpDir, 'flag-only', {
      situations: [
        { name: 'my-flag', trigger: 'flag', description: 'A flag', sounds: ['a.mp3'] },
      ],
    });
    const config = loadPersonaConfig(path.join(tmpDir, 'flag-only'));

    const events = getRequiredHookEvents(config);
    expect(events).toContain('Stop');
    expect(events).not.toContain('flag');
  });

  it('maps spam trigger to UserPromptSubmit', () => {
    const personaDir = createTestPersona(tmpDir, 'spam-only', {
      situations: [
        { name: 'spam', trigger: 'spam', description: 'Spam', sounds: ['s.mp3'] },
      ],
    });
    const config = loadPersonaConfig(path.join(tmpDir, 'spam-only'));

    const events = getRequiredHookEvents(config);
    expect(events).toContain('UserPromptSubmit');
    expect(events).not.toContain('spam');
  });

  it('maps permission_timeout to Notification, UserPromptSubmit, and SessionEnd', () => {
    const personaDir = createTestPersona(tmpDir, 'nag-only', {
      situations: [
        { name: 'nag', trigger: 'permission_timeout', description: 'Nag', sounds: ['n.mp3'] },
      ],
    });
    const config = loadPersonaConfig(path.join(tmpDir, 'nag-only'));

    const events = getRequiredHookEvents(config);
    expect(events).toContain('Notification');
    expect(events).toContain('UserPromptSubmit');
    expect(events).toContain('SessionEnd');
    expect(events).not.toContain('permission_timeout');
  });

  it('deduplicates events', () => {
    const personaDir = createFullPersona(tmpDir);
    const config = loadPersonaConfig(personaDir);

    const events = getRequiredHookEvents(config);
    const unique = new Set(events);
    expect(events.length).toBe(unique.size);
  });
});

describe('hasFlagSituations', () => {
  it('returns true when flag situations exist', () => {
    const personaDir = createFullPersona(tmpDir);
    const config = loadPersonaConfig(personaDir);
    expect(hasFlagSituations(config)).toBe(true);
  });

  it('returns false when no flag situations', () => {
    const personaDir = createTestPersona(tmpDir, 'no-flags');
    const config = loadPersonaConfig(path.join(tmpDir, 'no-flags'));
    expect(hasFlagSituations(config)).toBe(false);
  });
});

describe('hasSpamSituation', () => {
  it('returns true when spam situation exists', () => {
    const personaDir = createFullPersona(tmpDir);
    const config = loadPersonaConfig(personaDir);
    expect(hasSpamSituation(config)).toBe(true);
  });

  it('returns false when no spam situation', () => {
    const personaDir = createTestPersona(tmpDir, 'no-spam');
    const config = loadPersonaConfig(path.join(tmpDir, 'no-spam'));
    expect(hasSpamSituation(config)).toBe(false);
  });
});

describe('hasPermissionTimeoutSituation', () => {
  it('returns true when permission_timeout situation exists', () => {
    const personaDir = createTestPersona(tmpDir, 'with-nag', {
      situations: [
        { name: 'nag', trigger: 'permission_timeout', description: 'Nag', sounds: ['n.mp3'] },
      ],
    });
    const config = loadPersonaConfig(path.join(tmpDir, 'with-nag'));
    expect(hasPermissionTimeoutSituation(config)).toBe(true);
  });

  it('returns false when no permission_timeout situation', () => {
    const personaDir = createTestPersona(tmpDir, 'no-nag');
    const config = loadPersonaConfig(path.join(tmpDir, 'no-nag'));
    expect(hasPermissionTimeoutSituation(config)).toBe(false);
  });
});

describe('getFlagNames', () => {
  it('returns names of flag situations', () => {
    const personaDir = createFullPersona(tmpDir);
    const config = loadPersonaConfig(personaDir);

    const names = getFlagNames(config);
    expect(names).toContain('admitted-wrong');
    expect(names).toContain('found-bug');
    expect(names).toHaveLength(2);
  });

  it('returns empty array for no flags', () => {
    const personaDir = createTestPersona(tmpDir, 'no-flags');
    const config = loadPersonaConfig(path.join(tmpDir, 'no-flags'));
    expect(getFlagNames(config)).toEqual([]);
  });
});
