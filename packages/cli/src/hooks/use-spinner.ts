import { useEffect, useState } from 'react';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;

export function useSpinner(active: boolean): string {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) return;

    const id = setInterval(() => {
      setFrame((current) => (current + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL_MS);

    return () => clearInterval(id);
  }, [active]);

  return SPINNER_FRAMES[frame] ?? '⠋';
}
