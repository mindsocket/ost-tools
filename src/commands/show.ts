import { statSync } from 'node:fs';
import { readSpaceDirectory } from '../read-space-directory';
import { readSpaceOnAPage } from '../read-space-on-a-page';
import type { SpaceNode } from '../types';

export async function show(path: string) {
  let nodes: SpaceNode[];

  if (statSync(path).isFile()) {
    ({ nodes } = readSpaceOnAPage(path));
  } else {
    ({ nodes } = await readSpaceDirectory(path));
  }

  // Build children map (parent title → child nodes in document order)
  const children = new Map<string, SpaceNode[]>();
  for (const node of nodes) {
    children.set(node.schemaData.title as string, []);
  }

  const roots: SpaceNode[] = [];
  for (const node of nodes) {
    const parent = node.resolvedParent;
    if (!parent) {
      roots.push(node);
    } else {
      const siblings = children.get(parent);
      if (siblings) {
        siblings.push(node);
      } else {
        roots.push(node); // dangling parent — surface as root
      }
    }
  }

  function printNode(node: SpaceNode, depth: number) {
    const indent = '  '.repeat(depth);
    const type = node.schemaData.type as string;
    const title = node.schemaData.title as string;
    console.log(`${indent}- ${type}: ${title}`);
    for (const child of children.get(title) ?? []) {
      printNode(child, depth + 1);
    }
  }

  for (const root of roots) {
    printNode(root, 0);
  }
}
