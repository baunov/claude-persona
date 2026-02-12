#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './init.js';
import { useCommand } from './use.js';
import { addCommand } from './add.js';
import { testCommand } from './test.js';
import { uninstallCommand } from './uninstall.js';

const program = new Command();

program
  .name('claude-persona')
  .description('Sound effects for Claude Code sessions')
  .version('0.1.1');

program
  .command('init')
  .description('Install claude-persona hooks into Claude Code')
  .option('--global', 'Install globally (~/.claude-persona/ + ~/.claude/settings.json)')
  .option('--project', 'Install for current project (.claude/persona/ + .claude/settings.local.json)')
  .option('--persona <name>', 'Persona to install (skips interactive picker)')
  .action(initCommand);

program
  .command('use [name]')
  .description('Switch the active persona')
  .action(useCommand);

program
  .command('add <source>')
  .description('Install a third-party persona (local path or github:user/repo)')
  .option('--name <name>', 'Override the persona name')
  .action(addCommand);

program
  .command('test [situation]')
  .description('Play a random sound for a situation (or list all situations)')
  .option('-c, --config <path>', 'Path to config directory')
  .action(testCommand);

program
  .command('uninstall')
  .description('Remove claude-persona hooks from Claude Code')
  .option('--global', 'Remove from global settings')
  .option('--project', 'Remove from project settings')
  .option('--purge', 'Also delete sounds, config, and CLAUDE.md section')
  .action(uninstallCommand);

program.parse();
