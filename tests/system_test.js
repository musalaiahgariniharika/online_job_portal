require('dotenv').config();
const http = require('http');
const db = require('../db');
const { app, server } = require('../server');

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runTests() {
  console.log('\n=======================================================');
  console.log(' APARTMENT VISITOR MANAGEMENT SYSTEM - SYSTEM TEST SUITE');
  console.log('=======================================================\n');

  let testResidentId = null;
  let testVisitorId = null;
  let testVisitId = null;

  try {
    // ----------------------------------------------------
    // TEST 1: Database Connectivity and Schema Verification
    // ----------------------------------------------------
    console.log('TEST 1: Verifying Database Connection and Tables...');
    const health = await request('GET', '/api/health');
    assert(health.status === 200, 'Health endpoint responds with 200');
    assert(health.data.status === 'healthy', 'Database status is healthy');

    const [tables] = await db.query('SHOW TABLES;');
    const tableNames = tables.map(t => Object.values(t)[0]);
    assert(tableNames.includes('residents'), "Table 'residents' exists in database");
    assert(tableNames.includes('visitors'), "Table 'visitors' exists in database");
    assert(tableNames.includes('visits'), "Table 'visits' exists in database");

    // Verify foreign key constraints on visits table
    const [fks] = await db.query(`
      SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME 
      FROM information_schema.KEY_COLUMN_USAGE 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'visits' AND REFERENCED_TABLE_NAME IS NOT NULL;
    `);
    const refTables = fks.map(f => f.REFERENCED_TABLE_NAME);
    assert(refTables.includes('residents'), "Foreign key constraint links 'visits' to 'residents'");
    assert(refTables.includes('visitors'), "Foreign key constraint links 'visits' to 'visitors'");

    // ----------------------------------------------------
    // TEST 2: Residents CRUD Operations
    // ----------------------------------------------------
    console.log('\nTEST 2: Testing Residents CRUD Operations...');
    
    // Create Resident
    const resCreate = await request('POST', '/api/residents', {
      name: 'Automated Test Resident',
      flat_no: 'Z-999',
      phone: '9998887770',
      email: 'test.resident@domain.test'
    });
    assert(resCreate.status === 201, 'POST /api/residents returns 201 Created');
    assert(resCreate.data.data.resident_id > 0, 'New resident ID generated');
    testResidentId = resCreate.data.data.resident_id;

    // Read Residents List
    const resList = await request('GET', '/api/residents');
    assert(resList.status === 200, 'GET /api/residents returns 200');
    assert(Array.isArray(resList.data.data), 'Residents list is an array');
    const createdResidentInList = resList.data.data.find(r => r.resident_id === testResidentId);
    assert(createdResidentInList !== undefined, 'Created resident is in residents list');

    // Search Resident
    const resSearch = await request('GET', '/api/residents?q=Z-999');
    assert(resSearch.data.data.length >= 1, 'Search by flat number Z-999 returns matching resident');

    // Read Single Resident
    const resSingle = await request('GET', `/api/residents/${testResidentId}`);
    assert(resSingle.status === 200, 'GET /api/residents/:id returns 200');
    assert(resSingle.data.data.name === 'Automated Test Resident', 'Resident name matches');

    // Update Resident
    const resUpdate = await request('PUT', `/api/residents/${testResidentId}`, {
      name: 'Updated Test Resident',
      flat_no: 'Z-999-B',
      phone: '9998887771',
      email: 'updated.resident@domain.test'
    });
    assert(resUpdate.status === 200, 'PUT /api/residents/:id returns 200 OK');
    assert(resUpdate.data.data.name === 'Updated Test Resident', 'Resident name updated in database');

    // ----------------------------------------------------
    // TEST 3: Visitors CRUD Operations
    // ----------------------------------------------------
    console.log('\nTEST 3: Testing Visitors CRUD Operations...');

    // Create Visitor
    const visCreate = await request('POST', '/api/visitors', {
      name: 'Automated Test Visitor',
      phone: '9888777660',
      vehicle_no: 'TS-09-TEST-99',
      purpose: 'System Audit'
    });
    assert(visCreate.status === 201, 'POST /api/visitors returns 201 Created');
    assert(visCreate.data.data.visitor_id > 0, 'New visitor ID generated');
    testVisitorId = visCreate.data.data.visitor_id;

    // Read Visitors List
    const visList = await request('GET', '/api/visitors');
    assert(visList.status === 200, 'GET /api/visitors returns 200');
    const createdVisitorInList = visList.data.data.find(v => v.visitor_id === testVisitorId);
    assert(createdVisitorInList !== undefined, 'Created visitor is in visitors list');

    // Search Visitor
    const visSearch = await request('GET', '/api/visitors?q=TEST-99');
    assert(visSearch.data.data.length >= 1, 'Search by vehicle TEST-99 returns matching visitor');

    // Read Single Visitor
    const visSingle = await request('GET', `/api/visitors/${testVisitorId}`);
    assert(visSingle.status === 200, 'GET /api/visitors/:id returns 200');
    assert(visSingle.data.data.name === 'Automated Test Visitor', 'Visitor name matches');

    // Update Visitor
    const visUpdate = await request('PUT', `/api/visitors/${testVisitorId}`, {
      name: 'Updated Test Visitor',
      phone: '9888777661',
      vehicle_no: 'TS-09-TEST-88',
      purpose: 'Updated Audit Purpose'
    });
    assert(visUpdate.status === 200, 'PUT /api/visitors/:id returns 200');
    assert(visUpdate.data.data.vehicle_no === 'TS-09-TEST-88', 'Visitor vehicle updated');

    // ----------------------------------------------------
    // TEST 4: Visits CRUD, Entry, and Exit Operations
    // ----------------------------------------------------
    console.log('\nTEST 4: Testing Visits Check-In, SQL JOIN, and Check-Out Operations...');

    // Create Visit / Check-In
    const visitCreate = await request('POST', '/api/visits', {
      resident_id: testResidentId,
      visitor_id: testVisitorId,
      purpose: 'Verification Visit',
      vehicle_no: 'TS-09-TEST-88'
    });
    assert(visitCreate.status === 201, 'POST /api/visits returns 201 Created');
    assert(visitCreate.data.data.visit_id > 0, 'New visit record ID generated');
    assert(visitCreate.data.data.status === 'Inside', "Initial visit status is 'Inside'");
    assert(visitCreate.data.data.resident_name === 'Updated Test Resident', "SQL JOIN retrieved host resident name");
    assert(visitCreate.data.data.visitor_name === 'Updated Test Visitor', "SQL JOIN retrieved visitor name");
    assert(visitCreate.data.data.entry_time !== null, "Automated entry timestamp recorded");
    assert(visitCreate.data.data.exit_time === null, "Exit timestamp is initially null");
    testVisitId = visitCreate.data.data.visit_id;

    // Filter Visits (Inside)
    const visitsInside = await request('GET', '/api/visits?status=Inside');
    assert(visitsInside.status === 200, 'GET /api/visits?status=Inside returns 200');
    const insideItem = visitsInside.data.data.find(v => v.visit_id === testVisitId);
    assert(insideItem !== undefined, 'New visit is present in Inside list');

    // Record Visitor Exit
    const visitExit = await request('PUT', `/api/visits/${testVisitId}/exit`);
    assert(visitExit.status === 200, 'PUT /api/visits/:id/exit returns 200');
    assert(visitExit.data.data.status === 'Completed', "Visit status updated to 'Completed'");
    assert(visitExit.data.data.exit_time !== null, "Exit timestamp recorded automatically");

    // Verify Visit is no longer in Inside list
    const visitsInsideAfterExit = await request('GET', '/api/visits?status=Inside');
    const shouldNotBeInside = visitsInsideAfterExit.data.data.find(v => v.visit_id === testVisitId);
    assert(shouldNotBeInside === undefined, 'Completed visit is no longer marked Inside');

    // Read Single Visit
    const visitSingle = await request('GET', `/api/visits/${testVisitId}`);
    assert(visitSingle.status === 200, 'GET /api/visits/:id returns 200');
    assert(visitSingle.data.data.status === 'Completed', 'Single visit status is Completed');

    // ----------------------------------------------------
    // TEST 5: Dashboard Statistics Verification
    // ----------------------------------------------------
    console.log('\nTEST 5: Testing Live Dashboard Statistics...');
    const statsRes = await request('GET', '/api/stats');
    assert(statsRes.status === 200, 'GET /api/stats returns 200');
    const stats = statsRes.data.data;
    assert(typeof stats.totalResidents === 'number', 'totalResidents is numeric');
    assert(typeof stats.totalVisitors === 'number', 'totalVisitors is numeric');
    assert(typeof stats.totalVisits === 'number', 'totalVisits is numeric');
    assert(typeof stats.visitorsInside === 'number', 'visitorsInside is numeric');
    assert(typeof stats.completedVisits === 'number', 'completedVisits is numeric');
    assert(Array.isArray(stats.recentVisits), 'recentVisits is an array');

    // Direct Database Query comparison
    const [directResidents] = await db.query('SELECT COUNT(*) AS c FROM residents');
    const [directVisitors] = await db.query('SELECT COUNT(*) AS c FROM visitors');
    const [directVisits] = await db.query('SELECT COUNT(*) AS c FROM visits');
    assert(stats.totalResidents === directResidents[0].c, 'Dashboard totalResidents exactly matches database query');
    assert(stats.totalVisitors === directVisitors[0].c, 'Dashboard totalVisitors exactly matches database query');
    assert(stats.totalVisits === directVisits[0].c, 'Dashboard totalVisits exactly matches database query');

    // ----------------------------------------------------
    // TEST 6: Cleanup of Test Records (Verifying DELETE)
    // ----------------------------------------------------
    console.log('\nTEST 6: Testing DELETE Operations & Relational Cascades...');
    
    // Delete visit
    const delVisit = await request('DELETE', `/api/visits/${testVisitId}`);
    assert(delVisit.status === 200, 'DELETE /api/visits/:id returns 200');
    const checkVisit = await request('GET', `/api/visits/${testVisitId}`);
    assert(checkVisit.status === 404, 'Deleted visit returns 404 Not Found');

    // Delete visitor
    const delVisitor = await request('DELETE', `/api/visitors/${testVisitorId}`);
    assert(delVisitor.status === 200, 'DELETE /api/visitors/:id returns 200');
    const checkVisitor = await request('GET', `/api/visitors/${testVisitorId}`);
    assert(checkVisitor.status === 404, 'Deleted visitor returns 404 Not Found');

    // Delete resident
    const delResident = await request('DELETE', `/api/residents/${testResidentId}`);
    assert(delResident.status === 200, 'DELETE /api/residents/:id returns 200');
    const checkResident = await request('GET', `/api/residents/${testResidentId}`);
    assert(checkResident.status === 404, 'Deleted resident returns 404 Not Found');

    console.log('\n=======================================================');
    console.log(' 🎉 ALL SYSTEM TESTS PASSED SUCCESSFULLY! (100% OK)');
    console.log('=======================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test execution failed:', error.message);
    process.exit(1);
  } finally {
    if (server && server.close) server.close();
  }
}

// Give server time to bind and run
setTimeout(runTests, 500);
