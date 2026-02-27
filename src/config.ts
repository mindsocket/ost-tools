import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';

const CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    spaces: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          alias: { type: 'string', pattern: '^[a-z0-9_-]+$' },
          path: { type: 'string' },
          schema: { type: 'string' },
          miroBoardId: { type: 'string' },
          miroFrameId: { type: 'string' },
        },
        required: ['alias', 'path'],
        additionalProperties: false,
      },
    },
    schema: { type: 'string' },
    templateDir: { type: 'string' },
  },
  required: ['spaces'],
  additionalProperties: false,
};

export interface SpaceConfig {
  alias: string;
  path: string;
  schema?: string;
  miroBoardId?: string;
  miroFrameId?: string;
}

export interface Config {
  spaces: SpaceConfig[];
  schema?: string;
  templateDir?: string;
}

function configPath(): string {
  return join(import.meta.dir, '..', 'config.json');
}

export function loadConfig(): Config {
  const path = configPath();
  if (!existsSync(path)) {
    return { spaces: [] };
  }

  const config = JSON.parse(readFileSync(path, 'utf-8'));
  const ajv = new Ajv();
  const validate = ajv.compile(CONFIG_SCHEMA);

  if (!validate(config)) {
    console.error('Invalid config.json:', validate.errors);
    process.exit(1);
  }

  return config as unknown as Config;
}

/** Resolve alias-or-path to a filesystem path. Falls through if not an alias. */
export function resolveSpacePath(aliasOrPath: string, config: Config): string {
  const space = config.spaces.find((s) => s.alias === aliasOrPath);
  return space ? space.path : aliasOrPath;
}

/** Get the full space config entry by alias. Throws if not found. */
export function getSpaceConfig(alias: string, config: Config): SpaceConfig {
  const space = config.spaces.find((s) => s.alias === alias);
  if (!space) {
    throw new Error(`Unknown space config: "${alias}". Check config.json.`);
  }
  return space;
}

/** Resolve schema path: CLI arg > space-level config > global config > hardcoded default. */
export function resolveSchema(cliArg: string | undefined, config: Config, space?: SpaceConfig): string {
  return cliArg ?? space?.schema ?? config.schema ?? 'schemas/general.json';
}

/** Parsed JSON schema object — always a plain object (never a boolean schema). */
type JsonSchemaObject = Record<string, unknown>;

/**
 * Build a registry of all schemas in the given directory, keyed by $id.
 * Used both by createValidator (AJV) and loadSchema (template-sync bundling).
 */
function buildSchemaRegistry(dir: string): Map<string, JsonSchemaObject> {
  const registry = new Map<string, JsonSchemaObject>();
  if (!existsSync(dir)) return registry;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const schema = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as JsonSchemaObject;
    if (typeof schema.$id === 'string') registry.set(schema.$id, schema);
  }
  return registry;
}

/**
 * Load a schema as a self-contained object for direct traversal (e.g. template-sync).
 * External $refs are resolved against peer schemas in the same directory: their $defs
 * are merged in and the refs rewritten to internal #/$defs/... form.
 * Note: only one level of ref resolution is performed here. Full cross-schema traversal
 * will be addressed when template-sync is updated in #15.
 */
export function loadSchema(schemaPath: string): JsonSchemaObject {
  const absPath = resolve(schemaPath);
  const schema = JSON.parse(readFileSync(absPath, 'utf-8')) as JsonSchemaObject;
  const registry = buildSchemaRegistry(dirname(absPath));

  // Collect $defs from any externally-referenced schemas
  const mergedDefs: Record<string, unknown> = {};
  JSON.stringify(schema, (key, value) => {
    if (key === '$ref' && typeof value === 'string' && !value.startsWith('#')) {
      const baseId = value.split('#')[0]!;
      const dep = registry.get(baseId);
      if (dep) Object.assign(mergedDefs, dep.$defs ?? {});
    }
    return value;
  });

  schema.$defs = { ...mergedDefs, ...(schema.$defs ?? {}) };

  // Rewrite external $refs to internal #/$defs/... refs
  return JSON.parse(
    JSON.stringify(schema, (key, value) => {
      if (key === '$ref' && typeof value === 'string' && !value.startsWith('#')) {
        const hashIdx = value.indexOf('#');
        return hashIdx !== -1 ? value.slice(hashIdx) : '#';
      }
      return value;
    }),
  ) as JsonSchemaObject;
}

/**
 * Compile a schema into an AJV ValidateFunction using the registry approach.
 * All peer schemas in the same directory are registered so AJV can resolve
 * cross-file $refs transitively.
 */
export function createValidator(schemaPath: string): ValidateFunction {
  const absPath = resolve(schemaPath);
  const targetSchema = JSON.parse(readFileSync(absPath, 'utf-8'));
  const ajv = new Ajv();
  for (const [id, peerSchema] of buildSchemaRegistry(dirname(absPath))) {
    if (id === targetSchema.$id) continue; // already compiled below
    ajv.addSchema(peerSchema);
  }
  return ajv.compile(targetSchema);
}

/** Resolve template dir: CLI arg > config entry > error. */
export function resolveTemplateDir(cliArg: string | undefined, config: Config): string {
  const dir = cliArg ?? config.templateDir;
  if (!dir) {
    console.error('Error: template-dir is required (specify as argument or set templateDir in config.json)');
    process.exit(1);
  }
  return dir;
}

/** Update a field on a space entry and persist config.json. */
export function updateSpaceField(alias: string, field: keyof SpaceConfig, value: string): void {
  const config = loadConfig();
  const space = getSpaceConfig(alias, config);
  space[field] = value;
  writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`);
}
