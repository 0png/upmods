import React from 'react';
import { Box, Text, useStdout } from 'ink';

const BANNER_LINES = [
  ' _   _ ____  __  __  ___  ____  ____',
  '| | | |  _ \\|  \\/  |/ _ \\|  _ \\/ ___|',
  '| | | | |_) | |\\/| | | | | | | \\___ \\',
  '| |_| |  __/| |  | | |_| | |_| |___) |',
  ' \\___/|_|   |_|  |_|\\___/|____/|____/',
];

export default function Banner() {
  const { stdout } = useStdout();
  const cols = (stdout as { columns?: number } | undefined)?.columns ?? 80;

  // Compact single-line banner for narrow terminals
  if (cols < 80) {
    return (
      <Box justifyContent="center" paddingY={0}>
        <Text bold color="cyan">UPMODS</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      {BANNER_LINES.map((line, i) => (
        <Text key={i} bold color="cyan">
          {line}
        </Text>
      ))}
    </Box>
  );
}

