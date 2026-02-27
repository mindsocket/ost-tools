import type { SpaceNode } from './types';

function addTarget(index: Map<string, SpaceNode | null>, target: string, node: SpaceNode): void {
  const normalized = target.trim();
  if (!normalized) return;

  const existing = index.get(normalized);
  if (existing === undefined) {
    index.set(normalized, node);
    return;
  }

  if (existing !== node) {
    index.set(normalized, null);
  }
}

function buildTargetIndex(nodes: SpaceNode[]): Map<string, SpaceNode | null> {
  const index = new Map<string, SpaceNode | null>();
  for (const node of nodes) {
    for (const target of node.linkTargets) {
      addTarget(index, target, node);
    }
  }
  return index;
}

/**
 * Extract the lookup key from a wikilink string such as:
 *   [[Personal Vision]]                → "Personal Vision"
 *   [[Personal Vision#Our Mission]]    → "Personal Vision#Our Mission"
 *   [[vision_page#^ourmission]]        → "vision_page#^ourmission"
 */
export function wikilinkToTarget(wikilink: string): string {
  const cleaned = wikilink.replace(/^"|"$/g, '').trim();
  if (!cleaned.startsWith('[[') || !cleaned.endsWith(']]')) {
    return cleaned;
  }
  return cleaned.slice(2, -2).trim();
}

export function resolveParentLinks(nodes: SpaceNode[]): void {
  const targetIndex = buildTargetIndex(nodes);

  for (const node of nodes) {
    node.resolvedParent = undefined;

    const rawParent = node.schemaData.parent;
    if (typeof rawParent !== 'string') continue;

    const parentTarget = wikilinkToTarget(rawParent);
    const parentNode = targetIndex.get(parentTarget);
    if (!parentNode) continue;

    const parentTitle = parentNode.schemaData.title;
    if (typeof parentTitle !== 'string') continue;

    node.resolvedParent = parentTitle;
  }
}
