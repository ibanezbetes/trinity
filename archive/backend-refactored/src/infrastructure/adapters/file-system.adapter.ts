/**
 * File System Adapter
 * Infrastructure adapter for file system operations
 */

import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileSystemPort {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  readDirectory(dirPath: string): Promise<string[]>;
  pathExists(path: string): Promise<boolean>;
  getFileStats(filePath: string): Promise<{ size: number; lastModified: Date }>;
  findFiles(rootPath: string, pattern: RegExp, excludePatterns?: RegExp[]): Promise<string[]>;
}

@Injectable()
export class FileSystemAdapter implements FileSystemPort {
  
  async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write file ${filePath}: ${error.message}`);
    }
  }

  async readDirectory(dirPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries.map(entry => entry.name);
    } catch (error) {
      throw new Error(`Failed to read directory ${dirPath}: ${error.message}`);
    }
  }

  async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  async getFileStats(filePath: string): Promise<{ size: number; lastModified: Date }> {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        lastModified: stats.mtime,
      };
    } catch (error) {
      throw new Error(`Failed to get stats for file ${filePath}: ${error.message}`);
    }
  }

  async findFiles(
    rootPath: string,
    pattern: RegExp,
    excludePatterns: RegExp[] = [/node_modules/, /\.git/, /dist/, /build/]
  ): Promise<string[]> {
    const files: string[] = [];
    
    const scanDirectory = async (dirPath: string) => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          // Skip excluded paths
          if (excludePatterns.some(exclude => exclude.test(fullPath))) {
            continue;
          }
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile() && pattern.test(entry.name)) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories that can't be read
        console.warn(`Warning: Could not read directory ${dirPath}: ${error.message}`);
      }
    };
    
    if (await this.pathExists(rootPath)) {
      await scanDirectory(rootPath);
    }
    
    return files;
  }
}