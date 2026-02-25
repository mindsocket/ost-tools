#!/usr/bin/env bun
import { Command } from 'commander';
import { validate } from './validate.js';
import { diagram } from './diagram.js';
import { show } from './show.js';
import { dump } from './dump.js';
import { templateSync } from './template-sync.js';
import { loadConfig, resolveSpace } from './config.js';

const program = new Command();

program
  .name('ost-tools')
  .description('Opportunity Solution Tree validation and diagram generation tool')
  .version('0.1.0');

program
  .command('validate')
  .description('Validate OST nodes against JSON schema')
  .argument('<space-dir-or-file>', 'Space alias, directory path, or OST-on-a-page .md file')
  .option('-s, --schema <path>', 'Path to JSON schema file')
  .action((spaceOrDir, options) => validate(resolveSpace(spaceOrDir, loadConfig()), options));

program
  .command('diagram')
  .description('Generate mermaid diagram from OST nodes')
  .argument('<space-dir-or-file>', 'Space alias, directory path, or OST-on-a-page .md file')
  .option('-o, --output <path>', 'Output file path (default: stdout)')
  .option('-s, --schema <path>', 'Path to JSON schema file')
  .action((spaceOrDir, options) => diagram(resolveSpace(spaceOrDir, loadConfig()), options));

program
  .command('show')
  .description('Print OST tree as an indented list')
  .argument('<space-dir-or-file>', 'Space alias, directory path, or OST-on-a-page .md file')
  .action((arg) => show(resolveSpace(arg, loadConfig())));

program
  .command('dump')
  .description('Dump parsed OST nodes as JSON')
  .argument('<space-dir-or-file>', 'Space alias, directory path, or OST-on-a-page .md file')
  .action((arg) => dump(resolveSpace(arg, loadConfig())));

program
  .command('template-sync')
  .description('Sync OST template frontmatter with schema examples')
  .argument('<template-dir>', 'Directory containing OST template markdown files')
  .option('-s, --schema <path>', 'Path to JSON schema file', 'schema.json')
  .option('--dry-run', 'Preview changes without writing files')
  .action(templateSync);

program.parse();
