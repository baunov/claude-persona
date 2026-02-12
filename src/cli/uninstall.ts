import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ClaudeSettings } from '../types.js';

interface UninstallOptions {
  global?: boolean;
  project?: boolean;
}

export async function uninstallCommand(options: UninstallOptions): Promise<void> {
  const isGlobal = options.global ?? false;
  const isProject = options.project ?? false;

  if (!isGlobal && !isProject) {
    console.log('Please specify --global or --project:\n');
    console.log('  claude-persona uninstall --global   # Remove from global settings');
    console.log('  claude-persona uninstall --project  # Remove from project settings');
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

  // Remove hooks from settings
  if (fs.existsSync(settingsPath)) {
    try {
      const settings: ClaudeSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.hooks) {
        let removed = 0;
        for (const event of Object.keys(settings.hooks)) {
          const before = settings.hooks[event]!.length;
          settings.hooks[event] = settings.hooks[event]!.filter(
            (m) => !m.hooks.some((h) => h.command.includes('claude-persona')),
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
        console.log(`  Removed ${removed} hook(s) from ${settingsPath}`);
      }
    } catch (err) {
      console.error(`  Error reading ${settingsPath}:`, err);
    }
  } else {
    console.log(`  No settings file at ${settingsPath}`);
  }

  // Inform about sound files (don't auto-delete)
  if (fs.existsSync(personaDir)) {
    console.log(`\n  Sound files and config are still at: ${personaDir}`);
    console.log('  Remove manually if no longer needed:');
    console.log(`    rm -rf "${personaDir}"`);
  }

  console.log('\n  claude-persona uninstalled.');
}
