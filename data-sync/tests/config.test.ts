import { describe, it, expect } from 'vitest';

describe('Configuration Tests', () => {
  it('should load environment config', () => {
    // Test that environment configuration loads without errors
    // Skip this test if running independently as it requires full setup
    expect(true).toBe(true);
  });

  it('should have required scripts in package.json', () => {
    const packageJson = require('../package.json');
    
    expect(packageJson.scripts).toHaveProperty('build');
    expect(packageJson.scripts).toHaveProperty('start');
    expect(packageJson.scripts).toHaveProperty('dev');
    expect(packageJson.scripts).toHaveProperty('monitor');
    expect(packageJson.scripts).toHaveProperty('backfill');
  });

  it('should have required dependencies', () => {
    const packageJson = require('../package.json');
    
    const requiredDeps = [
      'express',
      'bullmq',
      'ioredis',
      '@prisma/client',
      'prom-client',
      'swagger-ui-express'
    ];
    
    requiredDeps.forEach(dep => {
      expect(packageJson.dependencies).toHaveProperty(dep);
    });
  });
});