export function truncateText(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) return text;
  if (width === 1) return '…';
  return `${text.slice(0, width - 1)}…`;
}

export function fitColumn(text: string, width: number): string {
  return truncateText(text, width).padEnd(width, ' ');
}
