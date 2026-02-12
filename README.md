# claude-persona

Sound effects for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions. Hear audio feedback when Claude starts a task, finishes responding, hits an error, and more.

Ships with a default Warcraft 3 peasant sound pack. Easily add your own personas with custom sounds and situations.

## Quick Start

```bash
# Install globally (works in all projects)
npx claude-persona init --global

# Or install for current project only
npx claude-persona init --project
```

If multiple personas are bundled, you'll get an interactive picker. Or specify one directly:

```bash
npx claude-persona init --global --persona peasant
```

That's it. Start a Claude Code session and you'll hear sounds.

## How It Works

claude-persona installs [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) that play audio clips when specific events happen during a session.

Each persona is a self-contained directory with a `persona.json` config and a `sounds/` folder:

```
peasant/
├── persona.json
└── sounds/
    ├── готово.mp3
    ├── да.wav
    └── ...
```

## Persona Config

Each persona has a `persona.json`:

```json
{
  "name": "peasant",
  "description": "Warcraft 3 peasant (Russian voice lines)",
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
| `name` | Display name of the persona |
| `description` | Human-readable description |
| `situations` | Array of situations that trigger sounds |

### Situation fields

| Field | Description |
|---|---|
| `name` | Unique identifier. For `flag` triggers, this becomes the flag name. |
| `trigger` | What fires this situation (see trigger types below). |
| `description` | Human-readable description. Used in CLAUDE.md for flag situations. |
| `sounds` | Array of filenames in the persona's `sounds/` directory. A random one is picked each time. |

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

You can add your own flag situations — just add an entry with `"trigger": "flag"` to your persona's config.

## CLI Commands

```bash
claude-persona init --global               # Install globally
claude-persona init --project              # Install for current project
claude-persona init --project --persona X  # Skip picker, install persona X
claude-persona use                         # Switch active persona (interactive)
claude-persona use <name>                  # Switch to a specific persona
claude-persona add ./path/to/persona       # Install persona from local directory
claude-persona add github:user/repo        # Install persona from GitHub
claude-persona test                        # List all situations
claude-persona test task-complete          # Play a random sound for "task-complete"
claude-persona uninstall --global          # Remove global hooks
claude-persona uninstall --project         # Remove project hooks
claude-persona uninstall --project --purge # Full removal (hooks + sounds + config)
```

## Managing Personas

### Switching personas

After installation, switch between installed personas:

```bash
# Interactive picker
npx claude-persona use

# Or specify directly
npx claude-persona use peasant
```

This updates the active persona, re-registers hooks, and updates CLAUDE.md flags.

### Installing third-party personas

Install a persona from a local directory or GitHub:

```bash
# From a local path
npx claude-persona add ./my-persona/

# From GitHub
npx claude-persona add github:username/my-persona
```

The source must contain a valid `persona.json` and a `sounds/` directory. After adding, activate it with `claude-persona use <name>`.

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

## Creating a Custom Persona

1. Create a directory with your persona name:
   ```
   my-character/
   ├── persona.json
   └── sounds/
       ├── hello.wav
       ├── done.mp3
       └── error.wav
   ```

2. Write `persona.json`:
   ```json
   {
     "name": "my-character",
     "description": "My custom sound pack",
     "situations": [
       {
         "name": "task-complete",
         "trigger": "Stop",
         "description": "Claude finished responding",
         "sounds": ["done.mp3"]
       },
       {
         "name": "error",
         "trigger": "PostToolUseFailure",
         "description": "Something went wrong",
         "sounds": ["error.wav"]
       }
     ]
   }
   ```

3. Install it:
   ```bash
   npx claude-persona add ./my-character/
   npx claude-persona use my-character
   ```

Sound files are stored flat — all audio files for a persona go in one `sounds/` directory. Supports WAV, MP3, M4A, and OGG.

## Requirements

- Node.js 18+
- Claude Code CLI
- Audio playback: `afplay` (macOS), `paplay` (Linux), or PowerShell (Windows)

## License

MIT
