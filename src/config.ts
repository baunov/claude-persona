import fs from 'node:fs';
import path from 'node:path';
import type { ActiveConfig, PersonaConfig, Situation, TriggerType } from './types.js';

// ── Active config (active.json) ──

/** Load the active.json file that points to the current persona */
export function loadActiveConfig(configPath: string): ActiveConfig {
  const raw = fs.readFileSync(configPath, 'utf8');
  const config: ActiveConfig = JSON.parse(raw);

  if (!config.persona || typeof config.persona !== 'string') {
    throw new Error('active.json must have a "persona" string');
  }

  return config;
}

/** Write the active.json file */
export function writeActiveConfig(configPath: string, persona: string): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ persona }, null, 2) + '\n');
}

// ── Persona config (persona.json) ──

/** Load a persona.json from a persona directory */
export function loadPersonaConfig(personaDir: string): PersonaConfig {
  const configPath = path.join(personaDir, 'persona.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const config: PersonaConfig = JSON.parse(raw);

  if (!config.name || typeof config.name !== 'string') {
    throw new Error('persona.json must have a "name" string');
  }
  if (!Array.isArray(config.situations) || config.situations.length === 0) {
    throw new Error('persona.json must have a non-empty "situations" array');
  }

  return config;
}

// ── Path resolution ──

/** Resolve the persona directory from the config dir and persona name */
export function resolvePersonaDir(configDir: string, personaName: string): string {
  return path.join(configDir, 'personas', personaName);
}

/** Resolve the full path to a sound file within a persona directory */
export function resolveSoundPath(personaDir: string, soundFile: string): string {
  return path.join(personaDir, 'sounds', soundFile);
}

// ── Persona discovery ──

/** List bundled personas from the package's personas/ directory */
export function listBundledPersonas(packageRoot: string): PersonaConfig[] {
  const personasDir = path.join(packageRoot, 'personas');
  if (!fs.existsSync(personasDir)) return [];

  return fs.readdirSync(personasDir)
    .filter((name) => {
      const dir = path.join(personasDir, name);
      return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'persona.json'));
    })
    .map((name) => loadPersonaConfig(path.join(personasDir, name)));
}

/** List installed personas in the user's config directory */
export function listInstalledPersonas(configDir: string): PersonaConfig[] {
  const personasDir = path.join(configDir, 'personas');
  if (!fs.existsSync(personasDir)) return [];

  return fs.readdirSync(personasDir)
    .filter((name) => {
      const dir = path.join(personasDir, name);
      return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'persona.json'));
    })
    .map((name) => loadPersonaConfig(path.join(personasDir, name)));
}

// ── Situation queries ──

/** Get all situations that match a given trigger type */
export function getSituationsForTrigger(
  config: PersonaConfig,
  trigger: TriggerType,
): Situation[] {
  return config.situations.filter((s) => s.trigger === trigger);
}

/** Get a situation by name */
export function getSituationByName(
  config: PersonaConfig,
  name: string,
): Situation | undefined {
  return config.situations.find((s) => s.name === name);
}

/** Get all unique hook events that need to be registered */
export function getRequiredHookEvents(config: PersonaConfig): string[] {
  const events = new Set<string>();

  for (const situation of config.situations) {
    if (situation.trigger === 'flag') {
      events.add('Stop');
    } else if (situation.trigger === 'spam') {
      events.add('UserPromptSubmit');
    } else if (situation.trigger === 'permission_timeout') {
      events.add('Notification');
      events.add('UserPromptSubmit');
      events.add('SessionEnd');
    } else {
      events.add(situation.trigger);
    }
  }

  return [...events];
}

/** Check whether the config has any flag-type situations */
export function hasFlagSituations(config: PersonaConfig): boolean {
  return config.situations.some((s) => s.trigger === 'flag');
}

/** Check whether the config has a spam-type situation */
export function hasSpamSituation(config: PersonaConfig): boolean {
  return config.situations.some((s) => s.trigger === 'spam');
}

/** Check whether the config has a permission_timeout situation */
export function hasPermissionTimeoutSituation(config: PersonaConfig): boolean {
  return config.situations.some((s) => s.trigger === 'permission_timeout');
}

/** Get names of all flag-trigger situations */
export function getFlagNames(config: PersonaConfig): string[] {
  return config.situations
    .filter((s) => s.trigger === 'flag')
    .map((s) => s.name);
}
