import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/** Create an isolated temp directory for a test */
export function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claude-persona-test-'));
}

/** Remove a temp directory */
export function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Create a minimal valid persona directory */
export function createTestPersona(
  baseDir: string,
  name: string,
  config?: {
    description?: string;
    situations?: Array<{
      name: string;
      trigger: string;
      description: string;
      sounds: string[];
    }>;
  },
): string {
  const personaDir = path.join(baseDir, name);
  const soundsDir = path.join(personaDir, 'sounds');
  fs.mkdirSync(soundsDir, { recursive: true });

  const situations = config?.situations ?? [
    {
      name: 'task-complete',
      trigger: 'Stop',
      description: 'Task completed',
      sounds: ['done.mp3'],
    },
  ];

  // Create persona.json
  fs.writeFileSync(
    path.join(personaDir, 'persona.json'),
    JSON.stringify(
      {
        name,
        description: config?.description ?? `Test persona: ${name}`,
        situations,
      },
      null,
      2,
    ),
  );

  // Create empty sound files
  const soundNames = new Set<string>();
  for (const s of situations) {
    for (const sound of s.sounds) {
      soundNames.add(sound);
    }
  }
  for (const sound of soundNames) {
    fs.writeFileSync(path.join(soundsDir, sound), '');
  }

  return personaDir;
}

/** Create a full persona with flags and spam for comprehensive testing */
export function createFullPersona(baseDir: string, name = 'full-persona'): string {
  return createTestPersona(baseDir, name, {
    description: 'Full persona with all trigger types',
    situations: [
      { name: 'prompt-submitted', trigger: 'UserPromptSubmit', description: 'User sends a prompt', sounds: ['prompt.mp3'] },
      { name: 'task-complete', trigger: 'Stop', description: 'Claude finished', sounds: ['done.mp3', 'complete.mp3'] },
      { name: 'tool-failed', trigger: 'PostToolUseFailure', description: 'Tool failed', sounds: ['error.mp3'] },
      { name: 'session-start', trigger: 'SessionStart', description: 'Session started', sounds: ['start.mp3'] },
      { name: 'admitted-wrong', trigger: 'flag', description: 'Claude admits mistake', sounds: ['oops.mp3'] },
      { name: 'found-bug', trigger: 'flag', description: 'Claude found a bug', sounds: ['bug.mp3'] },
      { name: 'spam-detected', trigger: 'spam', description: 'User spamming', sounds: ['spam.mp3'] },
    ],
  });
}

/** Set up a complete installed structure (config dir with active.json + persona) */
export function setupInstalledConfig(
  configDir: string,
  personaName: string,
  personaConfig?: Parameters<typeof createTestPersona>[2],
): void {
  const personasDir = path.join(configDir, 'personas');
  fs.mkdirSync(personasDir, { recursive: true });

  createTestPersona(personasDir, personaName, personaConfig);

  fs.writeFileSync(
    path.join(configDir, 'active.json'),
    JSON.stringify({ persona: personaName }, null, 2) + '\n',
  );
}

/** Write a Claude settings.json file */
export function writeSettings(settingsPath: string, settings: Record<string, unknown> = {}): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

/** Read a JSON file */
export function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
