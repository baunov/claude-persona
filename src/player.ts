import fs from 'node:fs';
// @ts-expect-error no types for play-sound
import playSound from 'play-sound';

const player = playSound();

/** Pick a random element from an array */
export function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * Build player-specific volume options for play-sound.
 * Each key maps to a supported player's CLI flags for volume control.
 * Returns empty object if volume is 1.0 or undefined (full volume / no change).
 */
export function buildVolumeOpts(volume: number | undefined): Record<string, string[]> {
  if (volume === undefined || volume === 1.0) return {};

  const scaledMpg = Math.round(volume * 32768);

  return {
    afplay: ['-v', String(volume)],
    mpg123: ['-f', String(scaledMpg)],
    mpg321: ['-f', String(scaledMpg)],
    play: ['-v', String(volume)],
    mplayer: ['-volume', String(Math.round(volume * 100))],
  };
}

/** Play a single sound file. Silently fails if file missing or playback errors. */
export function play(filePath: string, volume?: number): Promise<void> {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      resolve();
      return;
    }

    const opts = buildVolumeOpts(volume);
    const args = Object.keys(opts).length > 0 ? [filePath, opts] : [filePath];

    player.play(...args, (err: Error & { killed?: boolean }) => {
      if (err && err.killed !== true) {
        // Silently fail — don't block Claude
      }
      resolve();
    });
  });
}

/** Pick a random sound from a list of file paths and play it */
export function playRandom(filePaths: string[], volume?: number): Promise<void> {
  if (filePaths.length === 0) return Promise.resolve();
  return play(randomElement(filePaths), volume);
}
