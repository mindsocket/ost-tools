import { dirname, resolve } from 'node:path';
import { configPath, getSpaceConfigDir, loadConfig, resolveSchema } from '../config';
import { loadPlugins } from '../plugins/loader';
import type { PluginContext } from '../plugins/util';
import { loadMetadata } from '../schema/schema';
import type { ReadSpaceResult } from '../types';

export function buildPluginContext(path: string, schemaPath?: string): PluginContext {
  const absolutePath = resolve(path);
  const config = loadConfig();
  const space = config.spaces.find((s) => resolve(s.path) === absolutePath);
  const resolvedSchemaPath = resolveSchema(schemaPath, config, space);
  const metadata = loadMetadata(resolvedSchemaPath);
  const configDir = space ? getSpaceConfigDir(space.name) : dirname(resolve(configPath()));
  return { spacePath: absolutePath, space, config, resolvedSchemaPath, metadata, pluginConfig: {}, configDir };
}

export async function readSpace(path: string, options?: { schemaPath?: string }): Promise<ReadSpaceResult> {
  const context = buildPluginContext(path, options?.schemaPath);

  const pluginMap: Record<string, Record<string, unknown>> = context.space?.plugins ?? {};
  const loaded = await loadPlugins(pluginMap, context.configDir);

  for (const { plugin, pluginConfig } of loaded) {
    if (!plugin.parse) continue;
    const result = await plugin.parse({ ...context, pluginConfig });
    if (result !== null) {
      return { nodes: result.nodes, source: plugin.name, diagnostics: result.diagnostics };
    }
  }

  throw new Error(`No plugin handled space at: ${path}`);
}
