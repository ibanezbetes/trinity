/**
 * React Native Scanner Adapter
 * Infrastructure adapter for scanning React Native/Expo applications
 */

import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { IReactNativeScanner } from '../../domain/services/analysis-engine.interface';
import {
  ComponentInfo,
  NavigationInfo,
  ReactNativeConfigFiles,
  BuildInfo,
  PropInfo,
  HookInfo,
  NavigatorInfo,
  ScreenInfo,
  RouteInfo,
  DeepLinkInfo,
  AppJsonInfo,
  MetroConfigInfo,
  BabelConfigInfo,
  EasJsonInfo,
  ExpoConfigInfo,
  AssetInfo,
  ReactNativePerformanceMetrics,
} from '../../domain/entities/analysis.entity';

@Injectable()
export class ReactNativeScannerAdapter implements IReactNativeScanner {
  private readonly logger = new Logger(ReactNativeScannerAdapter.name);

  async scanComponents(scanPath: string): Promise<ComponentInfo[]> {
    this.logger.log(`Scanning React Native components in path: ${scanPath}`);

    try {
      const components: ComponentInfo[] = [];
      await this.scanComponentsRecursive(scanPath, components);

      this.logger.log(`Found ${components.length} React Native components`);
      return components;
    } catch (error) {
      this.logger.error(`Failed to scan React Native components: ${error.message}`, error.stack);
      throw new Error(`Failed to scan React Native components: ${error.message}`);
    }
  }

  async analyzeNavigation(scanPath: string): Promise<NavigationInfo> {
    this.logger.log(`Analyzing navigation structure in path: ${scanPath}`);

    try {
      const navigators = await this.findNavigators(scanPath);
      const screens = await this.findScreens(scanPath);
      const routes = await this.findRoutes(scanPath);
      const deepLinks = await this.findDeepLinks(scanPath);

      const navigationInfo: NavigationInfo = {
        navigators,
        screens,
        routes,
        deepLinks,
      };

      this.logger.log(`Navigation analysis completed: ${navigators.length} navigators, ${screens.length} screens`);
      return navigationInfo;
    } catch (error) {
      this.logger.error(`Failed to analyze navigation: ${error.message}`, error.stack);
      throw new Error(`Failed to analyze navigation: ${error.message}`);
    }
  }

  async scanConfigFiles(scanPath: string): Promise<ReactNativeConfigFiles> {
    this.logger.log(`Scanning React Native config files in path: ${scanPath}`);

    try {
      const [appJson, packageJson, metroConfig, babelConfig, easJson, expoConfig] = await Promise.all([
        this.scanAppJson(scanPath),
        this.scanPackageJson(scanPath),
        this.scanMetroConfig(scanPath),
        this.scanBabelConfig(scanPath),
        this.scanEasJson(scanPath),
        this.scanExpoConfig(scanPath),
      ]);

      const configFiles: ReactNativeConfigFiles = {
        appJson,
        packageJson,
        metroConfig,
        babelConfig,
        easJson,
        expoConfig,
      };

      this.logger.log('React Native config files scan completed');
      return configFiles;
    } catch (error) {
      this.logger.error(`Failed to scan config files: ${error.message}`, error.stack);
      throw new Error(`Failed to scan config files: ${error.message}`);
    }
  }

  async analyzeBuildInfo(scanPath: string): Promise<BuildInfo> {
    this.logger.log(`Analyzing build information in path: ${scanPath}`);

    try {
      // This would typically analyze build artifacts, but for now we'll create a basic structure
      const appJsonPath = path.join(scanPath, 'app.json');
      const packageJsonPath = path.join(scanPath, 'package.json');

      let platform: 'ios' | 'android' | 'web' = 'android';
      let sdkVersion = 'unknown';
      let dependencies: Record<string, string> = {};

      try {
        const appJsonContent = await fs.readFile(appJsonPath, 'utf-8');
        const appJson = JSON.parse(appJsonContent);
        sdkVersion = appJson.expo?.sdkVersion || 'unknown';
        
        if (appJson.expo?.platforms) {
          platform = appJson.expo.platforms.includes('ios') ? 'ios' : 
                    appJson.expo.platforms.includes('android') ? 'android' : 'web';
        }
      } catch (error) {
        this.logger.warn(`Could not read app.json: ${error.message}`);
      }

      try {
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);
        dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      } catch (error) {
        this.logger.warn(`Could not read package.json: ${error.message}`);
      }

      const assets = await this.scanAssets(scanPath);
      const bundleSize = this.calculateBundleSize(assets);

      const buildInfo: BuildInfo = {
        platform,
        buildType: 'development',
        buildNumber: '1.0.0',
        buildDate: new Date(),
        sdkVersion,
        dependencies,
        bundleSize,
        assets,
      };

      this.logger.log(`Build analysis completed: ${assets.length} assets, ${bundleSize} bytes bundle size`);
      return buildInfo;
    } catch (error) {
      this.logger.error(`Failed to analyze build info: ${error.message}`, error.stack);
      throw new Error(`Failed to analyze build info: ${error.message}`);
    }
  }

  private async scanComponentsRecursive(dirPath: string, components: ComponentInfo[], depth = 0): Promise<void> {
    if (depth > 10) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (this.shouldSkipDirectory(entry.name)) continue;
          await this.scanComponentsRecursive(fullPath, components, depth + 1);
        } else if (entry.isFile() && this.isReactNativeFile(entry.name)) {
          const componentInfo = await this.analyzeReactNativeFile(fullPath);
          if (componentInfo) {
            components.push(componentInfo);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to scan directory ${dirPath}: ${error.message}`);
    }
  }

  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = ['node_modules', '.git', 'dist', 'build', 'coverage', '.expo', 'android', 'ios', '__tests__'];
    return skipDirs.includes(dirName) || dirName.startsWith('.');
  }

  private isReactNativeFile(fileName: string): boolean {
    return (fileName.endsWith('.tsx') || fileName.endsWith('.ts') || fileName.endsWith('.jsx') || fileName.endsWith('.js')) &&
           !fileName.endsWith('.test.tsx') && !fileName.endsWith('.test.ts') &&
           !fileName.endsWith('.spec.tsx') && !fileName.endsWith('.spec.ts');
  }

  private async analyzeReactNativeFile(filePath: string): Promise<ComponentInfo | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);

      // Check if this is a React component
      if (!this.isReactComponent(content)) return null;

      const componentName = this.extractComponentName(content, filePath);
      const componentType = this.determineComponentType(content);
      const props = this.extractProps(content);
      const hooks = this.extractHooks(content);
      const dependencies = this.extractDependencies(content);
      const exports = this.extractExports(content);
      const isScreen = this.isScreenComponent(content, filePath);
      const isReusable = this.isReusableComponent(content, filePath);
      const complexity = this.calculateComponentComplexity(content);

      const componentInfo: ComponentInfo = {
        name: componentName,
        path: filePath,
        type: componentType,
        props,
        hooks,
        dependencies,
        exports,
        isScreen,
        isReusable,
        complexity,
        lastModified: stats.mtime,
      };

      return componentInfo;
    } catch (error) {
      this.logger.warn(`Failed to analyze React Native file ${filePath}: ${error.message}`);
      return null;
    }
  }

  private isReactComponent(content: string): boolean {
    return content.includes('import React') || 
           content.includes('from \'react\'') ||
           content.includes('from "react"') ||
           content.includes('React.') ||
           content.includes('export default function') ||
           content.includes('export const') && (content.includes('FC<') || content.includes('FunctionComponent<'));
  }

  private extractComponentName(content: string, filePath: string): string {
    // Try to extract from export default
    const exportDefaultMatch = content.match(/export\s+default\s+(?:function\s+)?(\w+)/);
    if (exportDefaultMatch) {
      return exportDefaultMatch[1];
    }

    // Try to extract from function declaration
    const functionMatch = content.match(/(?:export\s+)?(?:const|function)\s+(\w+)/);
    if (functionMatch) {
      return functionMatch[1];
    }

    // Fall back to filename
    return path.basename(filePath, path.extname(filePath));
  }

  private determineComponentType(content: string): ComponentInfo['type'] {
    if (content.includes('class') && content.includes('extends') && content.includes('Component')) {
      return 'class';
    }
    if (content.includes('createContext') || content.includes('useContext')) {
      return 'context';
    }
    if (content.includes('use') && content.match(/export\s+(?:const|function)\s+use\w+/)) {
      return 'hook';
    }
    if (content.includes('withHOC') || content.includes('HOC') || 
        (content.includes('return') && content.includes('Component') && content.includes('=>'))) {
      return 'hoc';
    }
    return 'functional';
  }

  private extractProps(content: string): PropInfo[] {
    const props: PropInfo[] = [];
    
    // Look for TypeScript interface props
    const interfaceMatch = content.match(/interface\s+\w*Props\s*\{([^}]+)\}/s);
    if (interfaceMatch) {
      const propsContent = interfaceMatch[1];
      const propMatches = propsContent.matchAll(/(\w+)(\?)?:\s*([^;,\n]+)/g);
      
      for (const match of propMatches) {
        props.push({
          name: match[1],
          type: match[3].trim(),
          isRequired: !match[2],
          description: this.extractPropDescription(content, match[1]),
        });
      }
    }

    // Look for destructured props in function parameters
    const destructuredMatch = content.match(/\(\s*\{\s*([^}]+)\s*\}/);
    if (destructuredMatch) {
      const propsContent = destructuredMatch[1];
      const propNames = propsContent.split(',').map(p => p.trim().split(':')[0].trim());
      
      for (const propName of propNames) {
        if (!props.find(p => p.name === propName)) {
          props.push({
            name: propName,
            type: 'any',
            isRequired: true,
          });
        }
      }
    }

    return props;
  }

  private extractPropDescription(content: string, propName: string): string | undefined {
    // Look for JSDoc comments above the prop
    const propRegex = new RegExp(`/\\*\\*([^*]|\\*(?!/))*\\*/\\s*${propName}`, 'g');
    const match = propRegex.exec(content);
    if (match) {
      return match[0].replace(/\/\*\*|\*\/|\*/g, '').trim();
    }
    return undefined;
  }

  private extractHooks(content: string): HookInfo[] {
    const hooks: HookInfo[] = [];
    const hookPatterns = [
      { pattern: /useState\s*\(/g, type: 'useState' as const },
      { pattern: /useEffect\s*\(/g, type: 'useEffect' as const },
      { pattern: /useContext\s*\(/g, type: 'useContext' as const },
      { pattern: /useReducer\s*\(/g, type: 'useReducer' as const },
      { pattern: /useMemo\s*\(/g, type: 'useMemo' as const },
      { pattern: /useCallback\s*\(/g, type: 'useCallback' as const },
      { pattern: /use\w+\s*\(/g, type: 'custom' as const },
    ];

    for (const { pattern, type } of hookPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const hookName = match[0].replace(/\s*\($/, '');
        
        if (type === 'custom' && !hookName.startsWith('use')) continue;
        if (type !== 'custom' && !hookName.startsWith(type)) continue;

        hooks.push({
          name: hookName,
          type,
          dependencies: this.extractHookDependencies(content, match.index || 0),
          isCustom: type === 'custom',
        });
      }
    }

    return hooks;
  }

  private extractHookDependencies(content: string, hookIndex: number): string[] {
    // This is a simplified implementation
    // In a real implementation, you would parse the dependency array for useEffect, useMemo, etc.
    return [];
  }

  private extractDependencies(content: string): string[] {
    const dependencies: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      dependencies.push(match[1]);
    }

    return [...new Set(dependencies)];
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const exportRegex = /export\s+(?:default\s+)?(?:const|function|class)\s+(\w+)/g;
    let match;

    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    return exports;
  }

  private isScreenComponent(content: string, filePath: string): boolean {
    const fileName = path.basename(filePath).toLowerCase();
    return fileName.includes('screen') || 
           fileName.includes('page') ||
           content.includes('navigation.navigate') ||
           content.includes('useNavigation') ||
           filePath.includes('/screens/') ||
           filePath.includes('/pages/');
  }

  private isReusableComponent(content: string, filePath: string): boolean {
    const fileName = path.basename(filePath).toLowerCase();
    return !this.isScreenComponent(content, filePath) &&
           (filePath.includes('/components/') ||
            filePath.includes('/ui/') ||
            fileName.includes('component') ||
            content.includes('export default') ||
            content.includes('export const'));
  }

  private calculateComponentComplexity(content: string): number {
    const lines = content.split('\n').length;
    const hooks = (content.match(/use\w+\s*\(/g) || []).length;
    const conditions = (content.match(/\b(if|switch|&&|\|\||\?)\b/g) || []).length;
    const loops = (content.match(/\b(for|while|map|forEach|filter|reduce)\b/g) || []).length;
    const jsx = (content.match(/<\w+/g) || []).length;

    return Math.round((lines / 20) + (hooks * 2) + (conditions * 1.5) + (loops * 2) + (jsx / 5));
  }

  private async findNavigators(scanPath: string): Promise<NavigatorInfo[]> {
    const navigators: NavigatorInfo[] = [];
    
    try {
      await this.findFilesRecursive(scanPath, '*.tsx', async (filePath) => {
        const content = await fs.readFile(filePath, 'utf-8');
        
        if (content.includes('createStackNavigator') || 
            content.includes('createTabNavigator') ||
            content.includes('createDrawerNavigator')) {
          
          const navigatorType = this.determineNavigatorType(content);
          const navigatorName = this.extractNavigatorName(content, filePath);
          const screens = this.extractNavigatorScreens(content);
          
          navigators.push({
            name: navigatorName,
            type: navigatorType,
            screens,
            options: this.extractNavigatorOptions(content),
          });
        }
      });
    } catch (error) {
      this.logger.warn(`Failed to find navigators: ${error.message}`);
    }

    return navigators;
  }

  private determineNavigatorType(content: string): NavigatorInfo['type'] {
    if (content.includes('createStackNavigator')) return 'stack';
    if (content.includes('createTabNavigator') || content.includes('createBottomTabNavigator')) return 'tab';
    if (content.includes('createDrawerNavigator')) return 'drawer';
    return 'modal';
  }

  private extractNavigatorName(content: string, filePath: string): string {
    const constMatch = content.match(/const\s+(\w+)\s*=\s*create\w+Navigator/);
    if (constMatch) return constMatch[1];
    
    return path.basename(filePath, path.extname(filePath));
  }

  private extractNavigatorScreens(content: string): string[] {
    const screens: string[] = [];
    const screenMatches = content.matchAll(/<\w+\.Screen\s+name=['"]([^'"]+)['"]/g);
    
    for (const match of screenMatches) {
      screens.push(match[1]);
    }

    return screens;
  }

  private extractNavigatorOptions(content: string): Record<string, any> {
    // Simplified options extraction
    return {};
  }

  private async findScreens(scanPath: string): Promise<ScreenInfo[]> {
    const screens: ScreenInfo[] = [];
    
    try {
      await this.findFilesRecursive(scanPath, '*.tsx', async (filePath) => {
        if (this.isScreenFile(filePath)) {
          const content = await fs.readFile(filePath, 'utf-8');
          const screenName = this.extractScreenName(content, filePath);
          const componentName = this.extractComponentName(content, filePath);
          
          screens.push({
            name: screenName,
            component: componentName,
            path: filePath,
            params: this.extractScreenParams(content),
            options: this.extractScreenOptions(content),
          });
        }
      });
    } catch (error) {
      this.logger.warn(`Failed to find screens: ${error.message}`);
    }

    return screens;
  }

  private isScreenFile(filePath: string): boolean {
    const fileName = path.basename(filePath).toLowerCase();
    return fileName.includes('screen') || 
           fileName.includes('page') ||
           filePath.includes('/screens/') ||
           filePath.includes('/pages/');
  }

  private extractScreenName(content: string, filePath: string): string {
    // Try to find screen name from navigation registration
    const screenMatch = content.match(/name=['"]([^'"]+)['"]/);
    if (screenMatch) return screenMatch[1];
    
    return path.basename(filePath, path.extname(filePath));
  }

  private extractScreenParams(content: string): Record<string, any> | undefined {
    // Simplified parameter extraction
    return undefined;
  }

  private extractScreenOptions(content: string): Record<string, any> | undefined {
    // Simplified options extraction
    return undefined;
  }

  private async findRoutes(scanPath: string): Promise<RouteInfo[]> {
    // Simplified route finding
    return [];
  }

  private async findDeepLinks(scanPath: string): Promise<DeepLinkInfo[]> {
    // Simplified deep link finding
    return [];
  }

  private async scanAppJson(scanPath: string): Promise<AppJsonInfo> {
    try {
      const appJsonPath = path.join(scanPath, 'app.json');
      const content = await fs.readFile(appJsonPath, 'utf-8');
      const appJson = JSON.parse(content);
      
      return {
        expo: {
          name: appJson.expo?.name || 'Unknown App',
          slug: appJson.expo?.slug || 'unknown-app',
          version: appJson.expo?.version || '1.0.0',
          platforms: appJson.expo?.platforms || ['ios', 'android'],
          orientation: appJson.expo?.orientation || 'portrait',
          icon: appJson.expo?.icon || '',
          splash: appJson.expo?.splash || {},
          updates: appJson.expo?.updates || {},
          assetBundlePatterns: appJson.expo?.assetBundlePatterns || [],
          ios: appJson.expo?.ios,
          android: appJson.expo?.android,
          web: appJson.expo?.web,
        },
      };
    } catch (error) {
      this.logger.warn(`Failed to scan app.json: ${error.message}`);
      return {
        expo: {
          name: 'Unknown App',
          slug: 'unknown-app',
          version: '1.0.0',
          platforms: ['ios', 'android'],
          orientation: 'portrait',
          icon: '',
          splash: {},
          updates: {},
          assetBundlePatterns: [],
        },
      };
    }
  }

  private async scanPackageJson(scanPath: string): Promise<any> {
    try {
      const packageJsonPath = path.join(scanPath, 'package.json');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.warn(`Failed to scan package.json: ${error.message}`);
      return {};
    }
  }

  private async scanMetroConfig(scanPath: string): Promise<MetroConfigInfo> {
    try {
      const metroConfigPath = path.join(scanPath, 'metro.config.js');
      const content = await fs.readFile(metroConfigPath, 'utf-8');
      
      // This is a simplified parsing - in reality you'd need to evaluate the JS
      return {
        resolver: {},
        transformer: {},
        serializer: {},
        server: {},
      };
    } catch (error) {
      this.logger.warn(`Failed to scan metro.config.js: ${error.message}`);
      return {
        resolver: {},
        transformer: {},
        serializer: {},
        server: {},
      };
    }
  }

  private async scanBabelConfig(scanPath: string): Promise<BabelConfigInfo> {
    try {
      const babelConfigPath = path.join(scanPath, 'babel.config.js');
      const content = await fs.readFile(babelConfigPath, 'utf-8');
      
      // This is a simplified parsing - in reality you'd need to evaluate the JS
      return {
        presets: [],
        plugins: [],
        env: {},
      };
    } catch (error) {
      this.logger.warn(`Failed to scan babel.config.js: ${error.message}`);
      return {
        presets: [],
        plugins: [],
        env: {},
      };
    }
  }

  private async scanEasJson(scanPath: string): Promise<EasJsonInfo | undefined> {
    try {
      const easJsonPath = path.join(scanPath, 'eas.json');
      const content = await fs.readFile(easJsonPath, 'utf-8');
      const easJson = JSON.parse(content);
      
      return {
        cli: easJson.cli || {},
        build: easJson.build || {},
        submit: easJson.submit || {},
      };
    } catch (error) {
      this.logger.warn(`Failed to scan eas.json: ${error.message}`);
      return undefined;
    }
  }

  private async scanExpoConfig(scanPath: string): Promise<ExpoConfigInfo | undefined> {
    try {
      const expoConfigPath = path.join(scanPath, 'expo.json');
      const content = await fs.readFile(expoConfigPath, 'utf-8');
      const expoConfig = JSON.parse(content);
      
      return {
        name: expoConfig.name || 'Unknown App',
        slug: expoConfig.slug || 'unknown-app',
        version: expoConfig.version || '1.0.0',
        sdkVersion: expoConfig.sdkVersion || 'unknown',
        platforms: expoConfig.platforms || ['ios', 'android'],
        extra: expoConfig.extra || {},
      };
    } catch (error) {
      this.logger.warn(`Failed to scan expo.json: ${error.message}`);
      return undefined;
    }
  }

  private async scanAssets(scanPath: string): Promise<AssetInfo[]> {
    const assets: AssetInfo[] = [];
    const assetExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ttf', '.otf', '.mp3', '.mp4', '.wav'];
    
    try {
      await this.findAssetsRecursive(scanPath, assetExtensions, async (filePath) => {
        try {
          const stats = await fs.stat(filePath);
          const ext = path.extname(filePath).toLowerCase();
          
          assets.push({
            name: path.basename(filePath),
            path: filePath,
            size: stats.size,
            type: this.getAssetType(ext),
            optimized: false, // Would need more sophisticated analysis
          });
        } catch (error) {
          this.logger.warn(`Failed to analyze asset ${filePath}: ${error.message}`);
        }
      });
    } catch (error) {
      this.logger.warn(`Failed to scan assets: ${error.message}`);
    }

    return assets;
  }

  private getAssetType(extension: string): AssetInfo['type'] {
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg'];
    const fontExts = ['.ttf', '.otf'];
    const audioExts = ['.mp3', '.wav'];
    const videoExts = ['.mp4'];

    if (imageExts.includes(extension)) return 'image';
    if (fontExts.includes(extension)) return 'font';
    if (audioExts.includes(extension)) return 'audio';
    if (videoExts.includes(extension)) return 'video';
    return 'other';
  }

  private calculateBundleSize(assets: AssetInfo[]): number {
    return assets.reduce((total, asset) => total + asset.size, 0);
  }

  private async findFilesRecursive(
    dirPath: string,
    pattern: string,
    callback: (filePath: string) => Promise<void>,
    depth = 0
  ): Promise<void> {
    if (depth > 10) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (this.shouldSkipDirectory(entry.name)) continue;
          await this.findFilesRecursive(fullPath, pattern, callback, depth + 1);
        } else if (entry.isFile()) {
          if (this.matchesPattern(entry.name, pattern)) {
            await callback(fullPath);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to scan directory ${dirPath}: ${error.message}`);
    }
  }

  private async findAssetsRecursive(
    dirPath: string,
    extensions: string[],
    callback: (filePath: string) => Promise<void>,
    depth = 0
  ): Promise<void> {
    if (depth > 10) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (this.shouldSkipDirectory(entry.name)) continue;
          await this.findAssetsRecursive(fullPath, extensions, callback, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            await callback(fullPath);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to scan directory ${dirPath}: ${error.message}`);
    }
  }

  private matchesPattern(fileName: string, pattern: string): boolean {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(fileName);
    }
    return fileName === pattern;
  }
}