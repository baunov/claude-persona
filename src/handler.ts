#!/usr/bin/env node

/**
 * claude-persona hook handler
 *
 * Called by Claude Code hooks with:
 *   node handler.js --event <HookEvent> [--flags] --config <path>
 *
 * Reads hook JSON from stdin, resolves a situation, plays a sound.
 */

import path from 'node:path';
import {
  loadConfig,
  resolveSoundPath,
  getSituationsForTrigger,
  getSituationByName,
  getFlagNames,
  hasSpamSituation,
} from './config.js';
import { playRandom, randomElement } from './player.js';
import { checkSpam } from './spam-detector.js';
import { scanForFlags } from './flag-scanner.js';
import type { HookInput, Situation } from './types.js';

// Safety timeout — never block Claude
setTimeout(() => process.exit(0), 5000);

function parseArgs(argv: string[]): { event: string; flags: boolean; config: string } {
  let event = '';
  let flags = false;
  let config = '';

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--event':
        event = argv[++i] ?? '';
        break;
      case '--flags':
        flags = true;
        break;
      case '--config':
        config = argv[++i] ?? '';
        break;
    }
  }

  return { event, flags, config };
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    // If stdin isn't piped, resolve immediately
    if (process.stdin.isTTY) resolve('{}');
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!args.config) {
    process.exit(0);
  }

  let hookInput: HookInput;
  try {
    const raw = await readStdin();
    hookInput = JSON.parse(raw || '{}');
  } catch {
    hookInput = { session_id: '', hook_event_name: args.event };
  }

  let personaConfig;
  try {
    personaConfig = loadConfig(args.config);
  } catch {
    process.exit(0);
  }

  const configDir = path.dirname(args.config);

  // Flag scanning mode (async Stop hook)
  if (args.flags) {
    const flagNames = getFlagNames(personaConfig);
    if (flagNames.length === 0 || !hookInput.transcript_path) {
      process.exit(0);
    }

    const matchedFlag = scanForFlags(hookInput.transcript_path, flagNames);
    if (matchedFlag) {
      const situation = getSituationByName(personaConfig, matchedFlag);
      if (situation) {
        const soundPaths = situation.sounds.map((s) =>
          resolveSoundPath(configDir, personaConfig.persona, s),
        );
        await playRandom(soundPaths);
      }
    }

    // Give sound time to start before exiting
    await new Promise((resolve) => setTimeout(resolve, 1500));
    process.exit(0);
  }

  // Normal mode: resolve situation from event
  let situation: Situation | undefined;

  if (args.event === 'UserPromptSubmit' && hasSpamSituation(personaConfig)) {
    const isSpam = checkSpam();
    if (isSpam) {
      const spamSituations = getSituationsForTrigger(personaConfig, 'spam');
      situation = spamSituations.length > 0 ? randomElement(spamSituations) : undefined;
    }
  }

  if (!situation) {
    const matches = getSituationsForTrigger(personaConfig, args.event as any);
    situation = matches.length > 0 ? matches[0] : undefined;
  }

  if (!situation || situation.sounds.length === 0) {
    process.exit(0);
  }

  const soundPaths = situation.sounds.map((s) =>
    resolveSoundPath(configDir, personaConfig.persona, s),
  );

  await playRandom(soundPaths);
  process.exit(0);
}

main().catch(() => process.exit(0));
