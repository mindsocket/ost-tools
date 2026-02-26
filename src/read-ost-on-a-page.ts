import { readFileSync } from 'node:fs';
import matter from 'gray-matter';
import { extractEmbeddedNodes } from './parse-embedded.js';
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

  const { nodes, diagnostics } = extractEmbeddedNodes(body);
  return { nodes, diagnostics };
}
