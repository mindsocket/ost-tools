import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AnySchemaObject, SchemaObject } from 'ajv';
import { glob } from 'glob';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { buildSchemaRegistry, loadSchema, resolveRef } from '../schema';

interface TypeVariant {
  required: string[];
  optional: string[];
  properties: Record<string, AnySchemaObject>;
  example: Record<string, string | number | boolean>;
}

// Fields derived from the filesystem — present at validation time but not written to frontmatter
const DERIVED_FIELDS = new Set(['title', 'content']);

// Merge properties from allOf sub-schemas into a single properties map
function mergeAllOfProperties(
  variant: AnySchemaObject,
  schema: SchemaObject,
  registry: Map<string, AnySchemaObject>,
): Record<string, AnySchemaObject> {
  const merged: Record<string, AnySchemaObject> = {};
  const { allOf, properties: variantProps } = variant as {
    allOf?: AnySchemaObject[];
    properties?: Record<string, AnySchemaObject>;
  };
  for (const sub of allOf ?? []) {
    const resolved = resolveRef(sub, schema, registry);
    const { properties } = (resolved as { properties?: Record<string, AnySchemaObject> }) ?? {};
    Object.assign(merged, properties ?? {});
  }
  Object.assign(merged, variantProps ?? {});
  return merged;
}

function enumPlaceholder(def: AnySchemaObject): string {
  return (def as { enum?: string[] }).enum?.join('|') ?? '';
}

function withEnumPlaceholders(
  example: Record<string, string | number | boolean>,
  properties: Record<string, AnySchemaObject>,
  schema: SchemaObject,
  registry: Map<string, AnySchemaObject>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(example).map(([key, value]) => {
      const def = resolveRef(properties[key], schema, registry);
      return def && 'enum' in def ? [key, enumPlaceholder(def)] : [key, value];
    }),
  );
}

function commentedHint(
  fieldName: string,
  propDef: AnySchemaObject | undefined,
  schema: SchemaObject,
  registry: Map<string, AnySchemaObject>,
): string {
  const def = resolveRef(propDef, schema, registry);
  let value: string;
  const defTyped = def as
    | {
        enum?: string[];
        type?: string;
        minimum?: number;
        maximum?: number;
      }
    | undefined;
  if (defTyped?.enum) {
    value = enumPlaceholder(defTyped);
  } else if (defTyped?.type === 'integer') {
    value = String(Math.ceil(((defTyped.minimum ?? 1) + (defTyped.maximum ?? 5)) / 2));
  } else if (defTyped?.type === 'array') {
    value = '[]';
  } else {
    value = '""';
  }
  return `# ${fieldName}: ${value}`;
}

function getTypeVariants(schema: SchemaObject, registry: Map<string, AnySchemaObject>): Map<string, TypeVariant> {
  const map = new Map<string, TypeVariant>();
  for (const variant of schema.oneOf) {
    const typeName = variant.properties?.type?.const as string;
    if (!typeName || typeName === 'dashboard' || typeName === 'ost_on_a_page') continue;
    if (!variant.examples?.[0]) continue;

    const required = (variant.required as string[]).filter((k: string) => k !== 'type' && !DERIVED_FIELDS.has(k));
    const allProperties = Object.fromEntries(
      Object.entries(mergeAllOfProperties(variant, schema, registry)).filter(
        ([k]) => k !== 'type' && !DERIVED_FIELDS.has(k),
      ),
    );
    const optional = Object.keys(allProperties).filter((k) => !required.includes(k));
    const example = variant.examples[0] as Record<string, string | number | boolean>;

    map.set(typeName, {
      required,
      optional,
      properties: allProperties,
      example,
    });
  }
  return map;
}

export async function templateSync(templateDir: string, options: { schema: string; dryRun?: boolean }) {
  const schema = loadSchema(options.schema);

  // Build schema registry for cross-file $ref resolution
  const schemaDir = dirname(options.schema);
  const registry = buildSchemaRegistry(schemaDir);

  const typeVariants = getTypeVariants(schema, registry);

  const files = await glob('OST - *.md', { cwd: templateDir, absolute: true });
  if (files.length === 0) {
    console.log(`No OST template files found in ${templateDir}`);
    return;
  }

  const dryRun = options.dryRun ?? false;
  let filesModified = 0;

  console.log(`\n🔄 OST Template Sync`);
  console.log('━'.repeat(50));
  if (dryRun) console.log('(dry run — no files will be modified)\n');

  for (const file of files.sort()) {
    const filename = file.split('/').pop()!;
    const content = readFileSync(file, 'utf-8');

    const fmMatch = content.match(/^---\n[\s\S]*?\n---/);
    if (!fmMatch) {
      console.log(`⚠  ${filename}: no frontmatter, skipping`);
      continue;
    }
    const body = content.slice(fmMatch[0].length);

    const parsed = matter(content);
    const nodeType = parsed.data.type as string | undefined;
    if (!nodeType) {
      console.log(`⚠  ${filename}: no type field, skipping`);
      continue;
    }

    const variant = typeVariants.get(nodeType);
    if (!variant) {
      console.log(`⚠  ${filename}: no schema example for type "${nodeType}", skipping`);
      continue;
    }

    const { example, optional, properties } = variant;
    const exampleKeys = new Set(Object.keys(example));

    const exampleWithPlaceholders = withEnumPlaceholders(example, properties, schema, registry);
    const frontmatterYaml = (yaml.dump(exampleWithPlaceholders, { lineWidth: -1 }) as string).trim();
    const hints = optional
      .filter((field) => !exampleKeys.has(field))
      .map((field) => commentedHint(field, properties[field], schema, registry));

    const newFrontmatter = hints.length > 0 ? `${frontmatterYaml}\n${hints.join('\n')}` : frontmatterYaml;

    const newContent = `---\n${newFrontmatter}\n---${body}`;

    if (newContent === content) {
      console.log(`✓  ${filename}`);
    } else {
      console.log(`📝 ${filename}: updated`);
      if (!dryRun) {
        writeFileSync(file, newContent);
        filesModified++;
      }
    }
  }

  console.log(`\n${'━'.repeat(50)}`);
  if (dryRun) {
    console.log('No files modified (dry run)\n');
  } else {
    console.log(`${filesModified} file(s) updated\n`);
  }
}
