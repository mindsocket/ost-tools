import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import matter from 'gray-matter';
import { extractEmbeddedNodes } from './parse-embedded.js';
import { resolveParentLinks } from './resolve-links.js';
import type { OstOnAPageReadResult } from './types.js';

export function readOstOnAPage(filePath: string): OstOnAPageReadResult {
  const raw = readFileSync(filePath, 'utf-8');
  const { data: frontmatter, content: body } = matter(raw);

  const pageType = frontmatter.type as string | undefined;
  if (pageType && pageType !== 'ost_on_a_page') {
    throw new Error(
      `Expected an ost_on_a_page file but got type "${pageType}" in ${filePath}. ` +
        `Use a directory path to validate a space containing typed node files.`,
    );
  }

  const pageTitle = basename(filePath, '.md');
  const { nodes, diagnostics } = extractEmbeddedNodes(body, { pageTitle, pageType: 'ost_on_a_page' });
  resolveParentLinks(nodes);
  return { nodes, diagnostics };
}
