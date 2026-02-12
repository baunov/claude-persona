import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { loadPersonaConfig, listBundledPersonas } from '../config.js';
import { findConfigDir, getPackageRoot, copyPersonaDir } from './shared.js';

interface AddOptions {
  name?: string;
}

export async function addCommand(source: string, options: AddOptions): Promise<void> {
  const configDir = findConfigDir();
  if (!configDir) {
    console.error('claude-persona is not installed. Run `claude-persona init` first.');
    process.exit(1);
  }

  let sourceDir: string;
  let cleanup: (() => void) | null = null;

  if (source.startsWith('github:')) {
    // GitHub repo: clone to temp and extract
    const repo = source.slice('github:'.length);
    const repoUrl = `https://github.com/${repo}.git`;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-persona-add-'));
    cleanup = () => fs.rmSync(tmpDir, { recursive: true, force: true });

    console.log(`  Cloning ${repoUrl}...`);
    try {
      execSync(`git clone --depth 1 "${repoUrl}" "${tmpDir}"`, { stdio: 'pipe' });
    } catch {
      cleanup();
      console.error(`Failed to clone ${repoUrl}`);
      process.exit(1);
    }

    sourceDir = tmpDir;
  } else {
    // Check if it's a bundled persona name (e.g. "peasant", "arthas")
    const packageRoot = getPackageRoot();
    const bundled = listBundledPersonas(packageRoot);
    const bundledMatch = bundled.find((p) => p.name === source);

    if (bundledMatch) {
      sourceDir = path.join(packageRoot, 'personas', bundledMatch.name);
    } else {
      // Local path
      sourceDir = path.resolve(source);
    }
  }

  // Validate persona structure
  const personaJsonPath = path.join(sourceDir, 'persona.json');
  const soundsDir = path.join(sourceDir, 'sounds');

  if (!fs.existsSync(personaJsonPath)) {
    cleanup?.();
    console.error(`Invalid persona: no persona.json found in ${sourceDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(soundsDir) || !fs.statSync(soundsDir).isDirectory()) {
    cleanup?.();
    console.error(`Invalid persona: no sounds/ directory found in ${sourceDir}`);
    process.exit(1);
  }

  // Load persona config to get the name
  let personaConfig;
  try {
    personaConfig = loadPersonaConfig(sourceDir);
  } catch (err) {
    cleanup?.();
    console.error(`Invalid persona.json: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const personaName = options.name ?? personaConfig.name;
  const targetPersonaDir = path.join(configDir, 'personas', personaName);

  if (fs.existsSync(targetPersonaDir)) {
    console.log(`  Persona "${personaName}" already exists, updating...`);
    fs.rmSync(targetPersonaDir, { recursive: true, force: true });
  }

  const copied = copyPersonaDir(sourceDir, targetPersonaDir);
  cleanup?.();

  console.log(`\n  Persona "${personaName}" installed (${copied} sound(s)).`);
  console.log(`  Location: ${targetPersonaDir}`);
  console.log(`\n  To activate it, run: claude-persona use ${personaName}`);
}
