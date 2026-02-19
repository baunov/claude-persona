import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadPersonaConfig,
  resolvePersonaDir,
  getRequiredHookEvents,
  hasFlagSituations,
  writeActiveConfig,
} from '../config.js';
import type { ClaudeSettings, ClaudeHookMatcher, PersonaConfig } from '../types.js';

/** Locate the package root (where personas/ lives) */
export function getPackageRoot(): string {
  return path.resolve(new URL('..', import.meta.url).pathname, '..');
}

/** Get target dir and settings path based on mode */
export function getTargetPaths(mode: 'global' | 'project'): {
  targetDir: string;
  settingsPath: string;
  activeConfigPath: string;
} {
  if (mode === 'global') {
    const targetDir = path.join(os.homedir(), '.claude-persona');
    return {
      targetDir,
      settingsPath: path.join(os.homedir(), '.claude', 'settings.json'),
      activeConfigPath: path.join(targetDir, 'active.json'),
    };
  } else {
    const targetDir = path.join(process.cwd(), '.claude', 'persona');
    return {
      targetDir,
      settingsPath: path.join(process.cwd(), '.claude', 'settings.local.json'),
      activeConfigPath: path.join(targetDir, 'active.json'),
    };
  }
}

/** Find installed config dir: explicit > project > global */
export function findConfigDir(): string | null {
  const projectDir = path.join(process.cwd(), '.claude', 'persona');
  if (fs.existsSync(path.join(projectDir, 'active.json'))) return projectDir;

  const globalDir = path.join(os.homedir(), '.claude-persona');
  if (fs.existsSync(path.join(globalDir, 'active.json'))) return globalDir;

  return null;
}

/** Detect whether a config dir is global or project */
export function detectMode(configDir: string): 'global' | 'project' {
  const globalDir = path.join(os.homedir(), '.claude-persona');
  return configDir === globalDir ? 'global' : 'project';
}

/** Copy a persona directory (persona.json + sounds/) to a target location */
export function copyPersonaDir(sourceDir: string, targetDir: string): number {
  // Copy persona.json
  const sourceConfig = path.join(sourceDir, 'persona.json');
  const targetConfig = path.join(targetDir, 'persona.json');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(sourceConfig, targetConfig);

  // Copy sounds
  const sourceSounds = path.join(sourceDir, 'sounds');
  const targetSounds = path.join(targetDir, 'sounds');
  fs.mkdirSync(targetSounds, { recursive: true });

  let copied = 0;
  if (fs.existsSync(sourceSounds)) {
    for (const file of fs.readdirSync(sourceSounds)) {
      const targetFile = path.join(targetSounds, file);
      if (!fs.existsSync(targetFile)) {
        fs.copyFileSync(path.join(sourceSounds, file), targetFile);
        copied++;
      }
    }
  }

  return copied;
}

/** Register hooks in Claude Code settings for a persona */
export function registerHooks(
  personaConfig: PersonaConfig,
  settingsPath: string,
  handlerPath: string,
  activeConfigPath: string,
): void {
  let settings: ClaudeSettings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      // Start fresh if corrupt
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const requiredEvents = getRequiredHookEvents(personaConfig);
  const hasFlags = hasFlagSituations(personaConfig);
  // The marker tag is embedded in every command so we can reliably identify
  // claude-persona hooks regardless of install path
  const marker = '#claude-persona';
  const handlerCmd = (event: string, extra = '') =>
    `node "${handlerPath}" --event ${event} --config "${activeConfigPath}"${extra} ${marker}`;

  for (const event of requiredEvents) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    // Remove existing claude-persona hooks
    settings.hooks[event] = settings.hooks[event]!.filter(
      (m) => !m.hooks.some((h) => h.command.includes(marker)),
    );

    const hookEntries: ClaudeHookMatcher = {
      matcher: '',
      hooks: [{ type: 'command', command: handlerCmd(event) }],
    };

    if (event === 'Stop' && hasFlags) {
      hookEntries.hooks.push({
        type: 'command',
        command: handlerCmd(event, ' --flags'),
        async: true,
      });
    }

    settings.hooks[event]!.push(hookEntries);
  }

  // Remove claude-persona hooks from events no longer needed
  for (const event of Object.keys(settings.hooks)) {
    if (!requiredEvents.includes(event)) {
      settings.hooks[event] = settings.hooks[event]!.filter(
        (m) => !m.hooks.some((h) => h.command.includes(marker)),
      );
      if (settings.hooks[event]!.length === 0) {
        delete settings.hooks[event];
      }
    }
  }

  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`  Hooks: registered in ${settingsPath}`);
}

/** Reference lines for project-mode CLAUDE.md @imports */
const PERSONA_MD_REFERENCE = '@.claude/persona/PERSONA.md';
const FLAGS_MD_REFERENCE = '@.claude/persona/PERSONA_FLAGS.md';

/** Reference lines for global-mode CLAUDE.md @imports (absolute home path) */
const GLOBAL_PERSONA_MD_REFERENCE = '@~/.claude-persona/PERSONA.md';
const GLOBAL_FLAGS_MD_REFERENCE = '@~/.claude-persona/PERSONA_FLAGS.md';

// Keep the old reference string so we can clean it up from existing installs
const LEGACY_FLAGS_REFERENCE = '@.claude/persona/PERSONA_FLAGS.md';

/** Section markers for the persona block in CLAUDE.md */
const PERSONA_SECTION_START = '<!-- claude-persona:start -->';
const PERSONA_SECTION_END = '<!-- claude-persona:end -->';
const PERSONA_SECTION_HEADER = '## Always reference and use these as speaking guide';

/** All persona-related references (for cleanup during uninstall) */
export const ALL_PERSONA_REFERENCES = [
  PERSONA_MD_REFERENCE,
  FLAGS_MD_REFERENCE,
  GLOBAL_PERSONA_MD_REFERENCE,
  GLOBAL_FLAGS_MD_REFERENCE,
  LEGACY_FLAGS_REFERENCE,
  PERSONA_SECTION_START,
  PERSONA_SECTION_END,
  PERSONA_SECTION_HEADER,
];

/**
 * Write persona instructions to standalone files and reference them from CLAUDE.md.
 *
 * Generates up to two files:
 * - PERSONA.md — personality, speaking style, and per-situation speeches
 * - PERSONA_FLAGS.md — flag detection instructions table
 *
 * For project mode: writes to .claude/persona/, references from ./CLAUDE.md
 * For global mode: writes to ~/.claude-persona/, references from ~/.claude/CLAUDE.md
 */
export function updateClaudeMdFlags(config: PersonaConfig, mode: 'global' | 'project'): void {
  let targetDir: string;
  let claudeMdPath: string;
  let personaMdRef: string;
  let flagsMdRef: string;

  if (mode === 'global') {
    targetDir = path.join(os.homedir(), '.claude-persona');
    claudeMdPath = path.join(os.homedir(), '.claude', 'CLAUDE.md');
    personaMdRef = GLOBAL_PERSONA_MD_REFERENCE;
    flagsMdRef = GLOBAL_FLAGS_MD_REFERENCE;
  } else {
    targetDir = path.join(process.cwd(), '.claude', 'persona');
    claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
    personaMdRef = PERSONA_MD_REFERENCE;
    flagsMdRef = FLAGS_MD_REFERENCE;
  }

  const personaFilePath = path.join(targetDir, 'PERSONA.md');
  const flagsFilePath = path.join(targetDir, 'PERSONA_FLAGS.md');

  const flagSituations = config.situations.filter((s) => s.trigger === 'flag');
  const situationsWithSpeech = config.situations.filter(
    (s) => s.speech && s.speech.length > 0,
  );
  const hasPersonality = !!config.personality;
  const hasSpeech = situationsWithSpeech.length > 0;
  const hasFlags = flagSituations.length > 0;
  const hasPersonaContent = hasPersonality || hasSpeech;

  fs.mkdirSync(targetDir, { recursive: true });

  // ── PERSONA.md ──
  if (hasPersonaContent) {
    let content = `# Persona: ${config.name}\n\n`;

    if (hasPersonality) {
      content += `## Speaking Style\n\n${config.personality}\n\n`;
    }

    if (hasSpeech) {
      content += `## Situational Speeches\n\n`;
      content += `When a situation below occurs, optionally weave one of the short in-character lines into your response. Pick one at random — don't repeat the same line back-to-back. These are flavor, not mandatory; skip if it would feel forced.\n\n`;

      for (const sit of situationsWithSpeech) {
        const lines = sit.speech!.map((l) => `- "${l}"`).join('\n');
        content += `### ${sit.name}\n_${sit.description}_\n${lines}\n\n`;
      }
    }

    fs.writeFileSync(personaFilePath, content);
    console.log('  Persona instructions: written to PERSONA.md');
  } else {
    if (fs.existsSync(personaFilePath)) {
      fs.unlinkSync(personaFilePath);
    }
  }

  // ── PERSONA_FLAGS.md ──
  if (hasFlags) {
    const rows = flagSituations
      .map((s) => `| \`<!-- persona:${s.name} -->\` | ${s.description} |`)
      .join('\n');

    const flagsContent = `# Persona Flags

When a situation below applies, include the corresponding HTML comment flag **at the very end** of your text output. The hook system will detect it and play the appropriate sound.

Flags can match your own response (e.g. you admitted a mistake) **or** the user's input (e.g. the user sounds frustrated or grateful). Read the user's latest message and your own reply to decide which flag fits best.

| Flag | When to use |
|---|---|
${rows}

Rules:
- Only include ONE flag per response, at the very end
- Only use when the situation genuinely applies — don't force it
- Detecting user sentiment: look for emotional cues in the user's message (frustration, gratitude, excitement, etc.)
- The flag is invisible to markdown renderers but the hook script reads it from the transcript
`;

    fs.writeFileSync(flagsFilePath, flagsContent);
    console.log('  Persona flags: written to PERSONA_FLAGS.md');
  } else {
    if (fs.existsSync(flagsFilePath)) {
      fs.unlinkSync(flagsFilePath);
    }
  }
}

/** Add an @import reference line to CLAUDE.md */
function addClaudeMdReference(claudeMdPath: string, reference: string): void {
  let content = '';
  if (fs.existsSync(claudeMdPath)) {
    content = fs.readFileSync(claudeMdPath, 'utf8');
  }

  // Already present — nothing to do
  if (content.includes(reference)) return;

  // Append reference line
  const line = `\n${reference}\n`;
  content = content ? content.trimEnd() + '\n' + line : line.trimStart();
  fs.writeFileSync(claudeMdPath, content);
}

/** Remove an @import reference line from CLAUDE.md */
export function removeClaudeMdReference(claudeMdPath: string, reference?: string): void {
  if (!fs.existsSync(claudeMdPath)) return;

  let content = fs.readFileSync(claudeMdPath, 'utf8');

  // If a specific reference is given, remove just that one.
  // Otherwise remove all persona references (used by uninstall).
  const refs = reference
    ? [reference]
    : ALL_PERSONA_REFERENCES;

  let changed = false;
  for (const ref of refs) {
    if (content.includes(ref)) {
      content = content
        .split('\n')
        .filter((line) => line.trim() !== ref)
        .join('\n');
      changed = true;
    }
  }

  if (!changed) return;

  // Clean up multiple consecutive blank lines
  content = content.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';

  if (content.trim() === '') {
    fs.writeFileSync(claudeMdPath, '');
  } else {
    fs.writeFileSync(claudeMdPath, content);
  }
}

/** Activate a persona: update active.json, re-register hooks, update CLAUDE.md */
export function activatePersona(
  personaName: string,
  configDir: string,
  mode: 'global' | 'project',
): void {
  const { settingsPath, activeConfigPath } = getTargetPaths(mode);
  const personaDir = resolvePersonaDir(configDir, personaName);
  const personaConfig = loadPersonaConfig(personaDir);
  const handlerPath = path.join(getPackageRoot(), 'dist', 'handler.js');

  writeActiveConfig(activeConfigPath, personaName);
  registerHooks(personaConfig, settingsPath, handlerPath, activeConfigPath);
  updateClaudeMdFlags(personaConfig, mode);
}
