import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import fs from 'fs/promises';
import path from 'path';
import chokidar from 'chokidar';
import micromatch from 'micromatch';
import { ensureDir } from '../utils/fs.js';
import chalk from 'chalk';

interface HostOptions {
  port: number;
  workspace: string;
  secret: string;
}

interface ProjectConfig {
  ignorePatterns?: string[];
}

export async function host({ port, workspace, secret }: HostOptions): Promise<void> {
  const app = new Hono();
  const projectConfigs = new Map<string, ProjectConfig>();

  // Middleware to check authentication
  app.use(async (c, next) => {
    const auth = c.req.header('Authorization');
    if (!auth || auth !== `Bearer ${secret}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  });

  app.get('/status', async (c) => {
    return c.json({
      status: 'healthy',
      version: '1.0.0'
    });
  });

  // Get list of files for a project
  app.get('/sync/list/:project', async (c) => {
    const { project } = c.req.param();
    const projectPath = path.join(workspace, 'projects', project);

    try {
      await fs.access(projectPath);
    } catch {
      return c.json({ error: 'Project not found' }, 404);
    }
    
    try {
      const files = await getAllProjectFiles(projectPath);
      const config = projectConfigs.get(project);
      
      if (config?.ignorePatterns) {
        return c.json(files.filter(file => !isIgnored(file, config.ignorePatterns!)));
      }
      
      return c.json({ files });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });

  // Get file content
  app.get('/sync/file/:project/*', async (c) => {
    const { project } = c.req.param();
    const filePath = c.req.path.replace(`/sync/file/${project}/`, '');
    const fullPath = path.join(workspace, 'projects', project, filePath);

    try {
      await fs.access(fullPath);
    } catch {
      return c.json({ error: 'File not found' }, 404);
    }

    const config = projectConfigs.get(project);
    if (config?.ignorePatterns && isIgnored(filePath, config.ignorePatterns)) {
      return c.json({ error: 'File is ignored' }, 403);
    }

    try {
      const fileStream = await fs.open(fullPath, 'r').then(handle => handle.createReadStream());
      return c.body(fileStream as never); // TODO: fix these types
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });

  // Upload file content
  app.put('/sync/file/:project/*', async (c) => {
    const { project } = c.req.param();
    const filePath = c.req.path.replace(`/sync/file/${project}/`, '');
    const projectPath = path.join(workspace, 'projects', project);
    const fullPath = path.join(projectPath, filePath);

    try {
      await fs.access(projectPath);
    } catch {
      return c.json({ error: 'Project not found' }, 404);
    }

    const config = projectConfigs.get(project);
    if (config?.ignorePatterns && isIgnored(filePath, config.ignorePatterns)) {
      return c.json({ error: 'File is ignored' }, 403);
    }

    try {
      await ensureDir(path.dirname(fullPath));
      const fileData = await c.req.arrayBuffer();
      await fs.writeFile(fullPath, Buffer.from(fileData));
      return c.json({ status: 'success' });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });

  // Delete file
  app.delete('/sync/file/:project/*', async (c) => {
    const { project } = c.req.param();
    const filePath = c.req.path.replace(`/sync/file/${project}/`, '');
    const fullPath = path.join(workspace, 'projects', project, filePath);

    try {
      await fs.access(fullPath);
    } catch {
      return c.json({ error: 'File not found' }, 404);
    }

    const config = projectConfigs.get(project);
    if (config?.ignorePatterns && isIgnored(filePath, config.ignorePatterns)) {
      return c.json({ error: 'File is ignored' }, 403);
    }

    try {
      await fs.unlink(fullPath);
      return c.json({ status: 'success' });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });

  await ensureDir(path.join(workspace, 'projects'));
  await ensureDir(path.join(workspace, 'configs'));

  // Watch for .syncignore changes
  const watcher = chokidar.watch(path.join(workspace, 'configs', '*', '.syncignore'));
  watcher.on('all', async (event, filePath) => {
    const project = path.basename(path.dirname(filePath));

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const patterns = content.split('\n').filter(Boolean);
      projectConfigs.set(project, { ignorePatterns: patterns });
    } catch (error) {
      projectConfigs.delete(project);
    }
  });

  console.log(chalk.green(`Starting server on port ${port}`));
  serve({
    fetch: app.fetch,
    port
  });
}

async function getAllProjectFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  async function walk(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(dir, fullPath);
      
      if (entry.isDirectory() && !ALWAYS_IGNORED.includes(entry.name)) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }
  
  await walk(dir);
  return files;
}

function isIgnored(filePath: string, patterns: string[]): boolean {
  return patterns.some(pattern => micromatch.isMatch(filePath, pattern));
}

const ALWAYS_IGNORED: string[] = [
  '.git',
];
