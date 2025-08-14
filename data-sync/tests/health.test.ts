import { describe, it, expect } from 'vitest';

describe('Health Check', () => {
  it('should have basic structure', () => {
    expect(true).toBe(true);
  });

  it('should validate environment variables', () => {
    // Basic environment validation test
    const requiredEnvs = ['DATABASE_URL', 'BEDS24_TOKEN'];
    
    requiredEnvs.forEach(env => {
      expect(process.env[env]).toBeDefined();
    });
  });
});