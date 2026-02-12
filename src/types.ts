/** All Claude Code hook event names that can be used as triggers */
export type HookEvent =
  | 'UserPromptSubmit'
  | 'Stop'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Notification'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'TeammateIdle'
  | 'TaskCompleted'
  | 'PreCompact'
  | 'PermissionRequest';

/** Special trigger types beyond hook events */
export type SpecialTrigger = 'flag' | 'spam';

/** All valid trigger values */
export type TriggerType = HookEvent | SpecialTrigger;

/** A situation that triggers a sound */
export interface Situation {
  /** Unique name, also used as flag identifier for flag triggers */
  name: string;
  /** What triggers this situation */
  trigger: TriggerType;
  /** Human-readable description of when this plays */
  description: string;
  /** Sound filenames (resolved relative to sounds/<persona>/) */
  sounds: string[];
}

/** The user-facing config file */
export interface ClaudePersonaConfig {
  /** Name of the sound pack / character (maps to sounds/<persona>/) */
  persona: string;
  /** All configured situations */
  situations: Situation[];
}

/** JSON payload from Claude Code hooks via stdin */
export interface HookInput {
  session_id: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name: string;
  permission_mode?: string;
  // UserPromptSubmit
  prompt?: string;
  // PreToolUse / PostToolUse / PostToolUseFailure
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: string;
  tool_use_id?: string;
  // Notification
  message?: string;
  title?: string;
  notification_type?: string;
  // SessionStart
  source?: string;
  model?: string;
  // Stop
  stop_hook_active?: boolean;
}

/** Structure of Claude Code settings.json hooks section */
export interface ClaudeHookEntry {
  type: 'command';
  command: string;
  async?: boolean;
  timeout?: number;
}

export interface ClaudeHookMatcher {
  matcher: string;
  hooks: ClaudeHookEntry[];
}

export interface ClaudeSettings {
  hooks?: Record<string, ClaudeHookMatcher[]>;
  [key: string]: unknown;
}

/** CLI handler args parsed from process.argv */
export interface HandlerArgs {
  event: string;
  flags: boolean;
  config: string;
}
