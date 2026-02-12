import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ClaudeSettings } from '../types.js';
import { removeClaudeMdReference } from './shared.js';

interface UninstallOptions {
  global?: boolean;
  project?: boolean;
  purge?: boolean;
}

export async function uninstallCommand(options: UninstallOptions): Promise<void> {
  const isGlobal = options.global ?? false;
  const isProject = options.project ?? false;
  const purge = options.purge ?? false;

  if (!isGlobal && !isProject) {
    console.log('Please specify --global or --project:\n');
    console.log('  claude-persona uninstall --global          # Remove hooks from global settings');
    console.log('  claude-persona uninstall --project         # Remove hooks from project settings');
    console.log('  claude-persona uninstall --project --purge # Also delete sounds, config, and CLAUDE.md section');
    process.exit(1);
  }

  let settingsPath: string;
  let personaDir: string;

  if (isGlobal) {
    settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    personaDir = path.join(os.homedir(), '.claude-persona');
  } else {
    settingsPath = path.join(process.cwd(), '.claude', 'settings.local.json');
    personaDir = path.join(process.cwd(), '.claude', 'persona');
  }

  // 1. Remove hooks from Claude settings
  removeHooks(settingsPath);

  // 2. Remove CLAUDE.md reference and flags file (project only)
  if (isProject) {
    removePersonaFlags();
  }

  // 3. Clean up spam detector temp file
  removeStampFile();

  // 4. Handle sounds + config directory
  if (fs.existsSync(personaDir)) {
    if (purge) {
      fs.rmSync(personaDir, { recursive: true, force: true });
      console.log(`  Removed ${personaDir}`);
    } else {
      console.log(`\n  Sound files and config are still at: ${personaDir}`);
      console.log('  To remove them too, re-run with --purge');
    }
  }

  console.log('\n  claude-persona uninstalled.');
}

function removeHooks(settingsPath: string): void {
  if (!fs.existsSync(settingsPath)) {
    console.log('  No settings file found, nothing to remove.');
    return;
  }

  try {
    const settings: ClaudeSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (!settings.hooks) {
      console.log('  No hooks found in settings.');
      return;
    }

    let removed = 0;
    for (const event of Object.keys(settings.hooks)) {
      const before = settings.hooks[event]!.length;
      settings.hooks[event] = settings.hooks[event]!.filter(
        (m) => !m.hooks.some((h) => h.command.includes('#claude-persona')),
      );
      removed += before - settings.hooks[event]!.length;

      // Clean up empty arrays
      if (settings.hooks[event]!.length === 0) {
        delete settings.hooks[event];
      }
    }

    // Clean up empty hooks object
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

    if (removed > 0) {
      console.log(`  Removed ${removed} hook(s) from ${settingsPath}`);
    } else {
      console.log('  No claude-persona hooks found in settings.');
    }
  } catch (err) {
    console.error(`  Error reading ${settingsPath}:`, err);
  }
}

function removePersonaFlags(): void {
  const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
  const flagsFilePath = path.join(process.cwd(), '.claude', 'persona', 'PERSONA_FLAGS.md');

  // Remove the @import reference from CLAUDE.md
  removeClaudeMdReference(claudeMdPath);

  // Remove the standalone flags file
  if (fs.existsSync(flagsFilePath)) {
    fs.unlinkSync(flagsFilePath);
    console.log('  Removed PERSONA_FLAGS.md');
  }
}

function removeStampFile(): void {
  const stampFile = path.join(os.tmpdir(), 'claude-persona-stamps.json');
  if (fs.existsSync(stampFile)) {
    fs.unlinkSync(stampFile);
    console.log('  Removed spam detector temp file.');
  }
}
