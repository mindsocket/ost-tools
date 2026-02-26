import { beforeAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { readSpace } from '../src/read-space.js';
import type { SpaceReadResult } from '../src/types.js';

const VALID_DIR = join(import.meta.dir, 'fixtures/valid-ost');
const INVALID_DIR = join(import.meta.dir, 'fixtures/invalid-ost');

describe('readSpace', () => {
  describe('valid-ost directory', () => {
    let result: SpaceReadResult;

    beforeAll(async () => {
      result = await readSpace(VALID_DIR);
    });

    it('returns 12 OST nodes (5 original + vision_page + 2 embedded + solution_page + anchor_vision + 2 embedded)', () => {
      expect(result.nodes).toHaveLength(12);
    });

    it('injects title from filename for file-based nodes', () => {
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

    it('Community OST.md (ost_on_a_page) is excluded from nodes', () => {
      expect(result.nodes.every((n) => n.label !== 'Community OST.md')).toBe(true);
    });

    it('Community OST.md does not appear in skipped or nonOst', () => {
      expect(result.skipped.includes('Community OST.md')).toBe(false);
      expect(result.nonOst.includes('Community OST.md')).toBe(false);
    });
  });

  describe('embedded nodes in typed pages', () => {
    let result: SpaceReadResult;

    beforeAll(async () => {
      result = await readSpace(VALID_DIR);
    });

    it('includes vision_page.md as its own node', () => {
      const node = result.nodes.find((n) => n.label === 'vision_page.md');
      expect(node).toBeDefined();
      expect(node?.data.type).toBe('vision');
      expect(node?.data.title).toBe('vision_page');
    });

    it('extracts embedded mission with plain title', () => {
      const node = result.nodes.find((n) => n.label === 'Embedded Mission');
      expect(node).toBeDefined();
      expect(node?.data.type).toBe('mission');
      expect(node?.data.title).toBe('Embedded Mission');
    });

    it('embedded mission parent points to the containing page', () => {
      const node = result.nodes.find((n) => n.label === 'Embedded Mission');
      expect(node?.data.parent).toBe('[[vision_page]]');
    });

    it('stores anchor on embedded mission node', () => {
      const node = result.nodes.find((n) => n.label === 'Embedded Mission');
      expect(node?.data.anchor).toBe('embmission');
    });

    it('sets sourceFile on embedded nodes', () => {
      const node = result.nodes.find((n) => n.label === 'Embedded Mission');
      expect(node?.sourceFile).toBe('vision_page');
    });

    it('extracts nested embedded goal with plain title', () => {
      const node = result.nodes.find((n) => n.label === 'Embedded Goal');
      expect(node).toBeDefined();
      expect(node?.data.type).toBe('goal');
    });

    it('embedded goal parent points to the embedded mission by plain title', () => {
      const node = result.nodes.find((n) => n.label === 'Embedded Goal');
      expect(node?.data.parent).toBe('[[Embedded Mission]]');
    });

    it('solution_page.md references embedded goal as parent by plain title', () => {
      const node = result.nodes.find((n) => n.label === 'solution_page.md');
      expect(node?.data.parent).toBe('[[Embedded Goal]]');
    });
  });

  describe('anchor-implied type inference', () => {
    let result: SpaceReadResult;

    beforeAll(async () => {
      result = await readSpace(VALID_DIR);
    });

    it('infers type "mission" from ^mission anchor', () => {
      const node = result.nodes.find((n) => n.label === 'Our Mission');
      expect(node?.data.type).toBe('mission');
      expect(node?.data.title).toBe('Our Mission');
    });

    it('infers type "goal" from ^goal1 anchor', () => {
      const node = result.nodes.find((n) => n.label === 'Another Goal');
      expect(node?.data.type).toBe('goal');
      expect(node?.data.title).toBe('Another Goal');
    });

    it('stores anchors on anchor-typed nodes', () => {
      expect(result.nodes.find((n) => n.label === 'Our Mission')?.data.anchor).toBe('mission');
      expect(result.nodes.find((n) => n.label === 'Another Goal')?.data.anchor).toBe('goal1');
    });

    it('does not include untyped preamble heading as a node', () => {
      expect(result.nodes.map((n) => n.label)).not.toContain('Preamble (ignored)');
    });

    it('sets sourceFile on anchor-typed embedded nodes', () => {
      const node = result.nodes.find((n) => n.label === 'Another Goal');
      expect(node?.sourceFile).toBe('anchor_vision');
    });
  });

  describe('invalid-ost directory', () => {
    it('returns all 3 nodes regardless of schema validity', async () => {
      const result = await readSpace(INVALID_DIR);
      expect(result.nodes).toHaveLength(3);
    });
  });
});
