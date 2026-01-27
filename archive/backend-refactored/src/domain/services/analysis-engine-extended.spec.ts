/**
 * Extended Analysis Engine Tests
 * Tests for the new configuration and infrastructure analysis features
 */

import { AnalysisEngineService } from './analysis-engine.service';

describe('AnalysisEngineService - Extended Features', () => {
  let service: AnalysisEngineService;

  beforeEach(() => {
    service = new AnalysisEngineService();
  });

  describe('Configuration Analysis', () => {
    it('should have analyzeConfigurations method', () => {
      expect(service.analyzeConfigurations).toBeDefined();
      expect(typeof service.analyzeConfigurations).toBe('function');
    });

    it('should have analyzeExistingSpecs method', () => {
      expect(service.analyzeExistingSpecs).toBeDefined();
      expect(typeof service.analyzeExistingSpecs).toBe('function');
    });
  });

  describe('Infrastructure Analysis', () => {
    it('should have catalogCDKResources method', () => {
      expect(service.catalogCDKResources).toBeDefined();
      expect(typeof service.catalogCDKResources).toBe('function');
    });
  });

  describe('Integration Tests', () => {
    it('should handle non-existent paths gracefully', async () => {
      const configs = await service.analyzeConfigurations('/non/existent/path');
      expect(Array.isArray(configs)).toBe(true);
      expect(configs.length).toBe(0);
    });

    it('should handle non-existent specs directory gracefully', async () => {
      const specs = await service.analyzeExistingSpecs('/non/existent/path');
      expect(Array.isArray(specs)).toBe(true);
      expect(specs.length).toBe(0);
    });

    it('should handle non-existent CDK path gracefully', async () => {
      const resources = await service.catalogCDKResources('/non/existent/path');
      expect(Array.isArray(resources)).toBe(true);
      expect(resources.length).toBe(0);
    });
  });
});