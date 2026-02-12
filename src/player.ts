import fs from 'node:fs';
// @ts-expect-error no types for play-sound
import playSound from 'play-sound';

const player = playSound();

/** Pick a random element from an array */
export function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Play a single sound file. Silently fails if file missing or playback errors. */
export function play(filePath: string): Promise<void> {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      resolve();
      return;
    }

    player.play(filePath, (err: Error & { killed?: boolean }) => {
      if (err && err.killed !== true) {
        // Silently fail — don't block Claude
      }
      resolve();
    });
  });
}

/** Pick a random sound from a list of file paths and play it */
export function playRandom(filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return Promise.resolve();
  return play(randomElement(filePaths));
}
