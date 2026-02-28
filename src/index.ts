#!/usr/bin/env bun
import { Command } from 'commander';
import { diagram } from './commands/diagram';
import { dump } from './commands/dump';
import { show } from './commands/show';
import { templateSync } from './commands/template-sync';
import { validate } from './commands/validate';
import { loadConfig, resolveSchema, resolveSpacePath, resolveTemplateDir } from './config';
import { miroSync } from './miro/sync';

const program = new Command();

program
  .name('ost-tools')
  .description('Opportunity Solution Tree validation and diagram generation tool')
  .version('0.1.0');

program
  .command('validate')
  .description('Validate space against JSON schema')
  .argument('<space-dir-or-file>', 'Space alias, directory path, or space_on_a_page .md file')
  .option('-s, --schema <path>', 'Path to JSON schema file')
  .action((spaceOrDir, options) => {
    const config = loadConfig();
    const space = config.spaces.find((s) => s.alias === spaceOrDir);
    validate(space?.path ?? resolveSpacePath(spaceOrDir, config), {
      ...options,
      schema: resolveSchema(options.schema, config, space),
    });
  });

program
  .command('diagram')
  .description('Generate mermaid diagram from space')
  .argument('<space-dir-or-file>', 'Space alias, directory path, or space_on_a_page .md file')
  .option('-o, --output <path>', 'Output file path (default: stdout)')
  .option('-s, --schema <path>', 'Path to JSON schema file')
  .action((spaceOrDir, options) => {
    const config = loadConfig();
    const space = config.spaces.find((s) => s.alias === spaceOrDir);
    diagram(space?.path ?? resolveSpacePath(spaceOrDir, config), {
      ...options,
      schema: resolveSchema(options.schema, config, space),
    });
  });

program
  .command('show')
  .description('Print space tree as an indented list')
  .argument('<space-dir-or-file>', 'Space alias, directory path, or space_on_a_page .md file')
  .action((arg) => show(resolveSpacePath(arg, loadConfig())));

program
  .command('dump')
  .description('Dump parsed space nodes as JSON')
  .argument('<space-dir-or-file>', 'Space alias, directory path, or space_on_a_page .md file')
  .action((arg) => dump(resolveSpacePath(arg, loadConfig())));

program
  .command('miro-sync')
  .description('Sync space to a Miro board')
  .argument('<space>', 'Space alias (must have miroBoardId in config)')
  .option('--new-frame <title>', 'Create a new frame on the board and sync into it')
  .option('--dry-run', 'Show what would change without touching Miro')
  .option('-v, --verbose', 'Detailed output')
  .action(miroSync);

program
  .command('template-sync')
  .description('Sync template frontmatter with schema examples')
  .argument('[template-dir]', 'Directory containing template markdown files')
  .option('-s, --schema <path>', 'Path to JSON schema file')
  .option('--dry-run', 'Preview changes without writing files')
  .action((templateDir, options) => {
    const config = loadConfig();
    templateSync(resolveTemplateDir(templateDir, config), {
      ...options,
      schema: resolveSchema(options.schema, config),
    });
  });

program.parse();
