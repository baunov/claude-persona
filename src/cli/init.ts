import fs from 'node:fs';
import path from 'node:path';
import { listBundledPersonas } from '../config.js';
import { select } from './prompt.js';
import {
  getPackageRoot,
  getTargetPaths,
  copyPersonaDir,
  activatePersona,
} from './shared.js';

interface InitOptions {
  global?: boolean;
  project?: boolean;
  persona?: string;
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

  const mode = isGlobal ? 'global' : 'project';
  const packageRoot = getPackageRoot();
  const bundled = listBundledPersonas(packageRoot);

  if (bundled.length === 0) {
    console.error('Error: No bundled personas found.');
    process.exit(1);
  }

  // Determine which persona to install
  let chosenName: string;

  if (options.persona) {
    // Explicit --persona flag
    const match = bundled.find((p) => p.name === options.persona);
    if (!match) {
      console.error(`Unknown persona: "${options.persona}"`);
      console.error('Available:', bundled.map((p) => p.name).join(', '));
      process.exit(1);
    }
    chosenName = match.name;
  } else if (bundled.length === 1) {
    // Only one persona, use it
    chosenName = bundled[0]!.name;
  } else {
    // Interactive picker
    chosenName = await select('Choose a persona:', bundled.map((p) => ({
      label: p.name,
      value: p.name,
      description: p.description,
    })));
  }

  const { targetDir } = getTargetPaths(mode);
  const sourceDir = path.join(packageRoot, 'personas', chosenName);
  const targetPersonaDir = path.join(targetDir, 'personas', chosenName);

  // 1. Copy persona files
  fs.mkdirSync(targetDir, { recursive: true });
  const copied = copyPersonaDir(sourceDir, targetPersonaDir);
  console.log(`  Persona "${chosenName}": ${copied} sound(s) copied to ${targetPersonaDir}`);

  // 2. Activate (writes active.json, registers hooks, updates CLAUDE.md)
  activatePersona(chosenName, targetDir, mode);

  console.log(`\n  claude-persona installed successfully!\n`);
  console.log(`  Active persona: ${chosenName}`);
  console.log(`  Config dir:     ${targetDir}`);
  console.log(`  Test it:        npx claude-persona test task-complete`);
}
