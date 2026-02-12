# claude-persona
![claude-persona.png](claude-persona.png)

Sound effects **and a speaking personality** for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions. Hear audio feedback when Claude starts a task, finishes responding, hits an error, detects user mood — and have Claude respond in character with short in-character quips.

Ships with Warcraft 3 peasant and Arthas (Paladin) personas. Easily create your own with custom sounds, personality, and situational speeches.

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

That's it. Start a Claude Code session and you'll hear sounds and see in-character responses.

## How It Works

claude-persona installs [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) that play audio clips when specific events happen during a session.

For project installs, it also writes persona instructions to `.claude/persona/PERSONA.md` and `.claude/persona/PERSONA_FLAGS.md`, referenced from your `CLAUDE.md` via `@import`. These teach Claude the persona's speaking style and situational speeches.

Each persona is a self-contained directory with a `persona.json` config and a `sounds/` folder:

```
peasant/
├── persona.json
└── sounds/
    ├── done.mp3
    ├── yes-milord.wav
    └── ...
```

## Persona Config

Each persona has a `persona.json`:

```json
{
  "name": "peasant",
  "description": "Warcraft 3 Human Peasant — humble, overworked, comically downtrodden worker unit",
  "personality": "You are a humble Warcraft 3 Human Peasant — an overworked laborer...",
  "situations": [
    {
      "name": "task-complete",
      "trigger": "Stop",
      "description": "Claude finished responding",
      "sounds": ["done.mp3", "im-ready.wav"],
      "speech": ["Job's done.", "All finished, milord."]
    }
  ]
}
```

### Config fields

| Field | Description |
|---|---|
| `name` | Display name of the persona |
| `description` | Human-readable description |
| `personality` | _(optional)_ Instructions for Claude's speaking style — written to PERSONA.md |
| `situations` | Array of situations that trigger sounds and/or speeches |

### Situation fields

| Field | Description |
|---|---|
| `name` | Unique identifier. For `flag` triggers, this becomes the flag name. |
| `trigger` | What fires this situation (see trigger types below). |
| `description` | Human-readable description. For flag triggers, this is the instruction Claude sees. |
| `sounds` | Array of filenames in the persona's `sounds/` directory. A random one is picked each time. |
| `speech` | _(optional)_ Array of short in-character lines Claude may weave into its response. |

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
| `flag` | Detected via `<!-- persona:<name> -->` in Claude's response (see below) |
| `spam` | User sending 3+ prompts within 15 seconds (overrides `UserPromptSubmit`) |

Any [Claude Code hook event](https://docs.anthropic.com/en/docs/claude-code/hooks) can be used as a trigger.

### Personality & Speech

The `personality` field defines Claude's overall speaking style. It's written to `.claude/persona/PERSONA.md` and imported into your project's `CLAUDE.md`. Write it as a direct instruction to Claude:

```json
"personality": "You are Prince Arthas, Paladin of the Silver Hand. You speak with noble conviction and righteous determination. You see coding tasks as quests and bugs as enemies to vanquish. Keep it measured: a paladin remark occasionally, not every line."
```

The `speech` field on each situation provides specific short lines Claude can use when that situation occurs. Claude picks one at random and weaves it naturally into its response:

```json
{
  "name": "tool-failed",
  "trigger": "PostToolUseFailure",
  "description": "A tool call failed",
  "sounds": ["error.wav"],
  "speech": [
    "Can't build there.",
    "We're in trouble.",
    "Something's not right here."
  ]
}
```

Both fields are optional — you can have sounds-only, text-only, or both.

### Flag situations

Situations with `"trigger": "flag"` are the most powerful trigger type. Claude reads the conversation context — both its own response and the user's input — and inserts an invisible HTML comment flag when a situation applies. The hook system detects it from the transcript and plays the corresponding sound.

Flags work for two categories of detection:

**Response self-detection** — Claude detects something about its own output:

```json
{
  "name": "found-bug",
  "trigger": "flag",
  "description": "Claude found or fixed a bug",
  "sounds": ["we-caught-a-witch.wav"],
  "speech": ["Bug squashed, milord.", "Caught it!"]
}
```

**User sentiment detection** — Claude detects the user's mood from their message:

```json
{
  "name": "user-angry",
  "trigger": "flag",
  "description": "User is frustrated, angry, or unhappy with the result",
  "sounds": ["sorry.wav"],
  "speech": ["I'll do better, milord, I swear!", "Please don't hit me..."]
}
```

You can add any custom flag situations — just add an entry with `"trigger": "flag"` and a clear `description`. Some ideas:

```json
{"name": "user-confused", "trigger": "flag", "description": "User seems confused or is asking for clarification", "sounds": ["hmm.wav"]}
{"name": "user-excited",  "trigger": "flag", "description": "User is excited or enthusiastic about something", "sounds": ["woohoo.wav"]}
{"name": "big-refactor",  "trigger": "flag", "description": "Claude is about to perform a large-scale refactoring", "sounds": ["epic.wav"]}
{"name": "tests-passing", "trigger": "flag", "description": "All tests are passing after a fix", "sounds": ["victory.wav"]}
```

## CLI Commands

```bash
claude-persona init --global               # Install globally
claude-persona init --project              # Install for current project
claude-persona init --project --persona X  # Skip picker, install persona X
claude-persona use                         # Switch active persona (interactive)
claude-persona use <name>                  # Switch to a persona (auto-installs if bundled)
claude-persona add <source>               # Install a persona (alias: install)
claude-persona install <source>           # Same as add
claude-persona test                        # List all situations
claude-persona test task-complete          # Play a random sound for "task-complete"
claude-persona uninstall --global          # Remove global hooks
claude-persona uninstall --project         # Remove project hooks
claude-persona uninstall --project --purge # Full removal (hooks + sounds + config)
```

### Sources for `add` / `install`

```bash
# Bundled persona by name
npx claude-persona add peasant
npx claude-persona install arthas

# Local directory
npx claude-persona add ./my-persona/

# GitHub repo
npx claude-persona add github:username/my-persona
```

## Managing Personas

### Switching personas

After installation, switch between installed personas:

```bash
# Interactive picker (shows installed + available bundled personas)
npx claude-persona use

# Or specify directly (auto-installs from bundled if not yet installed)
npx claude-persona use arthas
```

This updates the active persona, re-registers hooks, and updates CLAUDE.md instructions.

### Installing additional personas

```bash
# Install a bundled persona
npx claude-persona add peasant

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

This removes all hooks from your Claude settings and cleans up CLAUDE.md references. Your sounds and config are kept in case you want to re-install later.

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
       ├── error.wav
       └── calm-down.wav
   ```

2. Write `persona.json`:
   ```json
   {
     "name": "my-character",
     "description": "My custom persona",
     "personality": "You are a grumpy but talented dwarf blacksmith. You grumble about everything but always deliver excellent work. Slip in forge metaphors when it feels natural.",
     "situations": [
       {
         "name": "task-complete",
         "trigger": "Stop",
         "description": "Claude finished responding",
         "sounds": ["done.mp3"],
         "speech": ["Another fine piece off the anvil.", "There. Done. Happy now?"]
       },
       {
         "name": "error",
         "trigger": "PostToolUseFailure",
         "description": "Something went wrong",
         "sounds": ["error.wav"],
         "speech": ["Bah! The metal warped.", "That's not right..."]
       },
       {
         "name": "user-angry",
         "trigger": "flag",
         "description": "User is frustrated, angry, or unhappy with the result",
         "sounds": ["calm-down.wav"],
         "speech": ["Aye, aye, I'll fix it. Keep yer beard on."]
       },
       {
         "name": "user-grateful",
         "trigger": "flag",
         "description": "User is expressing gratitude or satisfaction",
         "sounds": ["hello.wav"],
         "speech": ["Don't get all mushy on me.", "Just doing me job."]
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
