import { beforeAll, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { readOstOnAPage } from '../src/read-ost-on-a-page.js';
import { readSpace } from '../src/read-space.js';
import { resolveParentLinks } from '../src/resolve-links.js';
import type { OstNode } from '../src/types.js';

const SCHEMA_PATH = join(import.meta.dir, '../schema.json');
const VALID_DIR = join(import.meta.dir, 'fixtures/valid-ost');
const INVALID_DIR = join(import.meta.dir, 'fixtures/invalid-ost');
const VALID_PAGE = join(import.meta.dir, 'fixtures/on-a-page-valid.md');

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
const ajv = new Ajv();
const validateNode = ajv.compile(schema);

/** Inline ref-check helper - mirrors the logic in validate.ts. */
function checkRefErrors(nodes: OstNode[]): Array<{ file: string; parent: string }> {
  const index = new Set(nodes.map((n) => n.schemaData.title as string));

  return nodes
    .filter((n) => n.schemaData.parent)
    .filter((n) => {
      const parentKey = n.resolvedParent;
      if (!parentKey) return true;
      return !index.has(parentKey);
    })
    .map((n) => ({ file: n.label, parent: n.schemaData.parent as string }));
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
        expect(validateNode(node.schemaData)).toBe(true);
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
        expect(validateNode(node.schemaData)).toBe(true);
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
      expect(validateNode(node?.schemaData)).toBe(false);
    });

    it('vision-with-parent.md fails schema validation (vision forbids parent)', () => {
      const node = nodes.find((n) => n.label === 'vision-with-parent.md');
      expect(node).toBeDefined();
      expect(validateNode(node?.schemaData)).toBe(false);
    });

    it('dangling-parent.md passes schema validation (ref is a separate check)', () => {
      const node = nodes.find((n) => n.label === 'dangling-parent.md');
      expect(node).toBeDefined();
      expect(validateNode(node?.schemaData)).toBe(true);
    });

    it('detects dangling parent ref error for Nonexistent Node', () => {
      const refErrors = checkRefErrors(nodes);
      expect(refErrors.some((e) => e.parent === '[[Nonexistent Node]]')).toBe(true);
    });
  });

  describe('link-target parent resolution', () => {
    it('resolves anchor/section wikilinks to canonical parent titles', () => {
      const nodes: OstNode[] = [
        {
          label: 'anchor_vision.md',
          schemaData: { title: 'anchor_vision', type: 'vision', status: 'active' },
          linkTargets: ['anchor_vision'],
        },
        {
          label: 'Our Mission',
          schemaData: {
            title: 'Our Mission',
            type: 'mission',
            status: 'identified',
            parent: '[[anchor_vision]]',
          },
          linkTargets: ['anchor_vision#Our Mission mission', 'anchor_vision#^mission'],
        },
        {
          label: 'Another Goal',
          schemaData: {
            title: 'Another Goal',
            type: 'goal',
            status: 'identified',
            parent: '[[anchor_vision#^mission]]',
          },
          linkTargets: ['anchor_vision#Another Goal goal1', 'anchor_vision#^goal1'],
        },
        {
          label: 'solution_page.md',
          schemaData: {
            title: 'solution_page',
            type: 'solution',
            status: 'identified',
            parent: '[[anchor_vision#^goal1]]',
          },
          linkTargets: ['solution_page'],
        },
      ];

      resolveParentLinks(nodes);

      expect(nodes.find((n) => n.label === 'Another Goal')?.schemaData.parent).toBe('[[anchor_vision#^mission]]');
      expect(nodes.find((n) => n.label === 'Another Goal')?.resolvedParent).toBe('Our Mission');
      expect(nodes.find((n) => n.label === 'solution_page.md')?.schemaData.parent).toBe('[[anchor_vision#^goal1]]');
      expect(nodes.find((n) => n.label === 'solution_page.md')?.resolvedParent).toBe('Another Goal');
      expect(checkRefErrors(nodes)).toHaveLength(0);
    });

    it('keeps unresolved parent links untouched when no link target matches', () => {
      const nodes: OstNode[] = [
        {
          label: 'anchor_vision.md',
          schemaData: { title: 'anchor_vision', type: 'vision', status: 'active' },
          linkTargets: ['anchor_vision'],
        },
        {
          label: 'some-solution.md',
          schemaData: {
            title: 'some-solution',
            type: 'solution',
            status: 'identified',
            parent: '[[anchor_vision#^noanchor]]',
          },
          linkTargets: ['some-solution'],
        },
      ];

      resolveParentLinks(nodes);

      const errors = checkRefErrors(nodes);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.parent).toBe('[[anchor_vision#^noanchor]]');
    });

    it('does not resolve bare embedded-node title links when no page exists', () => {
      const nodes: OstNode[] = [
        {
          label: 'vision_page.md',
          schemaData: { title: 'vision_page', type: 'vision', status: 'active' },
          linkTargets: ['vision_page'],
        },
        {
          label: 'Embedded Goal',
          schemaData: {
            title: 'Embedded Goal',
            type: 'goal',
            status: 'identified',
            parent: '[[vision_page]]',
          },
          linkTargets: ['vision_page#Embedded Goal'],
        },
        {
          label: 'solution_page.md',
          schemaData: {
            title: 'solution_page',
            type: 'solution',
            status: 'identified',
            parent: '[[Embedded Goal]]',
          },
          linkTargets: ['solution_page'],
        },
      ];

      resolveParentLinks(nodes);

      expect(nodes.find((n) => n.label === 'solution_page.md')?.resolvedParent).toBeUndefined();
      const errors = checkRefErrors(nodes);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.parent).toBe('[[Embedded Goal]]');
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
