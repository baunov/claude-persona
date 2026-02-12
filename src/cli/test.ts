import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { loadConfig, resolveSoundPath } from '../config.js';
import { playRandom } from '../player.js';

interface TestOptions {
  config?: string;
}

/** Resolve config path: explicit > project > global */
function findConfig(explicit?: string): string | null {
  if (explicit) return explicit;

  const projectConfig = path.join(process.cwd(), '.claude', 'persona', 'claude-persona.json');
  if (fs.existsSync(projectConfig)) return projectConfig;

  const globalConfig = path.join(os.homedir(), '.claude-persona', 'claude-persona.json');
  if (fs.existsSync(globalConfig)) return globalConfig;

  return null;
}

export async function testCommand(
  situation: string | undefined,
  options: TestOptions,
): Promise<void> {
  const configPath = findConfig(options.config);
  if (!configPath) {
    console.error('No claude-persona.json found. Run `claude-persona init` first.');
    process.exit(1);
  }

  const config = loadConfig(configPath);
  const configDir = path.dirname(configPath);

  if (!situation) {
    // List all situations
    console.log(`Persona: ${config.persona}\n`);
    console.log('Situations:');
    for (const s of config.situations) {
      console.log(`  ${s.name.padEnd(20)} [${s.trigger}] ${s.sounds.length} sound(s) — ${s.description}`);
    }
    console.log(`\nTest a situation: claude-persona test <situation-name>`);
    return;
  }

  const match = config.situations.find((s) => s.name === situation);
  if (!match) {
    console.error(`Unknown situation: "${situation}"`);
    console.error('Available:', config.situations.map((s) => s.name).join(', '));
    process.exit(1);
  }

  const soundPaths = match.sounds.map((s) =>
    resolveSoundPath(configDir, config.persona, s),
  );

  console.log(`Playing "${match.name}" (${match.sounds.length} sound(s))...`);
  await playRandom(soundPaths);

  // Give audio time to finish
  await new Promise((resolve) => setTimeout(resolve, 3000));
}
