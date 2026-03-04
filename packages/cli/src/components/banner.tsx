import React from 'react';
import { Box, Text } from 'ink';

const BANNER_LINES = [
  ' _   _ ____  __  __  ___  ____  ____',
  '| | | |  _ \\|  \\/  |/ _ \\|  _ \\/ ___|',
  '| | | | |_) | |\\/| | | | | | | \\___ \\',
  '| |_| |  __/| |  | | |_| | |_| |___) |',
  ' \\___/|_|   |_|  |_|\\___/|____/|____/',
];

export default function Banner() {
  return (
    <Box flexDirection="column" alignItems="center">
      {BANNER_LINES.map((line, i) => (
        <Text key={i} bold>
          {line}
        </Text>
      ))}
    </Box>
  );
}
