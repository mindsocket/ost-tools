import { readFileSync, writeFileSync } from 'node:fs';
import { glob } from 'glob';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { loadSchema } from './config.js';

interface TypeVariant {
  required: string[];
  optional: string[];
  properties: Record<string, unknown>;
  example: Record<string, string | number | boolean>;
}

// Fields derived from the filesystem — present at validation time but not written to frontmatter
const DERIVED_FIELDS = new Set(['title', 'content']);

// biome-ignore lint/suspicious/noExplicitAny: JSON schema objects are untyped by definition
function resolveRef(propDef: any, schema: any): any {
  if (propDef?.$ref) {
    const path = (propDef.$ref as string).replace(/^#\//, '').split('/');
    // biome-ignore lint/suspicious/noExplicitAny: JSON schema traversal
    return path.reduce((obj: any, key: string) => obj[key], schema);
  }
  return propDef;
}

// Merge properties from allOf sub-schemas into a single properties map
// biome-ignore lint/suspicious/noExplicitAny: JSON schema objects are untyped by definition
function mergeAllOfProperties(variant: any, schema: any): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const sub of variant.allOf ?? []) {
    const resolved = resolveRef(sub, schema);
    Object.assign(merged, resolved.properties ?? {});
  }
  Object.assign(merged, variant.properties ?? {});
  return merged;
}

// biome-ignore lint/suspicious/noExplicitAny: JSON schema definition objects are untyped
function enumPlaceholder(def: any): string {
  return def.enum.join('|');
}

function withEnumPlaceholders(
  example: Record<string, string | number | boolean>,
  properties: Record<string, unknown>,
  schema: unknown,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(example).map(([key, value]) => {
      const def = resolveRef(properties[key], schema);
      return def?.enum ? [key, enumPlaceholder(def)] : [key, value];
    }),
  );
}

// biome-ignore lint/suspicious/noExplicitAny: JSON schema definition objects are untyped
function commentedHint(fieldName: string, propDef: any, schema: any): string {
  const def = resolveRef(propDef, schema);
  let value: string;
  if (def?.enum) {
    value = enumPlaceholder(def);
  } else if (def?.type === 'integer') {
    value = String(Math.ceil(((def.minimum ?? 1) + (def.maximum ?? 5)) / 2));
  } else if (def?.type === 'array') {
    value = '[]';
  } else {
    value = '""';
  }
  return `# ${fieldName}: ${value}`;
}

// biome-ignore lint/suspicious/noExplicitAny: JSON schema root object is untyped
function getTypeVariants(schema: any): Map<string, TypeVariant> {
  const map = new Map<string, TypeVariant>();
  for (const variant of schema.oneOf) {
    const typeName = variant.properties?.type?.const as string;
    if (!typeName || typeName === 'dashboard' || typeName === 'ost_on_a_page') continue;
    if (!variant.examples?.[0]) continue;

    const required = (variant.required as string[]).filter((k: string) => k !== 'type' && !DERIVED_FIELDS.has(k));
    const allProperties = Object.fromEntries(
      Object.entries(mergeAllOfProperties(variant, schema)).filter(([k]) => k !== 'type' && !DERIVED_FIELDS.has(k)),
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
  const typeVariants = getTypeVariants(schema);

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

    const exampleWithPlaceholders = withEnumPlaceholders(example, properties, schema);
    const frontmatterYaml = (yaml.dump(exampleWithPlaceholders, { lineWidth: -1 }) as string).trim();
    const hints = optional
      .filter((field) => !exampleKeys.has(field))
      .map((field) => commentedHint(field, properties[field], schema));

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
