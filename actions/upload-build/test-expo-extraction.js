#!/usr/bin/env node

// Mock GitHub Actions core module
const mockCore = {
  getInput: (name, options) => {
    const inputs = {
      'build-var-id': '811a4cc4-bcd9-40b2-afb3-9094c85d7c59',
      'version': 'test-expo-extraction-' + Date.now(),
      'expo-url': 'https://httpbin.org/bytes/1024',
      'expo-headers': '{"Authorization": "Bearer test-expo-token"}',
      'metadata': JSON.stringify({
        platform: "Android",
        app_id: "com.test.expo",
        build_system: "eas"
      }),
      'timeout': '1800'
    };
    
    const value = inputs[name];
    console.log(`🔍 INPUT: ${name} = ${value || '(empty)'}`);
    return value || '';
  },
  
  setOutput: (name, value) => {
    console.log(`📤 OUTPUT: ${name} = ${value}`);
  },
  
  info: (message) => {
    console.log(`ℹ️  INFO: ${message}`);
  },
  
  warning: (message) => {
    console.log(`⚠️  WARNING: ${message}`);
  },
  
  setFailed: (message) => {
    console.error(`❌ FAILED: ${message}`);
  }
};

// Set environment
process.env.REVYL_API_KEY = 'ff61325f5641560d79e441bee96d78666a86df736e5ca4a9bea7078c9a10d8a4ef3551d67463b32758f73e2e3186d228';

console.log('🧪 TESTING EXPO PACKAGE EXTRACTION');
console.log('='.repeat(50));
console.log('🔗 Testing with: https://httpbin.org/bytes/1024');
console.log('📦 Expected: Should try to extract package info');
console.log('='.repeat(50));
console.log('');

// Temporarily modify backend URL
const fs = require('fs');
const path = require('path');
const mainJsPath = path.join(__dirname, 'src', 'main.js');
let mainJsContent = fs.readFileSync(mainJsPath, 'utf8');
const originalContent = mainJsContent;

mainJsContent = mainJsContent.replace(
  'https://backend-staging.cognisim.io',
  'http://localhost:8000'
);
fs.writeFileSync(mainJsPath, mainJsContent);

// Mock the core module
require.cache[require.resolve('@actions/core')] = { exports: mockCore };
delete require.cache[require.resolve('./src/main.js')];

const { run } = require('./src/main.js');

run().then(() => {
  console.log('');
  console.log('✅ TEST COMPLETED!');
}).catch((error) => {
  console.log('');
  console.log('❌ ERROR:', error.message);
}).finally(() => {
  // Restore original
  fs.writeFileSync(mainJsPath, originalContent);
  console.log('');
  console.log('🔧 Restored original backend URL');
});
