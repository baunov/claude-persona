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

/** The reference line we add to CLAUDE.md to import our standalone flags file */
const CLAUDE_MD_REFERENCE = '@.claude/persona/PERSONA_FLAGS.md';

/**
 * Write persona flag instructions to a standalone file and reference it from CLAUDE.md.
 *
 * Instead of inlining a section in CLAUDE.md (fragile, hard to distinguish from user content),
 * we write `.claude/persona/PERSONA_FLAGS.md` and add a single `@import` reference line.
 */
export function updateClaudeMdFlags(config: PersonaConfig): void {
  const targetDir = path.join(process.cwd(), '.claude', 'persona');
  const flagsFilePath = path.join(targetDir, 'PERSONA_FLAGS.md');
  const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
  const flagSituations = config.situations.filter((s) => s.trigger === 'flag');

  if (flagSituations.length === 0) {
    // No flags — remove the standalone file and the reference
    removeClaudeMdReference(claudeMdPath);
    if (fs.existsSync(flagsFilePath)) {
      fs.unlinkSync(flagsFilePath);
    }
    return;
  }

  // Write the standalone flags file
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

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(flagsFilePath, flagsContent);

  // Add reference to CLAUDE.md if not already present
  addClaudeMdReference(claudeMdPath);

  console.log('  Persona flags: written to PERSONA_FLAGS.md');
}

/** Add the @import reference line to CLAUDE.md */
function addClaudeMdReference(claudeMdPath: string): void {
  let content = '';
  if (fs.existsSync(claudeMdPath)) {
    content = fs.readFileSync(claudeMdPath, 'utf8');
  }

  // Already present — nothing to do
  if (content.includes(CLAUDE_MD_REFERENCE)) return;

  // Append reference line
  const line = `\n${CLAUDE_MD_REFERENCE}\n`;
  content = content ? content.trimEnd() + '\n' + line : line.trimStart();
  fs.writeFileSync(claudeMdPath, content);
}

/** Remove the @import reference line from CLAUDE.md */
export function removeClaudeMdReference(claudeMdPath: string): void {
  if (!fs.existsSync(claudeMdPath)) return;

  let content = fs.readFileSync(claudeMdPath, 'utf8');
  if (!content.includes(CLAUDE_MD_REFERENCE)) return;

  // Remove the reference line (and surrounding blank lines it may leave)
  content = content
    .split('\n')
    .filter((line) => line.trim() !== CLAUDE_MD_REFERENCE)
    .join('\n');

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

  if (mode === 'project') {
    updateClaudeMdFlags(personaConfig);
  }
}
