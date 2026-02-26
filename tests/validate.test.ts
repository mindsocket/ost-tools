import { beforeAll, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { readOstOnAPage } from '../src/read-ost-on-a-page.js';
import { readSpace } from '../src/read-space.js';
import type { OstNode } from '../src/types.js';

const SCHEMA_PATH = join(import.meta.dir, '../schema.json');
const VALID_DIR = join(import.meta.dir, 'fixtures/valid-ost');
const INVALID_DIR = join(import.meta.dir, 'fixtures/invalid-ost');
const VALID_PAGE = join(import.meta.dir, 'fixtures/on-a-page-valid.md');

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
const ajv = new Ajv();
const validateNode = ajv.compile(schema);

/**
 * Inline ref-check helper — mirrors the logic in validate.ts.
 * Indexes by data.title (resolved title). Anchor refs use node.sourceFile.
 */
function checkRefErrors(nodes: OstNode[]): Array<{ file: string; parent: string }> {
  const index = new Set(nodes.map((n) => n.data.title as string));

  for (const n of nodes) {
    if (n.data.anchor && n.sourceFile) {
      index.add(`${n.sourceFile}#^${n.data.anchor}`);
    }
  }

  return nodes
    .filter((n) => n.data.parent)
    .filter((n) => {
      const parentKey = (n.data.parent as string).slice(2, -2);
      return !index.has(parentKey);
    })
    .map((n) => ({ file: n.label, parent: n.data.parent as string }));
}

describe('Schema validation', () => {
  describe('valid-ost nodes (readSpace)', () => {
    let nodes: OstNode[];

    beforeAll(async () => {
      ({ nodes } = await readSpace(VALID_DIR));
    });

    it('all 12 nodes pass schema validation', () => {
      expect(nodes).toHaveLength(12);
      for (const node of nodes) {
        expect(validateNode(node.data)).toBe(true);
      }
    });

    it('has zero ref errors', () => {
      expect(checkRefErrors(nodes)).toHaveLength(0);
    });
  });

  describe('on-a-page-valid.md nodes (readOstOnAPage)', () => {
    let nodes: OstNode[];

    beforeAll(() => {
      ({ nodes } = readOstOnAPage(VALID_PAGE));
    });

    it('all nodes pass schema validation', () => {
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) {
        expect(validateNode(node.data)).toBe(true);
      }
    });
  });

  describe('invalid-ost nodes (readSpace)', () => {
    let nodes: OstNode[];

    beforeAll(async () => {
      ({ nodes } = await readSpace(INVALID_DIR));
    });

    it('missing-status.md fails schema validation (no status field)', () => {
      const node = nodes.find((n) => n.label === 'missing-status.md');
      expect(node).toBeDefined();
      expect(validateNode(node?.data)).toBe(false);
    });

    it('vision-with-parent.md fails schema validation (vision forbids parent)', () => {
      const node = nodes.find((n) => n.label === 'vision-with-parent.md');
      expect(node).toBeDefined();
      expect(validateNode(node?.data)).toBe(false);
    });

    it('dangling-parent.md passes schema validation (ref is a separate check)', () => {
      const node = nodes.find((n) => n.label === 'dangling-parent.md');
      expect(node).toBeDefined();
      expect(validateNode(node?.data)).toBe(true);
    });

    it('detects dangling parent ref error for Nonexistent Node', () => {
      const refErrors = checkRefErrors(nodes);
      expect(refErrors.some((e) => e.parent === '[[Nonexistent Node]]')).toBe(true);
    });
  });

  describe('cross-file anchor ref resolution', () => {
    it('resolves [[file#^anchor]] to the embedded node with that anchor', () => {
      // Represents what readSpace produces from anchor_vision.md + a sibling file
      const nodes: OstNode[] = [
        {
          label: 'anchor_vision.md',
          data: { title: 'anchor_vision', type: 'vision', status: 'active' },
        },
        {
          label: 'Another Goal',
          sourceFile: 'anchor_vision',
          data: {
            title: 'Another Goal',
            type: 'goal',
            status: 'identified',
            anchor: 'goal1',
            parent: '[[Our Mission]]',
          },
        },
        {
          label: 'Our Mission',
          sourceFile: 'anchor_vision',
          data: {
            title: 'Our Mission',
            type: 'mission',
            status: 'identified',
            anchor: 'mission',
            parent: '[[anchor_vision]]',
          },
        },
        {
          label: 'some-solution.md',
          data: {
            title: 'some-solution',
            type: 'solution',
            status: 'identified',
            parent: '[[anchor_vision#^goal1]]',
          },
        },
      ];

      expect(checkRefErrors(nodes)).toHaveLength(0);
    });

    it('reports error when anchor-based wikilink points to nonexistent anchor', () => {
      const nodes: OstNode[] = [
        {
          label: 'anchor_vision.md',
          data: { title: 'anchor_vision', type: 'vision', status: 'active' },
        },
        {
          label: 'some-solution.md',
          data: {
            title: 'some-solution',
            type: 'solution',
            status: 'identified',
            parent: '[[anchor_vision#^noanchor]]',
          },
        },
      ];

      const errors = checkRefErrors(nodes);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.parent).toBe('[[anchor_vision#^noanchor]]');
    });
  });

  describe('schema shape assertions (inline data)', () => {
    it('accepts a valid vision node', () => {
      expect(validateNode({ title: 'My Vision', type: 'vision', status: 'active' })).toBe(true);
    });

    it('rejects vision with a parent field', () => {
      expect(
        validateNode({
          title: 'V',
          type: 'vision',
          status: 'active',
          parent: '[[Y]]',
        }),
      ).toBe(false);
    });

    it('rejects an unknown status enum value', () => {
      expect(validateNode({ title: 'G', type: 'goal', status: 'unknown-value' })).toBe(false);
    });

    it('rejects priority p5 (not in enum)', () => {
      expect(
        validateNode({
          title: 'G',
          type: 'goal',
          status: 'active',
          priority: 'p5',
        }),
      ).toBe(false);
    });

    it('rejects impact score greater than 5', () => {
      expect(
        validateNode({
          title: 'O',
          type: 'opportunity',
          status: 'active',
          impact: 6,
        }),
      ).toBe(false);
    });

    it('rejects parent that is not a wikilink', () => {
      expect(
        validateNode({
          title: 'M',
          type: 'mission',
          status: 'active',
          parent: 'Not A Wikilink',
        }),
      ).toBe(false);
    });

    it('accepts mission with filename#section wikilink as parent', () => {
      expect(
        validateNode({
          title: 'M',
          type: 'mission',
          status: 'active',
          parent: '[[vision_page#Our Mission]]',
        }),
      ).toBe(true);
    });

    it('accepts goal with anchor-based wikilink as parent', () => {
      expect(
        validateNode({
          title: 'G',
          type: 'goal',
          status: 'active',
          parent: '[[vision_page#^mission]]',
        }),
      ).toBe(true);
    });
  });
});
