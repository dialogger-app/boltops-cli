#!/usr/bin/env node

import { program } from 'commander';
import { config } from 'dotenv';
import { copy } from '../src/commands/copy.js';
import { sync } from '../src/commands/sync.js';
import { host } from '../src/commands/host.js';
import chalk from 'chalk';
import crypto from 'crypto';

// Load environment variables from .env file
config();

interface CopyConfig {
  project: string;
  host: string;
  secret: string;
  clean: boolean;
  subset?: string;
  path: string;
}

interface SyncConfig {
  project: string;
  host: string;
  secret: string;
  all: boolean;
  subset?: string;
  path: string;
}

interface HostConfig {
  port: number;
  workspace: string;
  secret: string;
}

program
  .name('boltops')
  .description('Toolkit for working with bolt.new and bolt.diy')
  .version('0.0.1')
  .addHelpCommand('help [command]', 'Display help for a specific command');;

program
  .command('copy')
  .description('Copy files from a remote host to a local project directory')
  .addHelpText("after", `
    The copy command downloads files from a remote host to your local project directory.
    
    Environment Variables:
      BOLTOPS_PROJECT  Project identifier (alternative to --project)
      BOLTOPS_HOST     Host URL (alternative to --host)
      BOLTOPS_SECRET   Required authentication secret
    
    Examples:
      $ BOLTOPS_SECRET=secret boltops copy --project=sb1-abcd5678 --host=http://boltops.localhost:8017 ./project
      $ BOLTOPS_SECRET=secret boltops copy --clean --project=sb1-abcd5678 --host=http://boltops.localhost:8017 ./project
      $ BOLTOPS_SECRET=secret boltops copy --sync --project=sb1-abcd5678 --host=http://boltops.localhost:8017 ./project
    `)
  .option('--project <project>', 'Project ID (or use BOLTOPS_PROJECT env var)')
  .option('--host <host>', 'Host URL (or use BOLTOPS_HOST env var)')
  .option('--subset <directory>', 'Limit operations to files within specified subdirectory')
  .option('--clean', 'Clean up files not present in remote')
  .option('--sync', 'Sync files back when changed after copy')
  .argument('<path>', 'Path to project directory')
  .action(async (path: string, options: { project?: string; host?: string; clean?: boolean; sync?: boolean; subset?: string }) => {
    const config: CopyConfig = {
      project: options.project || process.env.BOLTOPS_PROJECT || '',
      host: options.host || process.env.BOLTOPS_HOST || "http://boltops.localhost:8017",
      secret: process.env.BOLTOPS_SECRET || '',
      clean: options.clean || false,
      subset: options.subset,
      path
    };

    if (!config.project) {
      console.error(chalk.red('Error: Project ID is required (use --project option or BOLTOPS_PROJECT env var)'));
      process.exit(1);
    }

    if (!config.host || !isValidUrl(config.host)) {
      console.error(chalk.red('Error: Host URL is required (use --host option or BOLTOPS_HOST env var)'));
      console.error(chalk.red('URL must start with http:// or https://'));
      process.exit(1);
    }

    if (!config.secret) {
      console.error(chalk.red('Error: BOLTOPS_SECRET environment variable is required'));
      process.exit(1);
    }

    try {
      await copy(config);
      console.log(chalk.green('Copy completed successfully'));

      if (!options.sync) return;

      // should keep watcher from firing on earlier copy
      await new Promise(resolve => setTimeout(resolve, 1000));

      await sync({ ...config, ...{ clean: undefined }, all: false });
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

program
  .command('sync')
  .description('Sync files between local project and remote host')
  .addHelpText("after", `
    The sync command watches your local project directory and automatically uploads
    changes to the remote host. It can also perform an initial sync of all files.
    
    Environment Variables:
      BOLTOPS_PROJECT  Project identifier (alternative to --project)
      BOLTOPS_HOST     Host URL (alternative to --host)
      BOLTOPS_SECRET   Required authentication secret
    
    Examples:
      $ BOLTOPS_SECRET=secret boltops sync --project=sb1-abcd5678 --host=http://boltops.localhost:8017 ./project
      $ BOLTOPS_SECRET=secret boltops sync --all --project=sb1-abcd5678 --host=http://boltops.localhost:8017 ./project
    `)
  .option('--project <project>', 'Project ID (or use BOLTOPS_PROJECT env var)')
  .option('--host <host>', 'Host URL (or use BOLTOPS_HOST env var)')
  .option('--subset <directory>', 'Limit operations to files within specified subdirectory')
  .option('--all', 'Sync all files initially')
  .argument('<path>', 'Path to project directory')
  .action(async (path: string, options: { project?: string; host?: string; all?: boolean; subset?: string }) => {
    const config: SyncConfig = {
      project: options.project || process.env.BOLTOPS_PROJECT || '',
      host: options.host || process.env.BOLTOPS_HOST || "http://boltops.localhost:8017",
      secret: process.env.BOLTOPS_SECRET || '',
      all: options.all || false,
      subset: options.subset,
      path
    };

    if (!config.project) {
      console.error(chalk.red('Error: Project ID is required (use --project option or BOLTOPS_PROJECT env var)'));
      process.exit(1);
    }

    if (!config.host || !isValidUrl(config.host)) {
      console.error(chalk.red('Error: Host URL is required (use --host option or BOLTOPS_HOST env var)'));
      console.error(chalk.red('URL must start with http:// or https://'));
      process.exit(1);
    }

    if (!config.secret) {
      console.error(chalk.red('Error: BOLTOPS_SECRET environment variable is required'));
      process.exit(1);
    }

    try {
      await sync(config);
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

program
  .command('host')
  .description('Start a host server')
  .addHelpText("after", `
    The host command starts a server that handles file synchronization requests.
    It manages files under project-specific directories and supports .syncignore
    files for excluding paths from synchronization.
    
    Environment Variables:
      BOLTOPS_SECRET   Required authentication secret
    
    Examples:
      $ BOLTOPS_SECRET=secret boltops host --port=8017 ./workspace
      $ BOLTOPS_SECRET=secret boltops host ./workspace
    `)
  .option('--port <port>', 'Port number')
  .argument('<workspace>', 'Path to workspace directory')
  .action(async (workspace: string, options: { port?: string }) => {
    const config: HostConfig = {
      port: options.port ? parseInt(options.port, 10) : 8017,
      workspace,
      secret: process.env.BOLTOPS_SECRET || ''
    };

    if (!config.secret) {
      console.error(chalk.red('Error: BOLTOPS_SECRET environment variable is required'));
      console.log(chalk.white(`Try re-running with BOLTOPS_SECRET=${crypto.randomUUID()}`));
      process.exit(1);
    }

    try {
      await host(config);
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  });

program.parse();

function isValidUrl(string: string): boolean {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
