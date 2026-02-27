import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { extractEmbeddedNodes } from './parse-embedded.js';
import { resolveParentLinks } from './resolve-links.js';
import type { OstNode, SpaceReadResult } from './types.js';

export async function readSpace(
  directory: string,
  options?: { includeOnAPageFiles?: boolean },
): Promise<SpaceReadResult> {
  const files = await glob('**/*.md', { cwd: directory, absolute: false });
  const nodes: OstNode[] = [];
  const skipped: string[] = [];
  const nonOst: string[] = [];

  for (const file of files) {
    const content = readFileSync(join(directory, file), 'utf-8');
    const parsed = matter(content);

    if (!parsed.data || Object.keys(parsed.data).length === 0) {
      skipped.push(file);
      continue;
    }

    if (!parsed.data.type) {
      nonOst.push(file);
      continue;
    }

    if (parsed.data.type === 'ost_on_a_page' && !options?.includeOnAPageFiles) {
      continue;
    }

    const pageType = parsed.data.type as string;
    const fileBase = basename(file, '.md');

    nodes.push({
      label: file,
      schemaData: { title: fileBase, ...parsed.data },
      linkTargets: [fileBase],
    });

    // Extract embedded child nodes from the page body (typed pages with embedded nodes).
    // ost_on_a_page files are already excluded above.
    if (pageType !== 'ost_on_a_page') {
      const { nodes: embedded } = extractEmbeddedNodes(parsed.content, {
        pageTitle: fileBase,
        pageType,
      });
      nodes.push(...embedded);
    }
  }

  resolveParentLinks(nodes);
  return { nodes, skipped, nonOst };
}
