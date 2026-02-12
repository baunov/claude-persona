import fs from 'node:fs';
import path from 'node:path';
import { listInstalledPersonas, listBundledPersonas } from '../config.js';
import { select } from './prompt.js';
import {
  findConfigDir,
  detectMode,
  getPackageRoot,
  copyPersonaDir,
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

  if (installed.length === 0 && !name) {
    console.error('No personas installed. Run `claude-persona init` first.');
    process.exit(1);
  }

  let chosenName: string;

  if (name) {
    const match = installed.find((p) => p.name === name);
    if (!match) {
      // Not installed — try to install from bundled personas
      const packageRoot = getPackageRoot();
      const bundled = listBundledPersonas(packageRoot);
      const bundledMatch = bundled.find((p) => p.name === name);

      if (bundledMatch) {
        const sourceDir = path.join(packageRoot, 'personas', bundledMatch.name);
        const targetPersonaDir = path.join(configDir, 'personas', bundledMatch.name);
        const copied = copyPersonaDir(sourceDir, targetPersonaDir);
        console.log(`  Persona "${bundledMatch.name}" installed (${copied} sound(s)).`);
        chosenName = bundledMatch.name;
      } else {
        console.error(`Persona "${name}" is not installed and not found in bundled personas.`);
        console.error('Installed:', installed.map((p) => p.name).join(', ') || '(none)');
        const bundledNames = bundled.map((p) => p.name);
        if (bundledNames.length > 0) {
          console.error('Bundled:', bundledNames.join(', '));
        }
        process.exit(1);
      }
    } else {
      chosenName = match.name;
    }
  } else if (installed.length === 1) {
    chosenName = installed[0]!.name;
    console.log(`Only one persona installed: ${chosenName}`);
  } else {
    // Interactive picker — show installed + bundled (not yet installed) together
    const packageRoot = getPackageRoot();
    const bundled = listBundledPersonas(packageRoot);
    const installedNames = new Set(installed.map((p) => p.name));
    const notInstalled = bundled.filter((p) => !installedNames.has(p.name));

    const choices = [
      ...installed.map((p) => ({
        label: p.name,
        value: p.name,
        description: p.description,
      })),
      ...notInstalled.map((p) => ({
        label: `${p.name} (not installed)`,
        value: p.name,
        description: p.description,
      })),
    ];

    chosenName = await select('Switch to persona:', choices);

    // Install from bundled if not yet installed
    if (!installedNames.has(chosenName)) {
      const sourceDir = path.join(packageRoot, 'personas', chosenName);
      const targetPersonaDir = path.join(configDir, 'personas', chosenName);
      const copied = copyPersonaDir(sourceDir, targetPersonaDir);
      console.log(`  Persona "${chosenName}" installed (${copied} sound(s)).`);
    }
  }

  // Activate: update active.json, re-register hooks, update CLAUDE.md
  activatePersona(chosenName, configDir, mode);

  console.log(`\n  Active persona switched to "${chosenName}".`);
}
