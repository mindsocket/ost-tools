import { describe, expect, it } from 'bun:test';
import { extractEmbeddedNodes } from '../../src/read/parse-embedded';
import type { HierarchyLevel } from '../../src/types';

const HIERARCHY: HierarchyLevel[] = [
  { type: 'phase', field: 'parent', fieldOn: 'child', multiple: false, selfRef: false },
  { type: 'activity', field: 'parent', fieldOn: 'child', multiple: false, selfRef: false },
  { type: 'capability', field: 'parent', fieldOn: 'child', multiple: false, selfRef: false },
  {
    type: 'application',
    field: 'capabilities',
    fieldOn: 'child',
    multiple: true,
    selfRef: false,
  },
  {
    type: 'tool',
    field: 'tools',
    fieldOn: 'parent',
    multiple: true,
    selfRef: false,
  },
];

describe('extractEmbeddedNodes - hierarchy embedding', () => {
  it('hierarchy child level matching with text items creates new nodes', () => {
    const body = `
# My Activity [type:: activity]

### capability

- Build reporting pipeline
- Run analytics
`;
    const { nodes } = extractEmbeddedNodes(body, {
      pageType: 'activity',
      metadata: { hierarchy: { levels: HIERARCHY } },
    });

    const caps = nodes.filter((n) => n.schemaData.type === 'capability');
    expect(caps).toHaveLength(2);
    expect(caps[0]?.schemaData.title).toBe('Build reporting pipeline');
    expect(caps[1]?.schemaData.title).toBe('Run analytics');
    expect(caps[0]?.schemaData.parent).toBe('[[My Activity]]');
  });

  it('hierarchy child level matching with matchers creates new nodes', () => {
    const hierarchy: HierarchyLevel[] = [
      { type: 'goal', field: 'parent', fieldOn: 'child', multiple: false, selfRef: false },
      {
        type: 'opportunity',
        field: 'parent',
        fieldOn: 'child',
        multiple: false,
        selfRef: false,
        templateFormat: 'list',
        matchers: ['Opportunities', 'User Opportunities'],
      },
    ];

    const body = `
# My Goal [type:: goal]

### Opportunities
- Improve user onboarding
- Reduce friction at login
`;
    const { nodes } = extractEmbeddedNodes(body, {
      pageType: 'goal',
      metadata: { hierarchy: { levels: hierarchy } },
    });

    const opps = nodes.filter((n) => n.schemaData.type === 'opportunity');
    expect(opps).toHaveLength(2);
    expect(opps[0]?.schemaData.title).toBe('Improve user onboarding');
    expect(opps[0]?.schemaData.parent).toBe('[[My Goal]]');
  });

  it('child-level with wikilinks populates parent field without creating nodes', () => {
    const body = `
# My Activity [type:: activity]

### tool
- [[Zephyr]]
- [[Jira]]
`;
    const { nodes } = extractEmbeddedNodes(body, {
      pageType: 'activity',
      metadata: {
        hierarchy: {
          levels: [
            { type: 'activity', field: 'parent', fieldOn: 'child', multiple: false, selfRef: false },
            {
              type: 'tool',
              field: 'tools',
              fieldOn: 'parent',
              multiple: true,
              selfRef: false,
            },
          ],
        },
      },
    });

    const activity = nodes.find((n) => n.schemaData.type === 'activity');
    expect(activity).toBeDefined();
    expect(activity?.schemaData.tools).toEqual(['[[Zephyr]]', '[[Jira]]']);

    // No new tool nodes should be created for wikilink items
    const tools = nodes.filter((n) => n.schemaData.type === 'tool');
    expect(tools).toHaveLength(0);
  });

  it('parent-level matching: section heading for ancestor type populates current node field', () => {
    const body = `
# My Application [type:: application]

### capability
- [[Task Management]]
- [[Project Tracking]]
`;
    const { nodes } = extractEmbeddedNodes(body, {
      pageType: 'application',
      metadata: { hierarchy: { levels: HIERARCHY } },
    });

    const app = nodes.find((n) => n.schemaData.type === 'application');
    expect(app).toBeDefined();
    expect(app?.schemaData.capabilities).toEqual(['[[Task Management]]', '[[Project Tracking]]']);

    // No capability nodes created — these are wikilink references
    const caps = nodes.filter((n) => n.schemaData.type === 'capability');
    expect(caps).toHaveLength(0);
  });

  it('parent-level matching with matchers', () => {
    const capLevelWithMatchers: HierarchyLevel[] = [
      {
        type: 'capability',
        field: 'parent',
        fieldOn: 'child',
        multiple: false,
        selfRef: false,
        matchers: ['Capabilities', 'Skills'],
      },
      {
        type: 'application',
        field: 'capabilities',
        fieldOn: 'child',
        multiple: true,
        selfRef: false,
      },
    ];

    const body = `
# My Application [type:: application]

### Capabilities
- [[Cap A]]
`;
    const { nodes } = extractEmbeddedNodes(body, {
      pageType: 'application',
      metadata: { hierarchy: { levels: capLevelWithMatchers } },
    });

    const app = nodes.find((n) => n.schemaData.type === 'application');
    expect(app?.schemaData.capabilities).toEqual(['[[Cap A]]']);
  });

  it('mixed wikilink and text items: wikilinks populate field, text creates nodes', () => {
    const hierarchy: HierarchyLevel[] = [
      { type: 'activity', field: 'parent', fieldOn: 'child', multiple: false, selfRef: false },
      {
        type: 'tool',
        field: 'tools',
        fieldOn: 'parent',
        multiple: true,
        selfRef: false,
      },
    ];

    const body = `
# My Activity [type:: activity]

### tool
- [[Existing Tool]]
- New Tool
`;
    const { nodes } = extractEmbeddedNodes(body, {
      pageType: 'activity',
      metadata: { hierarchy: { levels: hierarchy } },
    });

    const activity = nodes.find((n) => n.schemaData.type === 'activity');
    expect(activity?.schemaData.tools).toEqual(['[[Existing Tool]]', '[[New Tool]]']);

    const tools = nodes.filter((n) => n.schemaData.type === 'tool');
    expect(tools).toHaveLength(1);
    expect(tools[0]?.schemaData.title).toBe('New Tool');
  });

  it('Campaign in a Box pattern: both child and parent level sections work together', () => {
    const hierarchy: HierarchyLevel[] = [
      { type: 'phase', field: 'parent', fieldOn: 'child', multiple: false, selfRef: false },
      { type: 'activity', field: 'parent', fieldOn: 'child', multiple: false, selfRef: false },
      { type: 'capability', field: 'parent', fieldOn: 'child', multiple: false, selfRef: false },
      {
        type: 'application',
        field: 'capabilities',
        fieldOn: 'child',
        multiple: true,
        selfRef: false,
      },
      {
        type: 'tool',
        field: 'tools',
        fieldOn: 'parent',
        multiple: true,
        selfRef: false,
      },
    ];

    const body = `
# Applications
## Project management using Zephyr ^application1

### tool
- [[Zephyr]]

### capability
- [[Task & Project Management]]
`;
    const { nodes } = extractEmbeddedNodes(body, {
      pageType: 'phase',
      metadata: { hierarchy: { levels: hierarchy } },
    });

    const app = nodes.find((n) => n.schemaData.type === 'application');
    expect(app).toBeDefined();
    expect(app?.schemaData.title).toBe('Project management using Zephyr');

    // Child-level: tools field on application node
    expect(app?.schemaData.tools).toEqual(['[[Zephyr]]']);

    // Parent-level: capabilities field on application node
    expect(app?.schemaData.capabilities).toEqual(['[[Task & Project Management]]']);

    // No tool or capability nodes created
    expect(nodes.filter((n) => n.schemaData.type === 'tool')).toHaveLength(0);
    expect(nodes.filter((n) => n.schemaData.type === 'capability')).toHaveLength(0);
  });

  it('grouping flush on next heading: grouping heading emitted when non-list content follows', () => {
    const hierarchy: HierarchyLevel[] = [
      { type: 'goal', field: 'parent', fieldOn: 'child', multiple: false, selfRef: false },
      { type: 'opportunity', field: 'parent', fieldOn: 'child', multiple: false, selfRef: false },
    ];

    const body = `
# My Goal [type:: goal]

### opportunity

Some paragraph content here.
`;
    const { nodes } = extractEmbeddedNodes(body, {
      pageType: 'goal',
      metadata: { hierarchy: { levels: hierarchy } },
    });

    // The opportunity heading is flushed as a node when paragraph content follows
    const opps = nodes.filter((n) => n.schemaData.type === 'opportunity');
    expect(opps).toHaveLength(1);
    expect(opps[0]?.schemaData.title).toBe('opportunity');
    expect(opps[0]?.schemaData.content).toContain('Some paragraph content here.');
  });

  it('explicit type overrides grouping: [type:: x] on heading uses explicit type', () => {
    const body = `
# My Goal [type:: goal]

### My Opportunity [type:: opportunity]
`;
    const { nodes } = extractEmbeddedNodes(body, {
      pageType: 'goal',
      metadata: {
        hierarchy: {
          levels: [
            { type: 'goal', field: 'parent', fieldOn: 'child', multiple: false, selfRef: false },
            { type: 'opportunity', field: 'parent', fieldOn: 'child', multiple: false, selfRef: false },
          ],
        },
      },
    });

    const opps = nodes.filter((n) => n.schemaData.type === 'opportunity');
    expect(opps).toHaveLength(1);
    expect(opps[0]?.schemaData.title).toBe('My Opportunity');
  });

  it('hierarchy sibling section + relationship table work together', () => {
    const hierarchy: HierarchyLevel[] = [
      { type: 'goal', field: 'parent', fieldOn: 'child', multiple: false, selfRef: false },
      { type: 'opportunity', field: 'parent', fieldOn: 'child', multiple: false, selfRef: false },
    ];
    const relationships = [
      {
        parent: 'goal',
        type: 'assumption',
        templateFormat: 'table' as const,
        matchers: ['Assumptions'],
        multiple: true,
      },
    ];

    const body = `
# My Goal [type:: goal]

### opportunity
- Build better UI
- Simplify navigation

### Assumptions

| assumption | status |
|---|---|
| Users prefer simplicity | identified |
`;
    const { nodes } = extractEmbeddedNodes(body, {
      pageType: 'goal',
      metadata: { hierarchy: { levels: hierarchy }, relationships },
    });

    const opps = nodes.filter((n) => n.schemaData.type === 'opportunity');
    expect(opps).toHaveLength(2);
    expect(opps[0]?.schemaData.parent).toBe('[[My Goal]]');

    const assumptions = nodes.filter((n) => n.schemaData.type === 'assumption');
    expect(assumptions).toHaveLength(1);
    expect(assumptions[0]?.schemaData.parent).toBe('[[My Goal]]');
  });
});
