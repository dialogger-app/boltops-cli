import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs/promises';
import { fetchWithAuth } from '../utils/fetch.js';
import { getAllFiles } from '../utils/fs.js';
import chalk from 'chalk';

interface SyncOptions {
  project: string;
  host: string;
  secret: string;
  path: string;
  all?: boolean;
}

interface FileOperationOptions {
  project: string;
  host: string;
  secret: string;
  projectPath?: string;
}

type FileEvent = 'add' | 'change' | 'unlink' | 'unlinkDir';

export async function sync({ project, host, secret, path: projectPath, all }: SyncOptions): Promise<void> {
  if (all) {
    const files = await getAllFiles(projectPath);
    for (const file of files) {
      const filePath = path.join(projectPath, file);
      await uploadFile(filePath, { project, host, secret, projectPath });
      console.log(chalk.green(`Pushed ${file}`));
    }
  }

  const watchPath = path.resolve(projectPath);

  const watcher = chokidar.watch(watchPath, {
    // ignored: /(^|[\/\\])\../, // ignore dotfiles
    ignoreInitial: true,
    persistent: true,
  });

  watcher
    .on('add', path => handleFileChange('add', path))
    .on('change', path => handleFileChange('change', path))
    .on('unlink', path => handleFileChange('unlink', path))
    .on('unlinkDir', path => handleFileChange('unlinkDir', path));

  async function handleFileChange(event: FileEvent, filePath: string): Promise<void> {
    const relativePath = path.relative(projectPath, filePath);

    try {
      if (event === 'unlink' || event === 'unlinkDir') {
        await deleteFile(relativePath, { project, host, secret });
        console.log(chalk.yellow(`Deleted ${relativePath}`));
      } else {
        await uploadFile(filePath, { project, host, secret, projectPath });
        console.log(chalk.green(`Synced ${relativePath}`));
      }
    } catch (error) {
      console.error(chalk.red(`Error syncing ${relativePath}: ${(error as Error).message}`));
    }
  }

  console.log(chalk.blue('Watching for file changes... Press Ctrl+C to stop'));

  // Keep process alive while watching
  process.stdin.resume();
}

async function uploadFile(filePath: string, { project, host, secret, projectPath }: FileOperationOptions): Promise<void> {
  const relativePath = projectPath ? path.relative(projectPath, filePath) : filePath;
  const url = `${host}/sync/file/${project}/${relativePath}`;
  const fileHandle = await fs.open(filePath, 'r');
  const readStream = fileHandle.createReadStream();
  
  try {
    await fetchWithAuth(url, secret, {
      method: 'PUT',
      ...{
        // TODO: fix these types
        duplex: 'half' as never,
        body: readStream as never
      }
    });
  } finally {
    await fileHandle.close();
  }
}

async function deleteFile(relativePath: string, { project, host, secret }: FileOperationOptions): Promise<void> {
  const url = `${host}/sync/file/${project}/${relativePath}`;
  await fetchWithAuth(url, secret, {
    method: 'DELETE'
  });
}
