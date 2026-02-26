import { beforeAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { readOstPage } from '../src/read-ost-page.js';
import type { OstPageReadResult } from '../src/types.js';

const VALID_PAGE = join(import.meta.dir, 'fixtures/on-a-page-valid.md');
const SKIP_PAGE = join(import.meta.dir, 'fixtures/on-a-page-heading-skip.md');

describe('readOstPage - on-a-page-valid.md', () => {
  let result: OstPageReadResult;

  beforeAll(() => {
    result = readOstPage(VALID_PAGE);
  });

  describe('heading type inference', () => {
    it('infers H1 as vision with no parent', () => {
      const node = result.nodes.find((n) => n.label === 'Personal Vision');
      expect(node?.data.type).toBe('vision');
      expect(node?.data.parent).toBeUndefined();
    });

    it('infers H2 as mission with parent from H1', () => {
      const node = result.nodes.find((n) => n.label === 'Personal Mission');
      expect(node?.data.type).toBe('mission');
      expect(node?.data.parent).toBe('[[Personal Vision]]');
    });

    it('infers H3 as goal with parent from H2', () => {
      const node = result.nodes.find((n) => n.label === 'Career Growth');
      expect(node?.data.type).toBe('goal');
      expect(node?.data.parent).toBe('[[Personal Mission]]');
    });

    it('infers H4 as opportunity with parent from H3', () => {
      const node = result.nodes.find((n) => n.label === 'Technical Skills');
      expect(node?.data.type).toBe('opportunity');
      expect(node?.data.parent).toBe('[[Career Growth]]');
    });

    it('infers H5 as solution with parent from H4', () => {
      const node = result.nodes.find((n) => n.label === 'Build a Side Project');
      expect(node?.data.type).toBe('solution');
      expect(node?.data.parent).toBe('[[Technical Skills]]');
    });
  });

  describe('default status', () => {
    it('applies DEFAULT_STATUS to heading nodes without explicit status', () => {
      const node = result.nodes.find((n) => n.label === 'Build a Side Project');
      expect(node?.data.status).toBe('identified');
    });
  });

  describe('inline bracketed fields', () => {
    it('extracts [priority:: p2] from Career Growth heading and strips it from title', () => {
      const node = result.nodes.find((n) => n.label === 'Career Growth');
      expect(node?.data.priority).toBe('p2');
      expect(node?.data.title).toBe('Career Growth');
    });
  });

  describe('unbracketed paragraph fields', () => {
    it('extracts status:: active on Personal Vision overriding DEFAULT_STATUS', () => {
      const node = result.nodes.find((n) => n.label === 'Personal Vision');
      expect(node?.data.status).toBe('active');
    });
  });

  describe('YAML code block', () => {
    it('merges YAML block fields into Personal Mission', () => {
      const node = result.nodes.find((n) => n.label === 'Personal Mission');
      expect(node?.data.status).toBe('active');
      expect(node?.data.summary).toBe('A mission-level summary set via YAML block');
    });
  });

  describe('typed bullets', () => {
    it('includes Learn TypeScript and Read OSTS Book as nodes', () => {
      const labels = result.nodes.map((n) => n.label);
      expect(labels).toContain('Learn TypeScript');
      expect(labels).toContain('Read OSTS Book');
    });

    it('sets parent and summary on Learn TypeScript from dash separator', () => {
      const node = result.nodes.find((n) => n.label === 'Learn TypeScript');
      expect(node?.data.parent).toBe('[[Technical Skills]]');
      expect(node?.data.summary).toBe('Master TypeScript for tool development');
    });

    it('applies DEFAULT_STATUS to typed bullet without explicit override', () => {
      const node = result.nodes.find((n) => n.label === 'Read OSTS Book');
      expect(node?.data.status).toBe('identified');
    });
  });

  describe('preamble and terminator', () => {
    it('counts at least one preamble node', () => {
      expect(result.diagnostics.preambleNodeCount).toBeGreaterThanOrEqual(1);
    });

    it('records Archived Vision in terminatedHeadings', () => {
      expect(result.diagnostics.terminatedHeadings).toContain('Archived Vision');
    });

    it('does not include Archived Vision in nodes', () => {
      const labels = result.nodes.map((n) => n.label);
      expect(labels).not.toContain('Archived Vision');
    });
  });

  describe('heading level skip error', () => {
    it('throws when heading level is skipped (H1 to H3)', () => {
      expect(() => readOstPage(SKIP_PAGE)).toThrow(/Heading level skipped/);
    });
  });
});
