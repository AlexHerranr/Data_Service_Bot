// Test setup file for Beds24 Sync Service
import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

console.log('🧪 Test environment initialized for Beds24 Sync Service');