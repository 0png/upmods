export const SANITIZER_PATTERNS: RegExp[] = [
  /[-+](fabric|forge|neoforge|quilt)/gi,
  /(fabric|forge|neoforge|quilt)[-+]/gi,
  /[-+]?mc\d[\d.]*/gi,
  /for[-_]mc\d[\d.]*/gi,
];

export function sanitizeVersionString(raw: string): string {
  let result = raw;
  for (const pattern of SANITIZER_PATTERNS) {
    result = result.replace(pattern, '');
  }
  result = result.replace(/^[-+_.]+|[-+_.]+$/g, '');
  return result === '' ? '[version]' : result;
}
