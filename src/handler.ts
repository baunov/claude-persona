#!/usr/bin/env node

/**
 * claude-persona hook handler
 *
 * Called by Claude Code hooks with:
 *   node handler.js --event <HookEvent> [--flags] --config <path/to/active.json>
 *
 * Reads hook JSON from stdin, resolves the active persona, plays a sound.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  loadActiveConfig,
  resolvePersonaDir,
  loadPersonaConfig,
  resolveSoundPath,
  getSituationsForTrigger,
  getSituationByName,
  getFlagNames,
  hasSpamSituation,
  hasPermissionTimeoutSituation,
} from './config.js';
import { play, randomElement } from './player.js';
import { checkSpam } from './spam-detector.js';
import { scanForFlags } from './flag-scanner.js';
import { startNagger, cancelNagger } from './nagger.js';
import { detectVolumeAsync } from './focus.js';
import type { HookInput, Situation } from './types.js';

// Safety timeout — never block Claude
setTimeout(() => process.exit(0), 5000);

/** Append a JSONL log entry when CLAUDE_PERSONA_LOG is set (for e2e testing / debugging) */
function logEntry(entry: Record<string, unknown>): void {
  const logPath = process.env.CLAUDE_PERSONA_LOG;
  if (!logPath) return;
  try {
    fs.appendFileSync(logPath, JSON.stringify({ ts: Date.now(), ...entry }) + '\n');
  } catch {
    // Never block Claude
  }
}

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
    if (process.stdin.isTTY) resolve('{}');
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!args.config) {
    process.exit(0);
  }

  // Start volume detection early — runs concurrently with stdin/config loading
  const volumePromise = detectVolumeAsync();

  let hookInput: HookInput;
  try {
    const raw = await readStdin();
    hookInput = JSON.parse(raw || '{}');
  } catch {
    hookInput = { session_id: '', hook_event_name: args.event };
  }

  // Load active.json → persona dir → persona.json
  let personaDir: string;
  let personaConfig;
  try {
    const activeConfig = loadActiveConfig(args.config);
    const configDir = path.dirname(args.config);
    personaDir = resolvePersonaDir(configDir, activeConfig.persona);
    personaConfig = loadPersonaConfig(personaDir);
  } catch {
    process.exit(0);
  }

  // Await volume detection (started concurrently above)
  const volume = await volumePromise;

  // Flag scanning mode (async Stop hook)
  if (args.flags) {
    const flagNames = getFlagNames(personaConfig);
    if (flagNames.length === 0 || (!hookInput.last_assistant_message && !hookInput.transcript_path)) {
      process.exit(0);
    }

    const matchedFlag = scanForFlags(flagNames, hookInput.last_assistant_message, hookInput.transcript_path);
    if (matchedFlag) {
      const situation = getSituationByName(personaConfig, matchedFlag);
      if (situation && situation.sounds.length > 0) {
        const soundPaths = situation.sounds.map((s) =>
          resolveSoundPath(personaDir, s),
        );
        const chosen = randomElement(soundPaths);
        logEntry({ event: args.event, flag: matchedFlag, situation: situation.name, sound: path.basename(chosen), mode: 'flag' });
        await play(chosen, volume);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
    process.exit(0);
  }

  // Permission timeout nagger: start on permission Notification, cancel on response/session end
  const sessionId = hookInput.session_id || 'unknown';
  if (hasPermissionTimeoutSituation(personaConfig)) {
    if (args.event === 'Notification' && hookInput.notification_type === 'permission_prompt') {
      // Cancel any existing nagger before starting a new one (dedup)
      cancelNagger(sessionId);
      const nagSituations = getSituationsForTrigger(personaConfig, 'permission_timeout');
      const nagCfg = nagSituations[0];
      if (nagCfg) {
        const nagSounds = nagCfg.sounds.map((s) => resolveSoundPath(personaDir, s));
        const timeouts = nagCfg.timeouts ?? [30, 60, 120];
        startNagger(sessionId, nagSounds, timeouts);
        logEntry({ event: args.event, nagger: 'started', mode: 'nagger' });
      }
    } else if (args.event === 'UserPromptSubmit' || args.event === 'SessionEnd') {
      cancelNagger(sessionId);
      logEntry({ event: args.event, nagger: 'cancelled', mode: 'nagger' });
    }
  }

  // Normal mode: resolve situation from event
  let situation: Situation | undefined;
  let mode = 'normal';

  if (args.event === 'UserPromptSubmit' && hasSpamSituation(personaConfig)) {
    const spamSituations = getSituationsForTrigger(personaConfig, 'spam');
    const spamCfg = spamSituations[0];
    const isSpam = checkSpam(spamCfg?.spamThreshold, spamCfg?.spamWindowMs);
    if (isSpam) {
      situation = spamSituations.length > 0 ? randomElement(spamSituations) : undefined;
      mode = 'spam';
    }
  }

  if (!situation) {
    const matches = getSituationsForTrigger(personaConfig, args.event as any);
    situation = matches.length > 0 ? randomElement(matches) : undefined;
  }

  if (!situation || situation.sounds.length === 0) {
    process.exit(0);
  }

  const soundPaths = situation.sounds.map((s) =>
    resolveSoundPath(personaDir, s),
  );
  const chosen = randomElement(soundPaths);
  logEntry({ event: args.event, situation: situation.name, sound: path.basename(chosen), mode });
  await play(chosen, volume);
  process.exit(0);
}

main().catch(() => process.exit(0));
