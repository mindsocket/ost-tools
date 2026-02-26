import { statSync } from 'node:fs';
import { readOstPage } from './read-ost-page.js';
import { readSpace } from './read-space.js';
import type { OstNode } from './types.js';

export async function show(path: string) {
  let nodes: OstNode[];

  if (statSync(path).isFile()) {
    ({ nodes } = readOstPage(path));
  } else {
    ({ nodes } = await readSpace(path));
  }

  // Build children map (parent title → child nodes in document order)
  const children = new Map<string, OstNode[]>();
  for (const node of nodes) {
    children.set(node.data.title as string, []);
  }

  const roots: OstNode[] = [];
  for (const node of nodes) {
    const parent = node.data.parent as string | undefined;
    if (!parent) {
      roots.push(node);
    } else {
      const parentTitle = parent.replace(/^"|"$/g, '').slice(2, -2);
      const siblings = children.get(parentTitle);
      if (siblings) {
        siblings.push(node);
      } else {
        roots.push(node); // dangling parent — surface as root
      }
    }
  }

  function printNode(node: OstNode, depth: number) {
    const indent = '  '.repeat(depth);
    const type = node.data.type as string;
    const title = node.data.title as string;
    console.log(`${indent}- ${type}: ${title}`);
    for (const child of children.get(title) ?? []) {
      printNode(child, depth + 1);
    }
  }

  for (const root of roots) {
    printNode(root, 0);
  }
}
