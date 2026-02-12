import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, getRequiredHookEvents, hasFlagSituations } from '../config.js';
import type { ClaudeSettings, ClaudeHookMatcher, ClaudePersonaConfig } from '../types.js';

/** Locate the package root (where sounds/ and defaults/ live) */
function getPackageRoot(): string {
  // When running from dist/cli/index.js, package root is ../../
  return path.resolve(new URL('..', import.meta.url).pathname, '..');
}

interface InitOptions {
  global?: boolean;
  project?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const isGlobal = options.global ?? false;
  const isProject = options.project ?? false;

  if (!isGlobal && !isProject) {
    console.log('Please specify --global or --project:\n');
    console.log('  claude-persona init --global   # Install for all projects');
    console.log('  claude-persona init --project  # Install for current project only');
    process.exit(1);
  }

  const packageRoot = getPackageRoot();
  const defaultConfigPath = path.join(packageRoot, 'defaults', 'claude-persona.json');
  const defaultSoundsDir = path.join(packageRoot, 'sounds');

  if (!fs.existsSync(defaultConfigPath)) {
    console.error('Error: Default config not found at', defaultConfigPath);
    process.exit(1);
  }

  // Determine target paths
  let targetDir: string;
  let settingsPath: string;

  if (isGlobal) {
    targetDir = path.join(os.homedir(), '.claude-persona');
    settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  } else {
    targetDir = path.join(process.cwd(), '.claude', 'persona');
    settingsPath = path.join(process.cwd(), '.claude', 'settings.local.json');
  }

  const targetConfigPath = path.join(targetDir, 'claude-persona.json');
  const targetSoundsDir = path.join(targetDir, 'sounds');

  // 1. Create target directory
  fs.mkdirSync(targetDir, { recursive: true });

  // 2. Copy config (don't overwrite if exists)
  if (fs.existsSync(targetConfigPath)) {
    console.log(`  Config already exists at ${targetConfigPath}, skipping.`);
  } else {
    fs.copyFileSync(defaultConfigPath, targetConfigPath);
    console.log(`  Config: ${targetConfigPath}`);
  }

  // 3. Copy sounds
  const config = loadConfig(targetConfigPath);
  const personaSoundsSource = path.join(defaultSoundsDir, config.persona);
  const personaSoundsTarget = path.join(targetSoundsDir, config.persona);

  if (fs.existsSync(personaSoundsSource)) {
    fs.mkdirSync(personaSoundsTarget, { recursive: true });
    const files = fs.readdirSync(personaSoundsSource);
    let copied = 0;
    for (const file of files) {
      const targetFile = path.join(personaSoundsTarget, file);
      if (!fs.existsSync(targetFile)) {
        fs.copyFileSync(path.join(personaSoundsSource, file), targetFile);
        copied++;
      }
    }
    console.log(`  Sounds: ${copied} files copied to ${personaSoundsTarget}`);
  } else {
    console.log(`  No default sounds found for persona "${config.persona}".`);
    fs.mkdirSync(personaSoundsTarget, { recursive: true });
    console.log(`  Created empty sounds dir: ${personaSoundsTarget}`);
  }

  // 4. Register hooks in Claude settings
  const handlerPath = path.join(packageRoot, 'dist', 'handler.js');
  registerHooks(config, settingsPath, handlerPath, targetConfigPath);

  // 5. Append CLAUDE.md flag instructions (project install only)
  if (isProject && hasFlagSituations(config)) {
    appendClaudeMdFlags(config);
  }

  console.log('\n  claude-persona installed successfully!\n');
  console.log(`  Edit your config: ${targetConfigPath}`);
  console.log(`  Add sounds to:    ${personaSoundsTarget}`);
  console.log(`  Test it:          claude-persona test task-complete`);
}

function registerHooks(
  config: ClaudePersonaConfig,
  settingsPath: string,
  handlerPath: string,
  configPath: string,
): void {
  // Load existing settings
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

  const requiredEvents = getRequiredHookEvents(config);
  const hasFlags = hasFlagSituations(config);
  const handlerCmd = (event: string, extra = '') =>
    `node "${handlerPath}" --event ${event} --config "${configPath}"${extra}`;

  // Marker to identify our hooks for idempotent re-runs
  const marker = 'claude-persona';

  for (const event of requiredEvents) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    // Remove any existing claude-persona hooks for this event
    settings.hooks[event] = settings.hooks[event]!.filter(
      (m) => !m.hooks.some((h) => h.command.includes(marker)),
    );

    // Build hook entries for this event
    const hookEntries: ClaudeHookMatcher = {
      matcher: '',
      hooks: [
        { type: 'command', command: handlerCmd(event) },
      ],
    };

    // For Stop event, add async flag scanner
    if (event === 'Stop' && hasFlags) {
      hookEntries.hooks.push({
        type: 'command',
        command: handlerCmd(event, ' --flags'),
        async: true,
      });
    }

    settings.hooks[event]!.push(hookEntries);
  }

  // Ensure settings directory exists
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`  Hooks: registered in ${settingsPath}`);
}

function appendClaudeMdFlags(config: ClaudePersonaConfig): void {
  const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
  const flagSituations = config.situations.filter((s) => s.trigger === 'flag');

  if (flagSituations.length === 0) return;

  const marker = '## Persona Flags';
  let content = '';

  if (fs.existsSync(claudeMdPath)) {
    content = fs.readFileSync(claudeMdPath, 'utf8');
    // Don't append if already present
    if (content.includes(marker)) {
      console.log('  CLAUDE.md: persona flags section already exists, skipping.');
      return;
    }
  }

  const rows = flagSituations
    .map((s) => `| \`<!-- persona:${s.name} -->\` | ${s.description} |`)
    .join('\n');

  const section = `
${marker}

When your response matches one of these situations, include the corresponding HTML comment flag **at the very end** of your text output. The hook system will detect it and play the appropriate sound.

| Flag | When to use |
|---|---|
${rows}

Rules:
- Only include ONE flag per response, at the very end
- Only use when the situation genuinely applies
- The flag is invisible to markdown renderers but the hook script reads it from the transcript
`;

  content = content ? content.trimEnd() + '\n' + section : section.trimStart();
  fs.writeFileSync(claudeMdPath, content);
  console.log('  CLAUDE.md: appended persona flags section.');
}
