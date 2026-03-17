import { resolve } from 'node:path';
import { loadConfig, resolveSchema } from '../config';
import { readSpace } from '../read/read-space';
import { loadMetadata } from '../schema/schema';
import type { SpaceNode } from '../types';
import { classifyNodes } from '../util/graph-helpers';

export async function show(path: string) {
  const absolutePath = resolve(path);
  const config = loadConfig();
  const space = config.spaces.find((s) => resolve(s.path) === absolutePath);
  const resolvedSchemaPath = resolveSchema(undefined, config, space);
  const metadata = loadMetadata(resolvedSchemaPath);
  const levels = metadata.hierarchy?.levels ?? [];

  const { nodes } = await readSpace(absolutePath);

  const { hierarchyRoots, orphans, nonHierarchy, children } = classifyNodes(nodes, levels);

  const seen = new Set<string>();

  function printNode(node: SpaceNode, depth: number) {
    const indent = '  '.repeat(depth);
    const type = node.schemaData.type as string;
    const title = node.schemaData.title as string;
    const nodeChildren = children.get(title) ?? [];

    if (seen.has(title)) {
      // Only mark (*) when there's a subtree being skipped — no marker if no children
      if (nodeChildren.length > 0) {
        console.log(`${indent}- ${type}: ${title} (*)`);
      }
      return;
    }
    seen.add(title);
    console.log(`${indent}- ${type}: ${title}`);
    for (const child of nodeChildren) {
      printNode(child, depth + 1);
    }
  }

  // Main hierarchy tree
  for (const root of hierarchyRoots) {
    printNode(root, 0);
  }

  // Orphans: in hierarchy but no parent
  if (orphans.length > 0) {
    console.log('\nOrphans (missing parent):');
    for (const node of orphans) {
      printNode(node, 0);
    }
  }

  // Non-hierarchy types: flat list at the end
  if (nonHierarchy.length > 0) {
    console.log('\nOther (not in hierarchy):');
    for (const node of nonHierarchy) {
      const type = node.schemaData.type as string;
      const title = node.schemaData.title as string;
      console.log(`  - ${type}: ${title}`);
    }
  }
}
