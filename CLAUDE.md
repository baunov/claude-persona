# claude-persona

Audio feedback system for Claude Code sessions. Plays character-themed sound effects in response to hook events, detected flags in conversation, spam patterns, and permission timeouts.

## Architecture

**One-shot process model.** Claude Code invokes `handler.ts` as a shell command on each hook event. The handler reads stdin (hook JSON), resolves the active persona, selects a matching situation, plays a sound, and exits. No long-running daemon — state is persisted via temp files.

The one exception is the **nagger**: a detached background process (`nag-worker.ts`) spawned on `Notification` events that plays escalating reminder sounds until the user responds or it times out.

## Key Modules

| File | Purpose |
|---|---|
| `src/handler.ts` | Main entry point — hook event handler, reads stdin, dispatches to situations |
| `src/config.ts` | Loads active.json / persona.json, resolves paths, queries situations |
| `src/types.ts` | TypeScript interfaces: `Situation`, `PersonaConfig`, `HookInput`, etc. |
| `src/player.ts` | Sound playback via `play-sound`; `randomElement()` utility |
| `src/spam-detector.ts` | Tracks prompt timestamps in temp file, detects rapid-fire spam |
| `src/flag-scanner.ts` | Scans transcript JSONL for `<!-- persona:flag-name -->` comments |
| `src/nagger.ts` | Starts/cancels detached nag-worker processes for permission timeouts |
| `src/nag-worker.ts` | Standalone worker — sleeps through timeout intervals, plays reminder sounds |
| `src/cli/index.ts` | CLI entry point (`claude-persona init/use/add/test/uninstall`) |
| `src/cli/init.ts` | Installs hooks into Claude Code settings |
| `src/cli/uninstall.ts` | Removes hooks and cleans up temp files |

## Directory Structure

```
personas/           Bundled persona packages
  peasant/          Warcraft 3 Human Peasant
    persona.json    Persona config (name, situations, sounds, personality)
    sounds/         Audio files (.wav, .mp3, .m4a)
  arthas/           Warcraft 3 Arthas (Paladin)
src/                TypeScript source
tests/
  unit/             Vitest unit tests
  helpers/          Test utilities (temp dirs, fixture creators)
```

## Trigger Types

| Trigger | Hook Event(s) | Description |
|---|---|---|
| `UserPromptSubmit` | UserPromptSubmit | User sends a prompt |
| `Stop` | Stop | Claude finishes responding |
| `Notification` | Notification | Claude needs attention |
| `SessionStart` | SessionStart | New session begins |
| `SessionEnd` | SessionEnd | Session ends |
| Other hook events | (same name) | Direct mapping |
| `flag` | Stop (async) | Scans transcript for `<!-- persona:flag-name -->` HTML comments |
| `spam` | UserPromptSubmit | Detects rapid-fire prompt submission |
| `permission_timeout` | Notification + UserPromptSubmit + SessionEnd | Spawns background nagger on Notification, cancels on user response |

## Temp Files

| File | Purpose |
|---|---|
| `$TMPDIR/claude-persona-stamps.json` | Spam detector prompt timestamps |
| `$TMPDIR/claude-persona-flag-stamp.json` | Flag scanner dedup fingerprint |
| `$TMPDIR/claude-persona-nag-<sessionId>.json` | Nagger state (active reminder process) |

## Adding a New Persona

1. Create `personas/<name>/persona.json` with `name`, `description`, `situations[]`
2. Add sound files to `personas/<name>/sounds/`
3. Each situation needs: `name`, `trigger`, `description`, `sounds[]`
4. Optional: `speech[]` (in-character lines), `personality` (system prompt flavor)
5. Optional: `timeouts[]` for `permission_timeout`, `spamThreshold`/`spamWindowMs` for `spam`

## Commands

```bash
npm run build          # TypeScript → dist/
npm test               # Run all tests (vitest)
npm run test:watch     # Watch mode
npm run test:e2e       # Handler E2E tests (no API cost)
npm run test:e2e:live  # Live Claude tests (uses API, ~$0.01-0.05)

npx claude-persona init --global     # Install hooks globally
npx claude-persona init --project    # Install hooks for current project
npx claude-persona use [name]        # Switch active persona
npx claude-persona test [situation]  # Test a sound / list situations
npx claude-persona uninstall         # Remove hooks
```

## E2E Testing

### Handler E2E (`npm run test:e2e`)

Runs the compiled handler as a subprocess with real persona configs and piped stdin JSON — exactly as Claude Code invokes it. No API cost, fully deterministic.

Tests cover: each hook event type, registered commands from settings.json, spam detection, flag scanning + dedup, nagger lifecycle, and error handling.

### Live Claude E2E (`npm run test:e2e:live`)

Actually runs `claude -p` with hooks installed in a sandboxed project directory. Requires the `claude` CLI to be installed and authenticated. Skipped unless `CLAUDE_E2E=1` is set.

### `CLAUDE_PERSONA_LOG` env var

Set `CLAUDE_PERSONA_LOG` to a file path and the handler will append JSONL entries documenting each decision — which situation was resolved, which sound was selected, and which mode (normal/spam/flag/nagger). Useful for debugging hooks in real sessions:

```bash
CLAUDE_PERSONA_LOG=/tmp/persona-debug.jsonl claude
```
