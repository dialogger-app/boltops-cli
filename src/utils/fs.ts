import fs from 'fs/promises';
import path from 'path';

export async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    if ((error as { code: string }).code !== 'EEXIST') {
      throw error;
    }
  }
}

export async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function scan(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(dir, fullPath);
      
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else {
        files.push(relativePath);
      }
    }
  }
  
  await scan(dir);
  return files;
}

export async function cleanDirectory(dir: string, keepFiles: string[], subset?: string): Promise<void> {
  let currentFiles = await getAllFiles(dir);
  
  // If subset is specified, only consider files within that directory
  if (subset) {
    const prefix = path.normalize(subset);
    currentFiles = currentFiles.filter(file => path.normalize(file).startsWith(prefix));
  }
  
  for (const file of currentFiles) {
    if (!keepFiles.includes(file)) {
      await fs.unlink(path.join(dir, file));
    }
  }
  
  // Clean up empty directories
  async function cleanEmptyDirs(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(directory, entry.name);
        await cleanEmptyDirs(fullPath);
        
        // Check if directory is empty after cleaning subdirectories
        const remainingEntries = await fs.readdir(fullPath);
        if (remainingEntries.length === 0) {
          await fs.rmdir(fullPath);
        }
      }
    }
  }
  
  await cleanEmptyDirs(dir);
}
