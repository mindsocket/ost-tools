import { statSync } from 'node:fs';
import { readOstOnAPage } from './read-ost-on-a-page.js';
import { readSpace } from './read-space.js';
import type { OstNode } from './types.js';

export async function show(path: string) {
  let nodes: OstNode[];

  if (statSync(path).isFile()) {
    ({ nodes } = readOstOnAPage(path));
  } else {
    ({ nodes } = await readSpace(path));
  }

  // Build children map (parent title → child nodes in document order)
  const children = new Map<string, OstNode[]>();
  for (const node of nodes) {
    children.set(node.schemaData.title as string, []);
  }

  const roots: OstNode[] = [];
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

  function printNode(node: OstNode, depth: number) {
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
