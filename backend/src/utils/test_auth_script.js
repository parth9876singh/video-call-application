/**
 * Integration Test Script for VibeCall Authentication API
 * 
 * Instructions to run:
 * 1. Ensure MongoDB and the backend server (npm run dev) are running.
 * 2. Run this script using: node src/utils/test_auth_script.js
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api';
const testEmail = `testuser_${Date.now()}@example.com`;
const testPassword = 'SecurePassword123';
const testName = 'Test User';

const runTests = async () => {
  console.log('⚡ Starting Authentication API Tests...\n');
  let cookieHeader = '';

  // Helper Axios client to hold cookie sessions
  const client = axios.create({
    baseURL: BASE_URL,
    validateStatus: () => true, // Don't throw on error status codes
  });

  // Intercept responses to extract and save the session cookie
  client.interceptors.response.use((response) => {
    const cookies = response.headers['set-cookie'];
    if (cookies) {
      cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
    }
    return response;
  });

  // Inject the session cookie into subsequent requests
  client.interceptors.request.use((config) => {
    if (cookieHeader) {
      config.headers['Cookie'] = cookieHeader;
    }
    return config;
  });

  try {
    // ----------------------------------------------------
    // TEST 1: Register User
    // ----------------------------------------------------
    console.log(`[TEST 1] Registering a new user (${testEmail})...`);
    const regRes = await client.post('/auth/register', {
      name: testName,
      email: testEmail,
      password: testPassword,
      bio: 'Automation tester'
    });

    if (regRes.status === 201 && regRes.data.success) {
      console.log('✅ Registration successful!');
      console.log(`👤 User ID: ${regRes.data.user.id}`);
      console.log(`🍪 Token cookie retrieved: ${cookieHeader ? 'Yes' : 'No'}\n`);
    } else {
      console.error('❌ Registration failed:', regRes.data);
      process.exit(1);
    }

    // ----------------------------------------------------
    // TEST 2: Prevent Duplicate Registration
    // ----------------------------------------------------
    console.log('[TEST 2] Trying to register duplicate account...');
    const dupRes = await client.post('/auth/register', {
      name: testName,
      email: testEmail,
      password: testPassword
    });

    if (dupRes.status === 409) {
      console.log('✅ Correctly blocked duplicate account registration (409 Conflict).\n');
    } else {
      console.error('❌ Failed: Duplicate registration was not blocked correctly. Status:', dupRes.status);
      process.exit(1);
    }

    // ----------------------------------------------------
    // TEST 3: Validate Request Inputs (Zod checks)
    // ----------------------------------------------------
    console.log('[TEST 3] Trying to login with malformed email...');
    const invalidEmailRes = await client.post('/auth/login', {
      email: 'not-an-email',
      password: testPassword
    });

    if (invalidEmailRes.status === 400 && invalidEmailRes.data.message === 'Validation failed') {
      console.log('✅ Correctly triggered input validation failure (400 Bad Request).');
      console.log('Errors:', invalidEmailRes.data.errors, '\n');
    } else {
      console.error('❌ Failed: Input validation did not trigger 400. Status:', invalidEmailRes.status);
      process.exit(1);
    }

    // ----------------------------------------------------
    // TEST 4: Login User & Set Session Cookie
    // ----------------------------------------------------
    console.log('[TEST 4] Logging in with correct credentials...');
    // Reset cookie context
    cookieHeader = ''; 
    const loginRes = await client.post('/auth/login', {
      email: testEmail,
      password: testPassword
    });

    if (loginRes.status === 200 && loginRes.data.success) {
      console.log('✅ Login successful!');
      console.log(`👤 User display name: ${loginRes.data.user.name}`);
      console.log(`🍪 Cookie session set: ${cookieHeader ? 'Yes' : 'No'}\n`);
    } else {
      console.error('❌ Login failed:', loginRes.data);
      process.exit(1);
    }

    // ----------------------------------------------------
    // TEST 5: Get Current Authorized Profile (/me)
    // ----------------------------------------------------
    console.log('[TEST 5] Querying user profile /auth/me using session cookie...');
    const meRes = await client.get('/auth/me');

    if (meRes.status === 200 && meRes.data.success) {
      console.log('✅ Profile verification successful!');
      console.log('Profile Details:', meRes.data.user, '\n');
    } else {
      console.error('❌ Profile retrieval failed:', meRes.data);
      process.exit(1);
    }

    // ----------------------------------------------------
    // TEST 6: Logout and Revoke Session
    // ----------------------------------------------------
    console.log('[TEST 6] Logging out user...');
    const logoutRes = await client.post('/auth/logout');

    if (logoutRes.status === 200 && logoutRes.data.success) {
      console.log('✅ Logout successful!');
    } else {
      console.error('❌ Logout failed:', logoutRes.data);
      process.exit(1);
    }

    // Verify access is blocked after logging out
    console.log('[TEST 7] Verifying access to /me is blocked after logging out...');
    const blockedRes = await client.get('/auth/me');

    if (blockedRes.status === 401) {
      console.log('✅ Access correctly blocked (401 Unauthorized).\n');
    } else {
      console.error('❌ Failed: User could access profile after logging out. Status:', blockedRes.status);
      process.exit(1);
    }

    console.log('🚀 All integration tests passed successfully!');
  } catch (error) {
    console.error('❌ Test runner encountered a fatal error:', error.message);
    process.exit(1);
  }
};

runTests();
