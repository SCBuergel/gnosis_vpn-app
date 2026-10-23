/** Clicks within this window count together; the gesture is quick taps, not a slow habit. */
const REVEAL_CLICKS = 7;
const REVEAL_WINDOW_MS = 2000;

/**
 * Seven quick clicks run `onReveal`: a hidden way to show component versions
 * for a support report without cluttering the screen for everyone else.
 */
export function createSecretReveal(onReveal: () => void): () => void {
  let count = 0;
  let lastAt = 0;
  return () => {
    const now = Date.now();
    count = now - lastAt > REVEAL_WINDOW_MS ? 1 : count + 1;
    lastAt = now;
    if (count >= REVEAL_CLICKS) {
      onReveal();
      count = 0;
    }
  };
}
