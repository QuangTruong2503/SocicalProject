/**
 * User API Tests
 * File này chứa các test cases cho các endpoint của User module
 * Có thể sử dụng với Postman hoặc các tool test API khác
 */

const API_BASE_URL = 'http://localhost:5000/api';

// ===== TEST DATA =====
const testData = {
  register: {
    username: `testuser_${Date.now()}`,
    email: `test_${Date.now()}@example.com`,
    password: 'TestPassword123!@#',
    full_name: 'Test User Full Name'
  }
};

// ===== HELPER FUNCTIONS =====

/**
 * Pretty print API response
 */
function logResponse(title, response) {
  console.log('\n' + '='.repeat(60));
  console.log(`📋 ${title}`);
  console.log('='.repeat(60));
  console.log(JSON.stringify(response, null, 2));
}

/**
 * Make API request
 */
async function apiRequest(method, endpoint, body = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json();

    return {
      status: response.status,
      ok: response.ok,
      data
    };
  } catch (error) {
    console.error(`❌ Request Error: ${error.message}`);
    throw error;
  }
}

// ===== TEST CASES =====

/**
 * Test 1: Register New User
 */
async function testRegister() {
  console.log('\n\n🧪 TEST 1: REGISTER NEW USER');
  console.log('━'.repeat(60));

  try {
    const response = await apiRequest('POST', '/register', testData.register);
    
    logResponse('Register Response', response);

    if (response.ok && response.data.success) {
      console.log('✅ Register test PASSED');
      return response.data.userId;
    } else {
      console.log('❌ Register test FAILED');
      return null;
    }
  } catch (error) {
    console.error('❌ Register test ERROR:', error);
    return null;
  }
}

/**
 * Test 2: Get User Profile
 */
async function testGetProfile(userId) {
  console.log('\n\n🧪 TEST 2: GET USER PROFILE');
  console.log('━'.repeat(60));

  if (!userId) {
    console.log('⏭️  Skipping - No userId provided');
    return false;
  }

  try {
    const response = await apiRequest('GET', `/users/${userId}`);
    
    logResponse('Get Profile Response', response);

    if (response.ok && response.data.success) {
      console.log('✅ Get Profile test PASSED');
      console.log(`   Username: ${response.data.data.username}`);
      console.log(`   Email: ${response.data.data.email}`);
      console.log(`   Status: ${response.data.data.status}`);
      console.log(`   Role: ${response.data.data.role}`);
      return true;
    } else {
      console.log('❌ Get Profile test FAILED');
      return false;
    }
  } catch (error) {
    console.error('❌ Get Profile test ERROR:', error);
    return false;
  }
}

/**
 * Test 3: Update User Status - Active to Inactive
 */
async function testUpdateStatusToInactive(userId) {
  console.log('\n\n🧪 TEST 3: UPDATE STATUS - ACTIVE TO INACTIVE');
  console.log('━'.repeat(60));

  if (!userId) {
    console.log('⏭️  Skipping - No userId provided');
    return false;
  }

  try {
    const response = await apiRequest('PUT', `/users/${userId}/status`, {
      status: 'inactive'
    });
    
    logResponse('Update Status Response', response);

    if (response.ok && response.data.success) {
      console.log('✅ Update Status test PASSED');
      console.log(`   New Status: ${response.data.status}`);
      return true;
    } else {
      console.log('❌ Update Status test FAILED');
      return false;
    }
  } catch (error) {
    console.error('❌ Update Status test ERROR:', error);
    return false;
  }
}

/**
 * Test 4: Update User Status - Inactive to Banned
 */
async function testUpdateStatusToBanned(userId) {
  console.log('\n\n🧪 TEST 4: UPDATE STATUS - INACTIVE TO BANNED');
  console.log('━'.repeat(60));

  if (!userId) {
    console.log('⏭️  Skipping - No userId provided');
    return false;
  }

  try {
    const response = await apiRequest('PUT', `/users/${userId}/status`, {
      status: 'banned'
    });
    
    logResponse('Update Status Response', response);

    if (response.ok && response.data.success) {
      console.log('✅ Update Status test PASSED');
      console.log(`   New Status: ${response.data.status}`);
      return true;
    } else {
      console.log('❌ Update Status test FAILED');
      return false;
    }
  } catch (error) {
    console.error('❌ Update Status test ERROR:', error);
    return false;
  }
}

/**
 * Test 5: Error Handling - Invalid UUID
 */
async function testInvalidUUID() {
  console.log('\n\n🧪 TEST 5: ERROR HANDLING - INVALID UUID');
  console.log('━'.repeat(60));

  try {
    const response = await apiRequest('GET', '/users/invalid-uuid');
    
    logResponse('Invalid UUID Response', response);

    if (!response.ok && response.status === 400) {
      console.log('✅ Invalid UUID test PASSED (Error handled correctly)');
      return true;
    } else {
      console.log('❌ Invalid UUID test FAILED');
      return false;
    }
  } catch (error) {
    console.error('❌ Invalid UUID test ERROR:', error);
    return false;
  }
}

/**
 * Test 6: Error Handling - Duplicate Email
 */
async function testDuplicateEmail() {
  console.log('\n\n🧪 TEST 6: ERROR HANDLING - DUPLICATE EMAIL');
  console.log('━'.repeat(60));

  try {
    // Register with same email twice
    const firstRegister = await apiRequest('POST', '/register', testData.register);
    
    if (!firstRegister.ok) {
      console.log('⏭️  Skipping - First registration failed');
      return false;
    }

    const secondRegister = await apiRequest('POST', '/register', {
      ...testData.register,
      username: `different_${Date.now()}`
    });
    
    logResponse('Duplicate Email Response', secondRegister);

    if (!secondRegister.ok && secondRegister.status === 409) {
      console.log('✅ Duplicate Email test PASSED (Error handled correctly)');
      return true;
    } else {
      console.log('⚠️  Duplicate Email test - Expected 409 status');
      return false;
    }
  } catch (error) {
    console.error('❌ Duplicate Email test ERROR:', error);
    return false;
  }
}

/**
 * Test 7: Error Handling - Invalid Status
 */
async function testInvalidStatus(userId) {
  console.log('\n\n🧪 TEST 7: ERROR HANDLING - INVALID STATUS');
  console.log('━'.repeat(60));

  if (!userId) {
    console.log('⏭️  Skipping - No userId provided');
    return false;
  }

  try {
    const response = await apiRequest('PUT', `/users/${userId}/status`, {
      status: 'invalid_status'
    });
    
    logResponse('Invalid Status Response', response);

    if (!response.ok && response.status === 400) {
      console.log('✅ Invalid Status test PASSED (Error handled correctly)');
      return true;
    } else {
      console.log('❌ Invalid Status test FAILED');
      return false;
    }
  } catch (error) {
    console.error('❌ Invalid Status test ERROR:', error);
    return false;
  }
}

/**
 * Test 8: Verify Profile After Status Update
 */
async function testVerifyProfileAfterUpdate(userId) {
  console.log('\n\n🧪 TEST 8: VERIFY PROFILE AFTER STATUS UPDATE');
  console.log('━'.repeat(60));

  if (!userId) {
    console.log('⏭️  Skipping - No userId provided');
    return false;
  }

  try {
    const response = await apiRequest('GET', `/users/${userId}`);
    
    logResponse('Profile After Update', response);

    if (response.ok && response.data.success) {
      const status = response.data.data.status;
      console.log('✅ Verify Profile test PASSED');
      console.log(`   Current Status: ${status}`);
      return true;
    } else {
      console.log('❌ Verify Profile test FAILED');
      return false;
    }
  } catch (error) {
    console.error('❌ Verify Profile test ERROR:', error);
    return false;
  }
}

// ===== MAIN TEST RUNNER =====

async function runAllTests() {
  console.log('\n\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(15) + '🚀 USER API TEST SUITE 🚀' + ' '.repeat(17) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log(`Timestamp: ${new Date().toLocaleString()}`);

  const results = [];

  try {
    // Test 1: Register
    const userId = await testRegister();
    results.push({ test: 'Register', passed: userId !== null });

    // Test 2: Get Profile
    const profilePassed = await testGetProfile(userId);
    results.push({ test: 'Get Profile', passed: profilePassed });

    // Test 3: Update Status to Inactive
    const updateInactivePassed = await testUpdateStatusToInactive(userId);
    results.push({ test: 'Update Status (Inactive)', passed: updateInactivePassed });

    // Test 4: Update Status to Banned
    const updateBannedPassed = await testUpdateStatusToBanned(userId);
    results.push({ test: 'Update Status (Banned)', passed: updateBannedPassed });

    // Test 5: Invalid UUID
    const invalidUUIDPassed = await testInvalidUUID();
    results.push({ test: 'Error: Invalid UUID', passed: invalidUUIDPassed });

    // Test 6: Duplicate Email
    const duplicateEmailPassed = await testDuplicateEmail();
    results.push({ test: 'Error: Duplicate Email', passed: duplicateEmailPassed });

    // Test 7: Invalid Status
    const invalidStatusPassed = await testInvalidStatus(userId);
    results.push({ test: 'Error: Invalid Status', passed: invalidStatusPassed });

    // Test 8: Verify Profile
    const verifyProfilePassed = await testVerifyProfileAfterUpdate(userId);
    results.push({ test: 'Verify Profile Updated', passed: verifyProfilePassed });

  } catch (error) {
    console.error('\n❌ Test suite error:', error);
  }

  // Summary Report
  console.log('\n\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(20) + '📊 TEST SUMMARY 📊' + ' '.repeat(20) + '║');
  console.log('╠' + '═'.repeat(58) + '╣');

  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    const status = result.passed ? 'PASSED' : 'FAILED';
    console.log(`║ ${icon} ${result.test.padEnd(40)} ${status.padStart(10)} ║`);
  });

  console.log('╠' + '═'.repeat(58) + '╣');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const percentage = ((passed / total) * 100).toFixed(1);
  console.log(`║ Total: ${passed}/${total} tests passed (${percentage}%) ${' '.repeat(33 - percentage.toString().length)} ║`);
  console.log('╚' + '═'.repeat(58) + '╝\n');
}

// Run tests if executed directly
if (typeof module !== 'undefined' && module === require.main) {
  runAllTests().catch(console.error);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    testRegister,
    testGetProfile,
    testUpdateStatusToInactive,
    testUpdateStatusToBanned,
    testInvalidUUID,
    testDuplicateEmail,
    testInvalidStatus,
    testVerifyProfileAfterUpdate,
    runAllTests
  };
}
