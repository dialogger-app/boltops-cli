import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import { fetchWithAuth } from '../utils/fetch.js';
import { ensureDir, cleanDirectory } from '../utils/fs.js';
import chalk from 'chalk';

interface CopyOptions {
  project: string;
  host: string;
  secret: string;
  path: string;
  clean?: boolean;
}

interface FileListResponse {
  files: string[];
}

export async function copy({ project, host, secret, path: projectPath, clean }: CopyOptions): Promise<void> {
  await ensureDir(projectPath);

  // Fetch list of files to copy
  const listUrl = `${host}/api/sync/list/${project}`;
  const { files } = await fetchWithAuth(listUrl, secret).then(res => res.json()) as FileListResponse;

  // Set up concurrent downloads with a limit
  const limit = pLimit(5);
  const downloads = files.map(filePath => {
    return limit(async () => {
      const fileUrl = `${host}/api/sync/file/${project}/${filePath}`;
      const response = await fetchWithAuth(fileUrl, secret);
      
      if (!response.ok) {
        throw new Error(`Failed to download ${filePath}`);
      }

      const targetPath = path.join(projectPath, filePath);
      await ensureDir(path.dirname(targetPath));

      // TODO: figure out streaming solution instead of response.arrayBuffer
      const buffer = await response.arrayBuffer();
      const fileHandle = await fs.open(targetPath, 'w');
      await fileHandle.write(Buffer.from(buffer));
      await fileHandle.close();

      console.log(chalk.green(`✓ Downloaded ${filePath}`));
    });
  });

  await Promise.all(downloads);

  if (clean) {
    await cleanDirectory(projectPath, files);
  }
}
