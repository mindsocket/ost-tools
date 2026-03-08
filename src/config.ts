import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import Ajv from 'ajv';
import JSON5 from 'json5';
import { bundledSchemasDir } from './schema';

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
          templateDir: { type: 'string' },
          templatePrefix: { type: 'string' },
          miroBoardId: { type: 'string' },
          miroFrameId: { type: 'string' },
          fieldMap: { type: 'object', additionalProperties: { type: 'string' } },
        },
        required: ['alias', 'path'],
        additionalProperties: false,
      },
    },
    schema: { type: 'string' },
    templateDir: { type: 'string' },
    templatePrefix: { type: 'string' },
  },
  required: ['spaces'],
  additionalProperties: false,
};

export interface SpaceConfig {
  alias: string;
  path: string;
  schema?: string;
  templateDir?: string;
  templatePrefix?: string;
  miroBoardId?: string;
  miroFrameId?: string;
  /**
   * Maps file/frontmatter field names to canonical field names expected by the schema.
   * Applied on read (frontmatter → schemaData) and reversed on write (template-sync).
   * Example: { "record_type": "type" } renames `record_type` in files to `type` internally.
   */
  fieldMap?: Record<string, string>;
}

export interface Config {
  spaces: SpaceConfig[];
  schema?: string;
  templateDir?: string;
  templatePrefix?: string;
}

let _configPathOverride: string | undefined;

/** Override the config file path used by loadConfig/updateSpaceField. */
export function setConfigPath(path: string | undefined): void {
  _configPathOverride = path;
}

export function configPath(): string {
  if (_configPathOverride) {
    return _configPathOverride;
  }
  if (process.env.OST_TOOLS_CONFIG) {
    return process.env.OST_TOOLS_CONFIG;
  }
  const xdgBase = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  const xdgPath = join(xdgBase, 'ost-tools', 'config.json');
  if (existsSync(xdgPath)) {
    return xdgPath;
  }
  const cwdPath = join(process.cwd(), 'config.json');
  if (existsSync(cwdPath)) {
    return cwdPath;
  }
  return xdgPath;
}

function resolveRelativePaths(config: Config, configDir: string): Config {
  const rel = (p: string | undefined): string | undefined => {
    if (!p || isAbsolute(p)) return p;
    return resolve(configDir, p);
  };
  return {
    ...config,
    schema: rel(config.schema),
    templateDir: rel(config.templateDir),
    spaces: config.spaces.map((s) => ({
      ...s,
      path: rel(s.path)!,
      schema: rel(s.schema),
      templateDir: rel(s.templateDir),
    })),
  };
}

function _loadConfig(path: string): Config {
  if (!existsSync(path)) {
    console.error(`Config file not found: ${path}`);
    process.exit(1);
  }

  const config = JSON5.parse(readFileSync(path, 'utf-8'));
  const ajv = new Ajv();
  const validate = ajv.compile(CONFIG_SCHEMA);

  if (!validate(config)) {
    console.error('Invalid config.json:', validate.errors);
    process.exit(1);
  }
  return config as unknown as Config;
}

export function loadConfig(): Config {
  const path = configPath();
  const config = _loadConfig(path);
  return resolveRelativePaths(config, dirname(resolve(path)));
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
  return cliArg ?? space?.schema ?? config.schema ?? join(bundledSchemasDir, 'general.json');
}

export interface TemplateSettings {
  templateDir: string;
  templatePrefix: string;
}

/** Resolve template settings: space-level config > global config. */
export function resolveTemplateSettings(config: Config, space?: SpaceConfig): TemplateSettings {
  const templateDir = space?.templateDir ?? config.templateDir;
  if (!templateDir) {
    console.error('Error: templateDir is required in config.json (global or per-space)');
    process.exit(1);
  }
  const templatePrefix = space?.templatePrefix ?? config.templatePrefix ?? '';
  return { templateDir, templatePrefix };
}

/**
 * Apply field remapping to a data object.
 * Renames keys according to fieldMap (file field name → canonical field name).
 * Fields not in the map are passed through unchanged.
 */
export function applyFieldMap(
  data: Record<string, unknown>,
  fieldMap: Record<string, string> | undefined,
): Record<string, unknown> {
  if (!fieldMap || Object.keys(fieldMap).length === 0) return data;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    result[fieldMap[key] ?? key] = value;
  }
  return result;
}

/**
 * Invert a fieldMap (file→canonical) to produce a reverse map (canonical→file).
 * Used for write operations (e.g. template-sync) to translate back to file field names.
 */
export function invertFieldMap(fieldMap: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(fieldMap).map(([src, canonical]) => [canonical, src]));
}

type StringFields<T> = { [K in keyof T]: T[K] extends string | undefined ? K : never }[keyof T];

/** Update a string field on a space entry and persist config.json. */
export function updateSpaceField(alias: string, field: StringFields<SpaceConfig>, value: string): void {
  const path = configPath();
  const config = _loadConfig(path);
  const space = config.spaces?.find((s: SpaceConfig) => s.alias === alias);
  if (!space) {
    throw new Error(`Unknown space config: "${alias}". Check config.json.`);
  }
  (space as unknown as Record<string, unknown>)[field as string] = value;
  writeFileSync(path, `${JSON5.stringify(config, null, 2)}\n`);
}
