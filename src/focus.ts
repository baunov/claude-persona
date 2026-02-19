/**
 * Focus-aware volume control.
 *
 * Detects whether the current process is running in the frontmost terminal.
 * If so → full volume (1.0). If not → background volume (0.6).
 * On unsupported platforms or errors → defaults to full volume.
 */

import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BACKGROUND_VOLUME = 0.6;
const EXEC_TIMEOUT_MS = 1500;

/**
 * Get the PID of the frontmost application.
 * - macOS: osascript
 * - Linux (X11): xdotool
 * - Other: null
 */
function getFrontmostPid(): number | null {
  try {
    if (process.platform === 'darwin') {
      const script =
        'tell application "System Events" to unix id of first application process whose frontmost is true';
      const out = execFileSync('osascript', ['-e', script], {
        encoding: 'utf8',
        timeout: EXEC_TIMEOUT_MS,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const pid = parseInt(out.trim(), 10);
      return Number.isFinite(pid) ? pid : null;
    }

    if (process.platform === 'linux') {
      const winId = execFileSync('xdotool', ['getactivewindow'], {
        encoding: 'utf8',
        timeout: EXEC_TIMEOUT_MS,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const out = execFileSync('xdotool', ['getwindowpid', winId], {
        encoding: 'utf8',
        timeout: EXEC_TIMEOUT_MS,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const pid = parseInt(out, 10);
      return Number.isFinite(pid) ? pid : null;
    }
  } catch {
    // Command not available or failed — fall through
  }

  return null;
}

/**
 * Get the parent PID of a given PID. Works on macOS and Linux.
 */
function getParentPid(pid: number): number | null {
  try {
    const out = execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: EXEC_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const ppid = parseInt(out.trim(), 10);
    return Number.isFinite(ppid) && ppid > 0 ? ppid : null;
  } catch {
    return null;
  }
}

/**
 * Walk the process tree from `startPid` upward looking for `ancestorPid`.
 * Returns true if ancestorPid is found in the chain (max 20 hops).
 */
function isAncestor(startPid: number, ancestorPid: number): boolean {
  let current = startPid;
  for (let i = 0; i < 20; i++) {
    if (current === ancestorPid) return true;
    const parent = getParentPid(current);
    if (parent === null || parent === current) return false;
    current = parent;
  }
  return false;
}

/**
 * Walk up from current process to find the terminal application PID.
 * This is stored so the nag-worker (a detached process) can check later.
 *
 * We walk up until we find a process whose parent is PID 1 (launchd/init),
 * which is typically the terminal emulator itself.
 */
export function getTerminalAppPid(): number | null {
  try {
    let current = process.pid;
    let previous = current;
    for (let i = 0; i < 20; i++) {
      const parent = getParentPid(current);
      if (parent === null || parent === current) return previous;
      if (parent === 1) return current;
      previous = current;
      current = parent;
    }
    return previous;
  } catch {
    return null;
  }
}

/**
 * Detect volume for the current process based on whether it's in the
 * focused terminal. Returns 1.0 (focused) or 0.6 (background).
 * Defaults to 1.0 on error or unsupported platform.
 */
export function detectVolume(): number {
  try {
    const frontPid = getFrontmostPid();
    if (frontPid === null) return 1.0;

    return isAncestor(process.pid, frontPid) ? 1.0 : BACKGROUND_VOLUME;
  } catch {
    return 1.0;
  }
}

/**
 * Detect volume for a detached process by checking if the given terminal PID
 * matches the frontmost application. Used by the nag-worker.
 */
export function detectVolumeForPid(terminalPid: number | null): number {
  try {
    if (terminalPid === null) return 1.0;

    const frontPid = getFrontmostPid();
    if (frontPid === null) return 1.0;

    return isAncestor(frontPid, terminalPid) || frontPid === terminalPid
      ? 1.0
      : BACKGROUND_VOLUME;
  } catch {
    return 1.0;
  }
}

// ── Async versions (used by handler for non-blocking volume detection) ──

async function getFrontmostPidAsync(): Promise<number | null> {
  try {
    if (process.platform === 'darwin') {
      const script =
        'tell application "System Events" to unix id of first application process whose frontmost is true';
      const { stdout } = await execFileAsync('osascript', ['-e', script], {
        timeout: EXEC_TIMEOUT_MS,
      });
      const pid = parseInt(stdout.trim(), 10);
      return Number.isFinite(pid) ? pid : null;
    }

    if (process.platform === 'linux') {
      const { stdout: winIdOut } = await execFileAsync('xdotool', ['getactivewindow'], {
        timeout: EXEC_TIMEOUT_MS,
      });
      const { stdout: pidOut } = await execFileAsync('xdotool', ['getwindowpid', winIdOut.trim()], {
        timeout: EXEC_TIMEOUT_MS,
      });
      const pid = parseInt(pidOut.trim(), 10);
      return Number.isFinite(pid) ? pid : null;
    }
  } catch {
    // Command not available or failed — fall through
  }

  return null;
}

/**
 * Load entire process tree in a single `ps` call.
 * Returns a Map<pid, ppid> for in-memory ancestry walks.
 */
async function loadProcessTree(): Promise<Map<number, number>> {
  try {
    const { stdout } = await execFileAsync('ps', ['-eo', 'pid,ppid'], {
      timeout: EXEC_TIMEOUT_MS,
    });
    const map = new Map<number, number>();
    for (const line of stdout.trim().split('\n').slice(1)) {
      const [pidStr, ppidStr] = line.trim().split(/\s+/);
      const pid = parseInt(pidStr!, 10);
      const ppid = parseInt(ppidStr!, 10);
      if (Number.isFinite(pid) && Number.isFinite(ppid)) {
        map.set(pid, ppid);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function isAncestorInTree(tree: Map<number, number>, startPid: number, ancestorPid: number): boolean {
  let current = startPid;
  for (let i = 0; i < 20; i++) {
    if (current === ancestorPid) return true;
    const parent = tree.get(current);
    if (parent === undefined || parent === current) return false;
    current = parent;
  }
  return false;
}

/**
 * Async version of detectVolume. Runs osascript + ps concurrently and
 * uses a single `ps -eo pid,ppid` call instead of per-PID walking.
 * ~2 child processes total vs 1 + up to 20 in the sync version.
 */
export async function detectVolumeAsync(): Promise<number> {
  try {
    const [frontPid, tree] = await Promise.all([
      getFrontmostPidAsync(),
      loadProcessTree(),
    ]);
    if (frontPid === null) return 1.0;

    return isAncestorInTree(tree, process.pid, frontPid) ? 1.0 : BACKGROUND_VOLUME;
  } catch {
    return 1.0;
  }
}

// Exported for testing
export { getFrontmostPid, getParentPid, isAncestor, BACKGROUND_VOLUME, getFrontmostPidAsync, loadProcessTree, isAncestorInTree };
