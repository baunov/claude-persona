# claude-persona

Sound effects for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions. Hear audio feedback when Claude starts a task, finishes responding, hits an error, and more.

Ships with a default Warcraft 3 peasant sound pack. Easily configurable with your own sounds and situations.

## Quick Start

```bash
# Install globally (works in all projects)
npx claude-persona init --global

# Or install for current project only
npx claude-persona init --project
```

That's it. Start a Claude Code session and you'll hear sounds.

## How It Works

claude-persona installs [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) that play audio clips when specific events happen during a session. Everything is controlled by a single JSON config file.

## Configuration

After `init`, your config lives at:
- **Global:** `~/.claude-persona/claude-persona.json`
- **Project:** `.claude/persona/claude-persona.json`

```json
{
  "persona": "peasant",
  "situations": [
    {
      "name": "task-complete",
      "trigger": "Stop",
      "description": "Claude finished responding",
      "sounds": ["готово.mp3", "я готов.wav", "да.wav"]
    }
  ]
}
```

### Config fields

| Field | Description |
|---|---|
| `persona` | Name of your sound pack. Maps to `sounds/<persona>/` directory. |
| `situations` | Array of situations that trigger sounds. |

### Situation fields

| Field | Description |
|---|---|
| `name` | Unique identifier. For `flag` triggers, this becomes the flag name. |
| `trigger` | What fires this situation (see trigger types below). |
| `description` | Human-readable description. Used in CLAUDE.md for flag situations. |
| `sounds` | Array of filenames in `sounds/<persona>/`. A random one is picked each time. |

### Trigger types

| Trigger | When it fires |
|---|---|
| `UserPromptSubmit` | User sends a prompt |
| `Stop` | Claude finishes responding |
| `PostToolUseFailure` | A tool call fails |
| `SessionStart` | New session begins |
| `SessionEnd` | Session ends |
| `Notification` | Claude needs attention or permission |
| `SubagentStart` | A subagent is spawned |
| `SubagentStop` | A subagent finishes |
| `PreToolUse` | Before a tool executes |
| `PostToolUse` | After a tool succeeds |
| `flag` | Detected via `<!-- persona:<name> -->` in Claude's response |
| `spam` | User sending 3+ prompts within 15 seconds (overrides `UserPromptSubmit`) |

Any [Claude Code hook event](https://docs.anthropic.com/en/docs/claude-code/hooks) can be used as a trigger.

### Flag situations

Situations with `"trigger": "flag"` are special. Claude self-inserts an HTML comment flag at the end of its response when the situation applies. The hook system detects it from the transcript.

For this to work, `claude-persona init --project` appends instructions to your `CLAUDE.md`:

```markdown
<!-- persona:admitted-wrong -->   → Claude admits a mistake
<!-- persona:found-bug -->        → Claude found or fixed a bug
```

You can add your own flag situations — just add an entry with `"trigger": "flag"` and re-run `init`.

## CLI Commands

```bash
claude-persona init --global              # Install globally
claude-persona init --project             # Install for current project
claude-persona test                       # List all situations
claude-persona test task-complete         # Play a random sound for "task-complete"
claude-persona uninstall --global         # Remove global hooks
claude-persona uninstall --project        # Remove project hooks
claude-persona uninstall --project --purge  # Full removal (hooks + sounds + config)
```

## Uninstalling

Remove hooks from Claude Code settings:

```bash
# If you installed globally
npx claude-persona uninstall --global

# If you installed per-project
npx claude-persona uninstall --project
```

This removes all hooks from your Claude settings and cleans up the `## Persona Flags` section from CLAUDE.md. Your sounds and config are kept in case you want to re-install later.

To remove everything (hooks, sounds, config):

```bash
npx claude-persona uninstall --project --purge
npx claude-persona uninstall --global --purge
```

All commands are idempotent — safe to run multiple times.

## Custom Sound Packs

1. Create a directory: `sounds/my-character/`
2. Add your audio files (WAV, MP3, M4A, OGG)
3. Update `persona` in your config to `"my-character"`
4. Reference the filenames in your situations

Sound files are stored flat — all files for a persona go in one directory.

## Adding Situations

Just add an entry to the `situations` array in your config:

```json
{
  "name": "subagent-stop",
  "trigger": "SubagentStop",
  "description": "A subagent finished its work",
  "sounds": ["phew.wav", "finally.wav"]
}
```

Re-run `claude-persona init` to register any new hook events.

## Requirements

- Node.js 18+
- Claude Code CLI
- Audio playback: `afplay` (macOS), `paplay` (Linux), or PowerShell (Windows)

## License

MIT
