import {
  loadActiveConfig,
  loadPersonaConfig,
  resolvePersonaDir,
  resolveSoundPath,
  listInstalledPersonas,
} from '../config.js';
import { playRandom } from '../player.js';
import { findConfigDir } from './shared.js';

interface TestOptions {
  config?: string;
}

export async function testCommand(
  situation: string | undefined,
  options: TestOptions,
): Promise<void> {
  const configDir = options.config ?? findConfigDir();
  if (!configDir) {
    console.error('claude-persona is not installed. Run `claude-persona init` first.');
    process.exit(1);
  }

  let personaName: string;
  try {
    const activeConfig = loadActiveConfig(`${configDir}/active.json`);
    personaName = activeConfig.persona;
  } catch {
    console.error('No active persona found. Run `claude-persona init` first.');
    process.exit(1);
  }

  const personaDir = resolvePersonaDir(configDir, personaName);
  const config = loadPersonaConfig(personaDir);

  if (!situation) {
    const installed = listInstalledPersonas(configDir);

    console.log(`Active persona: ${config.name}`);
    if (config.description) {
      console.log(`  ${config.description}`);
    }

    if (installed.length > 1) {
      console.log(`\nInstalled personas: ${installed.map((p) => p.name).join(', ')}`);
    }

    console.log('\nSituations:');
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
    resolveSoundPath(personaDir, s),
  );

  console.log(`Playing "${match.name}" (${match.sounds.length} sound(s))...`);
  await playRandom(soundPaths);

  // Give audio time to finish
  await new Promise((resolve) => setTimeout(resolve, 3000));
}
