import { describe, it, expect } from 'vitest';
import { sanitizeVersionString, SANITIZER_PATTERNS } from './sanitizer.js';

describe('sanitizeVersionString', () => {
  it("'0.5.8+mc1.20.1+fabric' → '0.5.8'", () => {
    expect(sanitizeVersionString('0.5.8+mc1.20.1+fabric')).toBe('0.5.8');
  });

  it("'mc1.21.1-forge' → '[version]'", () => {
    expect(sanitizeVersionString('mc1.21.1-forge')).toBe('[version]');
  });

  it("'1.7.0-beta.4+fabric' → '1.7.0-beta.4'", () => {
    expect(sanitizeVersionString('1.7.0-beta.4+fabric')).toBe('1.7.0-beta.4');
  });

  it("'0.11.2' (no noise) → '0.11.2'", () => {
    expect(sanitizeVersionString('0.11.2')).toBe('0.11.2');
  });

  it("empty string '' → '[version]'", () => {
    expect(sanitizeVersionString('')).toBe('[version]');
  });

  it("'forge-mc1.20.1-1.0.0' → '1.0.0'", () => {
    expect(sanitizeVersionString('forge-mc1.20.1-1.0.0')).toBe('1.0.0');
  });

  it('SANITIZER_PATTERNS is an array of 4 RegExp values', () => {
    expect(Array.isArray(SANITIZER_PATTERNS)).toBe(true);
    expect(SANITIZER_PATTERNS).toHaveLength(4);
    for (const p of SANITIZER_PATTERNS) {
      expect(p).toBeInstanceOf(RegExp);
    }
  });
});
