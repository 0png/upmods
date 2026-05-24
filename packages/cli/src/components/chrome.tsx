import React from 'react';
import { Box, Text } from 'ink';
import { useLanguage } from '../i18n/use-language.js';

export type HotkeyTone = 'primary' | 'success' | 'warning' | 'danger' | 'muted';

export interface HotkeyItem {
  key: string;
  label: string;
  tone?: HotkeyTone;
}

interface ScreenFrameProps {
  title: string;
  subtitle?: string;
  summary?: React.ReactNode;
  hotkeys?: HotkeyItem[];
  children?: React.ReactNode;
}

const TONE_COLORS: Record<HotkeyTone, string> = {
  primary: 'cyan',
  success: 'green',
  warning: 'yellow',
  danger: 'red',
  muted: 'gray',
};

export function ScreenFrame({
  title,
  subtitle,
  summary,
  hotkeys = [],
  children,
}: ScreenFrameProps) {
  return (
    <Box flexDirection="column" paddingY={1}>
      <BrandHeader title={title} subtitle={subtitle} />
      <Box flexDirection="column" marginTop={1}>
        {children}
      </Box>
      {summary ? <SummaryPanel>{summary}</SummaryPanel> : null}
      {hotkeys.length > 0 ? <HotkeyBar items={hotkeys} /> : null}
    </Box>
  );
}

interface BrandHeaderProps {
  title: string;
  subtitle?: string;
}

export function BrandHeader({ title, subtitle }: BrandHeaderProps) {
  const { t } = useLanguage();

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">
          {t.common.brand}
        </Text>
        <Text dimColor>  /  </Text>
        <Text bold>{title}</Text>
      </Box>
      {subtitle ? (
        <Box marginTop={0}>
          <Text dimColor>{subtitle}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

interface SummaryPanelProps {
  children: React.ReactNode;
}

export function SummaryPanel({ children }: SummaryPanelProps) {
  return (
    <Box marginTop={1}>
      <Text color="cyan">{children}</Text>
    </Box>
  );
}

interface HotkeyBarProps {
  items: HotkeyItem[];
}

export function HotkeyBar({ items }: HotkeyBarProps) {
  return (
    <Box marginTop={1} flexWrap="wrap">
      {items.map((item, index) => (
        <Box key={`${item.key}-${item.label}`} marginRight={index === items.length - 1 ? 0 : 2}>
          <Text inverse color={TONE_COLORS[item.tone ?? 'muted']}>
            {' '}
            {item.key}{' '}
          </Text>
          <Text dimColor> {item.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
