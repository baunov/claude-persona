import fs from 'node:fs';
import path from 'node:path';
import type { ClaudePersonaConfig, Situation, TriggerType } from './types.js';

/** Load and validate a claude-persona.json config file */
export function loadConfig(configPath: string): ClaudePersonaConfig {
  const raw = fs.readFileSync(configPath, 'utf8');
  const config: ClaudePersonaConfig = JSON.parse(raw);

  if (!config.persona || typeof config.persona !== 'string') {
    throw new Error('Config must have a "persona" string');
  }
  if (!Array.isArray(config.situations) || config.situations.length === 0) {
    throw new Error('Config must have a non-empty "situations" array');
  }

  return config;
}

/** Resolve the full path to a sound file given the config location */
export function resolveSoundPath(
  configDir: string,
  persona: string,
  soundFile: string,
): string {
  return path.join(configDir, 'sounds', persona, soundFile);
}

/** Get all situations that match a given trigger type */
export function getSituationsForTrigger(
  config: ClaudePersonaConfig,
  trigger: TriggerType,
): Situation[] {
  return config.situations.filter((s) => s.trigger === trigger);
}

/** Get a situation by name */
export function getSituationByName(
  config: ClaudePersonaConfig,
  name: string,
): Situation | undefined {
  return config.situations.find((s) => s.name === name);
}

/** Get all unique hook events that need to be registered */
export function getRequiredHookEvents(config: ClaudePersonaConfig): string[] {
  const events = new Set<string>();

  for (const situation of config.situations) {
    if (situation.trigger === 'flag') {
      // Flag situations are detected on Stop hook
      events.add('Stop');
    } else if (situation.trigger === 'spam') {
      // Spam overrides UserPromptSubmit
      events.add('UserPromptSubmit');
    } else {
      events.add(situation.trigger);
    }
  }

  return [...events];
}

/** Check whether the config has any flag-type situations */
export function hasFlagSituations(config: ClaudePersonaConfig): boolean {
  return config.situations.some((s) => s.trigger === 'flag');
}

/** Check whether the config has a spam-type situation */
export function hasSpamSituation(config: ClaudePersonaConfig): boolean {
  return config.situations.some((s) => s.trigger === 'spam');
}

/** Get names of all flag-trigger situations (used as valid flag identifiers) */
export function getFlagNames(config: ClaudePersonaConfig): string[] {
  return config.situations
    .filter((s) => s.trigger === 'flag')
    .map((s) => s.name);
}
