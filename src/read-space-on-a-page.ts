import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import matter from 'gray-matter';
import { loadConfig, resolveSchema } from './config';
import { extractEmbeddedNodes, ON_A_PAGE_TYPES } from './parse-embedded';
import { resolveParentLinks } from './resolve-links';
import { loadHierarchy } from './schema';
import type { SpaceOnAPageReadResult } from './types';

export function readSpaceOnAPage(filePath: string, schemaPath?: string): SpaceOnAPageReadResult {
  const raw = readFileSync(filePath, 'utf-8');
  const { data: frontmatter, content: body } = matter(raw);

  const pageType = frontmatter.type as string | undefined;
  if (pageType !== undefined && !ON_A_PAGE_TYPES.includes(pageType)) {
    throw new Error(
      `Expected a space_on_a_page file but got type "${pageType}" in ${filePath}. ` +
        `Use a directory path to validate a space containing typed node files.`,
    );
  }

  // Resolve schema and load hierarchy for depth-based type inference
  const config = loadConfig();
  const resolvedSchemaPath = resolveSchema(schemaPath, config);
  const hierarchyArray = loadHierarchy(resolvedSchemaPath);

  const pageTitle = basename(filePath, '.md');
  const { nodes, diagnostics } = extractEmbeddedNodes(body, {
    pageTitle,
    pageType: 'space_on_a_page',
    hierarchy: hierarchyArray,
  });
  resolveParentLinks(nodes);
  return { nodes, diagnostics };
}
