import fs from 'node:fs';
import { listInstalledPersonas } from '../config.js';
import { select } from './prompt.js';
import {
  findConfigDir,
  detectMode,
  activatePersona,
} from './shared.js';

export async function useCommand(name: string | undefined): Promise<void> {
  const configDir = findConfigDir();
  if (!configDir) {
    console.error('claude-persona is not installed. Run `claude-persona init` first.');
    process.exit(1);
  }

  const mode = detectMode(configDir);
  const installed = listInstalledPersonas(configDir);

  if (installed.length === 0) {
    console.error('No personas installed. Run `claude-persona init` first.');
    process.exit(1);
  }

  let chosenName: string;

  if (name) {
    // Explicit name argument
    const match = installed.find((p) => p.name === name);
    if (!match) {
      console.error(`Persona "${name}" is not installed.`);
      console.error('Installed:', installed.map((p) => p.name).join(', '));
      process.exit(1);
    }
    chosenName = match.name;
  } else if (installed.length === 1) {
    chosenName = installed[0]!.name;
    console.log(`Only one persona installed: ${chosenName}`);
  } else {
    // Interactive picker
    chosenName = await select('Switch to persona:', installed.map((p) => ({
      label: p.name,
      value: p.name,
      description: p.description,
    })));
  }

  // Activate: update active.json, re-register hooks, update CLAUDE.md
  activatePersona(chosenName, configDir, mode);

  console.log(`\n  Active persona switched to "${chosenName}".`);
}
