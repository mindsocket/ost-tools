import { beforeAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { readSpace } from '../src/read-space.js';
import type { SpaceReadResult } from '../src/types.js';

const VALID_DIR = join(import.meta.dir, 'fixtures/valid-ost');
const INVALID_DIR = join(import.meta.dir, 'fixtures/invalid-ost');

describe('readSpace', () => {
  describe('valid-ost directory (default options)', () => {
    let result: SpaceReadResult;

    beforeAll(async () => {
      result = await readSpace(VALID_DIR);
    });

    it('returns 5 OST nodes', () => {
      expect(result.nodes).toHaveLength(5);
    });

    it('injects title from filename', () => {
      const vision = result.nodes.find((n) => n.label === 'Personal Vision.md');
      expect(vision?.data.title).toBe('Personal Vision');
    });

    it('skips no-frontmatter.md', () => {
      expect(result.skipped).toContain('no-frontmatter.md');
    });

    it('puts meeting-notes.md in nonOst', () => {
      expect(result.nonOst).toContain('meeting-notes.md');
    });

    it('skipped files do not appear in nodes', () => {
      expect(result.nodes.every((n) => n.label !== 'no-frontmatter.md')).toBe(true);
    });

    it('nonOst files do not appear in nodes', () => {
      expect(result.nodes.every((n) => n.label !== 'meeting-notes.md')).toBe(true);
    });

    it('preserves numeric frontmatter fields on Technical Skills', () => {
      const ts = result.nodes.find((n) => n.label === 'Technical Skills.md');
      expect(ts?.data.impact).toBe(4);
      expect(ts?.data.feasibility).toBe(3);
      expect(ts?.data.resources).toBe(2);
      expect(ts?.data.priority).toBe('p3');
    });

    it('excludes Community OST.md by default (type: ost_on_a_page)', () => {
      expect(result.nodes.every((n) => n.label !== 'Community OST.md')).toBe(true);
    });

    it('Community OST.md does not appear in skipped or nonOst', () => {
      expect(result.skipped.includes('Community OST.md')).toBe(false);
      expect(result.nonOst.includes('Community OST.md')).toBe(false);
    });
  });

  it('includes ost_on_a_page nodes when includePageFiles is true', async () => {
    const result = await readSpace(VALID_DIR, { includePageFiles: true });
    expect(result.nodes.find((n) => n.label === 'Community OST.md')).toBeDefined();
    expect(result.nodes).toHaveLength(6);
  });

  describe('invalid-ost directory', () => {
    it('returns all 3 nodes regardless of schema validity', async () => {
      const result = await readSpace(INVALID_DIR);
      expect(result.nodes).toHaveLength(3);
    });
  });
});
