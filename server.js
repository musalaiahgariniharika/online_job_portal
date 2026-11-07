require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.originalUrl.startsWith('/api')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Helper for error responses
function handleError(res, error, customMessage = 'Internal Server Error') {
  console.error(customMessage, error);
  res.status(500).json({ success: false, message: customMessage, error: error.message });
}

// ==========================================
// 1. HEALTH & METRICS API
// ==========================================
app.get('/api/health', async (req, res) => {
  const dbHealth = await db.testConnection();
  res.json({
    status: dbHealth.success ? 'healthy' : 'degraded',
    database: dbHealth.message,
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// 2. DASHBOARD STATISTICS API
// ==========================================
app.get('/api/stats', async (req, res) => {
  try {
    const [resCount] = await db.query('SELECT COUNT(*) AS total FROM residents');
    const [visCount] = await db.query('SELECT COUNT(*) AS total FROM visitors');
    const [visitCount] = await db.query('SELECT COUNT(*) AS total FROM visits');
    const [insideCount] = await db.query("SELECT COUNT(*) AS total FROM visits WHERE status = 'Inside'");
    const [completedCount] = await db.query("SELECT COUNT(*) AS total FROM visits WHERE status = 'Completed'");

    // Recent 10 visits with JOIN
    const [recentVisits] = await db.query(`
      SELECT 
        v.visit_id,
        v.resident_id,
        v.visitor_id,
        v.entry_time,
        v.exit_time,
        v.status,
        r.name AS resident_name,
        r.flat_no,
        vt.name AS visitor_name,
        vt.phone AS visitor_phone,
        vt.vehicle_no,
        vt.purpose
      FROM visits v
      JOIN residents r ON v.resident_id = r.resident_id
      JOIN visitors vt ON v.visitor_id = vt.visitor_id
      ORDER BY v.entry_time DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        totalResidents: resCount[0].total,
        totalVisitors: visCount[0].total,
        totalVisits: visitCount[0].total,
        visitorsInside: insideCount[0].total,
        completedVisits: completedCount[0].total,
        recentVisits
      }
    });
  } catch (error) {
    handleError(res, error, 'Failed to retrieve dashboard statistics');
  }
});

// ==========================================
// 3. RESIDENTS MANAGEMENT API
// ==========================================

// GET all residents (with optional search)
app.get('/api/residents', async (req, res) => {
  try {
    const { q } = req.query;
    let query = `
      SELECT 
        r.resident_id,
        r.name,
        r.flat_no,
        r.phone,
        r.email,
        r.created_at,
        COUNT(v.visit_id) AS total_visits
      FROM residents r
      LEFT JOIN visits v ON r.resident_id = v.resident_id
    `;
    const params = [];

    if (q && q.trim()) {
      query += ` WHERE r.name LIKE ? OR r.flat_no LIKE ? OR r.phone LIKE ? OR r.email LIKE ?`;
      const searchParam = `%${q.trim()}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }

    query += ` GROUP BY r.resident_id ORDER BY r.flat_no ASC, r.name ASC`;

    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    handleError(res, error, 'Failed to fetch residents');
  }
});

// GET single resident details + visit history
app.get('/api/residents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [residents] = await db.query('SELECT * FROM residents WHERE resident_id = ?', [id]);
    if (residents.length === 0) {
      return res.status(404).json({ success: false, message: 'Resident not found' });
    }

    const [visits] = await db.query(`
      SELECT 
        v.visit_id,
        v.entry_time,
        v.exit_time,
        v.status,
        vt.visitor_id,
        vt.name AS visitor_name,
        vt.phone AS visitor_phone,
        vt.vehicle_no,
        vt.purpose
      FROM visits v
      JOIN visitors vt ON v.visitor_id = vt.visitor_id
      WHERE v.resident_id = ?
      ORDER BY v.entry_time DESC
    `, [id]);

    res.json({
      success: true,
      data: {
        ...residents[0],
        visits
      }
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch resident details');
  }
});

// POST create resident
app.post('/api/residents', async (req, res) => {
  try {
    const { name, flat_no, phone, email } = req.body;
    if (!name || !name.trim() || !flat_no || !flat_no.trim()) {
      return res.status(400).json({ success: false, message: 'Name and Flat Number are required.' });
    }

    const [result] = await db.query(
      'INSERT INTO residents (name, flat_no, phone, email) VALUES (?, ?, ?, ?)',
      [name.trim(), flat_no.trim(), phone ? phone.trim() : null, email ? email.trim() : null]
    );

    const [newResident] = await db.query('SELECT * FROM residents WHERE resident_id = ?', [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Resident added successfully',
      data: newResident[0]
    });
  } catch (error) {
    handleError(res, error, 'Failed to create resident');
  }
});

// PUT update resident
app.put('/api/residents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, flat_no, phone, email } = req.body;

    if (!name || !name.trim() || !flat_no || !flat_no.trim()) {
      return res.status(400).json({ success: false, message: 'Name and Flat Number are required.' });
    }

    const [exists] = await db.query('SELECT resident_id FROM residents WHERE resident_id = ?', [id]);
    if (exists.length === 0) {
      return res.status(404).json({ success: false, message: 'Resident not found' });
    }

    await db.query(
      'UPDATE residents SET name = ?, flat_no = ?, phone = ?, email = ? WHERE resident_id = ?',
      [name.trim(), flat_no.trim(), phone ? phone.trim() : null, email ? email.trim() : null, id]
    );

    const [updated] = await db.query('SELECT * FROM residents WHERE resident_id = ?', [id]);

    res.json({
      success: true,
      message: 'Resident updated successfully',
      data: updated[0]
    });
  } catch (error) {
    handleError(res, error, 'Failed to update resident');
  }
});

// DELETE resident
app.delete('/api/residents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [exists] = await db.query('SELECT resident_id FROM residents WHERE resident_id = ?', [id]);
    if (exists.length === 0) {
      return res.status(404).json({ success: false, message: 'Resident not found' });
    }

    await db.query('DELETE FROM residents WHERE resident_id = ?', [id]);

    res.json({
      success: true,
      message: 'Resident deleted successfully'
    });
  } catch (error) {
    handleError(res, error, 'Failed to delete resident');
  }
});

// ==========================================
// 4. VISITORS MANAGEMENT API
// ==========================================

// GET all visitors (with optional search)
app.get('/api/visitors', async (req, res) => {
  try {
    const { q } = req.query;
    let query = `
      SELECT 
        vt.visitor_id,
        vt.name,
        vt.phone,
        vt.vehicle_no,
        vt.purpose,
        vt.created_at,
        COUNT(v.visit_id) AS total_visits,
        SUM(CASE WHEN v.status = 'Inside' THEN 1 ELSE 0 END) AS currently_inside
      FROM visitors vt
      LEFT JOIN visits v ON vt.visitor_id = v.visitor_id
    `;
    const params = [];

    if (q && q.trim()) {
      query += ` WHERE vt.name LIKE ? OR vt.phone LIKE ? OR vt.vehicle_no LIKE ? OR vt.purpose LIKE ?`;
      const searchParam = `%${q.trim()}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }

    query += ` GROUP BY vt.visitor_id ORDER BY vt.name ASC`;

    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    handleError(res, error, 'Failed to fetch visitors');
  }
});

// GET single visitor details + visit history
app.get('/api/visitors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [visitors] = await db.query('SELECT * FROM visitors WHERE visitor_id = ?', [id]);
    if (visitors.length === 0) {
      return res.status(404).json({ success: false, message: 'Visitor not found' });
    }

    const [visits] = await db.query(`
      SELECT 
        v.visit_id,
        v.entry_time,
        v.exit_time,
        v.status,
        r.resident_id,
        r.name AS resident_name,
        r.flat_no,
        r.phone AS resident_phone
      FROM visits v
      JOIN residents r ON v.resident_id = r.resident_id
      WHERE v.visitor_id = ?
      ORDER BY v.entry_time DESC
    `, [id]);

    res.json({
      success: true,
      data: {
        ...visitors[0],
        visits
      }
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch visitor details');
  }
});

// POST create visitor
app.post('/api/visitors', async (req, res) => {
  try {
    const { name, phone, vehicle_no, purpose } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Visitor name is required.' });
    }

    const [result] = await db.query(
      'INSERT INTO visitors (name, phone, vehicle_no, purpose) VALUES (?, ?, ?, ?)',
      [name.trim(), phone ? phone.trim() : null, vehicle_no ? vehicle_no.trim() : null, purpose ? purpose.trim() : null]
    );

    const [newVisitor] = await db.query('SELECT * FROM visitors WHERE visitor_id = ?', [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Visitor registered successfully',
      data: newVisitor[0]
    });
  } catch (error) {
    handleError(res, error, 'Failed to register visitor');
  }
});

// PUT update visitor
app.put('/api/visitors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, vehicle_no, purpose } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Visitor name is required.' });
    }

    const [exists] = await db.query('SELECT visitor_id FROM visitors WHERE visitor_id = ?', [id]);
    if (exists.length === 0) {
      return res.status(404).json({ success: false, message: 'Visitor not found' });
    }

    await db.query(
      'UPDATE visitors SET name = ?, phone = ?, vehicle_no = ?, purpose = ? WHERE visitor_id = ?',
      [name.trim(), phone ? phone.trim() : null, vehicle_no ? vehicle_no.trim() : null, purpose ? purpose.trim() : null, id]
    );

    const [updated] = await db.query('SELECT * FROM visitors WHERE visitor_id = ?', [id]);

    res.json({
      success: true,
      message: 'Visitor updated successfully',
      data: updated[0]
    });
  } catch (error) {
    handleError(res, error, 'Failed to update visitor');
  }
});

// DELETE visitor
app.delete('/api/visitors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [exists] = await db.query('SELECT visitor_id FROM visitors WHERE visitor_id = ?', [id]);
    if (exists.length === 0) {
      return res.status(404).json({ success: false, message: 'Visitor not found' });
    }

    await db.query('DELETE FROM visitors WHERE visitor_id = ?', [id]);

    res.json({
      success: true,
      message: 'Visitor deleted successfully'
    });
  } catch (error) {
    handleError(res, error, 'Failed to delete visitor');
  }
});

// ==========================================
// 5. VISITS MANAGEMENT API
// ==========================================

// GET all visits (with SQL JOINs on residents and visitors, optional status & search filter)
app.get('/api/visits', async (req, res) => {
  try {
    const { status, q } = req.query;
    let query = `
      SELECT 
        v.visit_id,
        v.resident_id,
        v.visitor_id,
        v.entry_time,
        v.exit_time,
        v.status,
        v.created_at,
        r.name AS resident_name,
        r.flat_no,
        r.phone AS resident_phone,
        r.email AS resident_email,
        vt.name AS visitor_name,
        vt.phone AS visitor_phone,
        vt.vehicle_no,
        vt.purpose
      FROM visits v
      JOIN residents r ON v.resident_id = r.resident_id
      JOIN visitors vt ON v.visitor_id = vt.visitor_id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'All') {
      query += ` AND v.status = ?`;
      params.push(status);
    }

    if (q && q.trim()) {
      query += ` AND (
        r.name LIKE ? OR 
        r.flat_no LIKE ? OR 
        vt.name LIKE ? OR 
        vt.phone LIKE ? OR 
        vt.vehicle_no LIKE ? OR 
        vt.purpose LIKE ?
      )`;
      const searchParam = `%${q.trim()}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    query += ` ORDER BY v.entry_time DESC`;

    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    handleError(res, error, 'Failed to fetch visits');
  }
});

// GET single visit
app.get('/api/visits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(`
      SELECT 
        v.visit_id,
        v.resident_id,
        v.visitor_id,
        v.entry_time,
        v.exit_time,
        v.status,
        r.name AS resident_name,
        r.flat_no,
        vt.name AS visitor_name,
        vt.phone AS visitor_phone,
        vt.vehicle_no,
        vt.purpose
      FROM visits v
      JOIN residents r ON v.resident_id = r.resident_id
      JOIN visitors vt ON v.visitor_id = vt.visitor_id
      WHERE v.visit_id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Visit record not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    handleError(res, error, 'Failed to fetch visit record');
  }
});

// POST create visit / check-in
app.post('/api/visits', async (req, res) => {
  try {
    let { resident_id, visitor_id, entry_time, vehicle_no, purpose } = req.body;

    if (!resident_id) {
      return res.status(400).json({ success: false, message: 'Resident must be selected.' });
    }

    // Support quick visitor registration inline if visitor_id not provided
    if (!visitor_id && req.body.visitor_name) {
      const { visitor_name, visitor_phone } = req.body;
      const [newVisitor] = await db.query(
        'INSERT INTO visitors (name, phone, vehicle_no, purpose) VALUES (?, ?, ?, ?)',
        [visitor_name.trim(), visitor_phone || null, vehicle_no || null, purpose || null]
      );
      visitor_id = newVisitor.insertId;
    }

    if (!visitor_id) {
      return res.status(400).json({ success: false, message: 'Visitor must be selected or provided.' });
    }

    // Verify resident exists
    const [residentExists] = await db.query('SELECT resident_id FROM residents WHERE resident_id = ?', [resident_id]);
    if (residentExists.length === 0) {
      return res.status(404).json({ success: false, message: 'Selected resident does not exist.' });
    }

    // Verify visitor exists
    const [visitorExists] = await db.query('SELECT visitor_id FROM visitors WHERE visitor_id = ?', [visitor_id]);
    if (visitorExists.length === 0) {
      return res.status(404).json({ success: false, message: 'Selected visitor does not exist.' });
    }

    // If vehicle_no or purpose updated in check-in form, update visitor profile
    if (vehicle_no !== undefined || purpose !== undefined) {
      await db.query(
        'UPDATE visitors SET vehicle_no = COALESCE(?, vehicle_no), purpose = COALESCE(?, purpose) WHERE visitor_id = ?',
        [vehicle_no ? vehicle_no.trim() : null, purpose ? purpose.trim() : null, visitor_id]
      );
    }

    // Insert visit
    let entrySqlTime;
    if (entry_time) {
      entrySqlTime = entry_time;
    } else {
      entrySqlTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    const [result] = await db.query(
      "INSERT INTO visits (resident_id, visitor_id, entry_time, status) VALUES (?, ?, ?, 'Inside')",
      [resident_id, visitor_id, entrySqlTime]
    );

    const [newVisit] = await db.query(`
      SELECT 
        v.visit_id,
        v.resident_id,
        v.visitor_id,
        v.entry_time,
        v.exit_time,
        v.status,
        r.name AS resident_name,
        r.flat_no,
        vt.name AS visitor_name,
        vt.phone AS visitor_phone,
        vt.vehicle_no,
        vt.purpose
      FROM visits v
      JOIN residents r ON v.resident_id = r.resident_id
      JOIN visitors vt ON v.visitor_id = vt.visitor_id
      WHERE v.visit_id = ?
    `, [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Visitor checked in successfully',
      data: newVisit[0]
    });
  } catch (error) {
    handleError(res, error, 'Failed to create visit record');
  }
});

// PUT update visit record
app.put('/api/visits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { resident_id, visitor_id, entry_time, exit_time, status } = req.body;

    const [exists] = await db.query('SELECT * FROM visits WHERE visit_id = ?', [id]);
    if (exists.length === 0) {
      return res.status(404).json({ success: false, message: 'Visit record not found' });
    }

    await db.query(`
      UPDATE visits 
      SET 
        resident_id = COALESCE(?, resident_id),
        visitor_id = COALESCE(?, visitor_id),
        entry_time = COALESCE(?, entry_time),
        exit_time = ?,
        status = COALESCE(?, status)
      WHERE visit_id = ?
    `, [
      resident_id || null, 
      visitor_id || null, 
      entry_time || null, 
      exit_time !== undefined ? exit_time : exists[0].exit_time, 
      status || null, 
      id
    ]);

    const [updated] = await db.query(`
      SELECT 
        v.visit_id,
        v.resident_id,
        v.visitor_id,
        v.entry_time,
        v.exit_time,
        v.status,
        r.name AS resident_name,
        r.flat_no,
        vt.name AS visitor_name,
        vt.phone AS visitor_phone,
        vt.vehicle_no,
        vt.purpose
      FROM visits v
      JOIN residents r ON v.resident_id = r.resident_id
      JOIN visitors vt ON v.visitor_id = vt.visitor_id
      WHERE v.visit_id = ?
    `, [id]);

    res.json({
      success: true,
      message: 'Visit record updated successfully',
      data: updated[0]
    });
  } catch (error) {
    handleError(res, error, 'Failed to update visit record');
  }
});

// PUT record visitor exit (Check-out)
app.put('/api/visits/:id/exit', async (req, res) => {
  try {
    const { id } = req.params;
    const [visit] = await db.query('SELECT * FROM visits WHERE visit_id = ?', [id]);

    if (visit.length === 0) {
      return res.status(404).json({ success: false, message: 'Visit record not found' });
    }

    if (visit[0].status === 'Completed') {
      return res.status(400).json({ success: false, message: 'Visitor has already exited.' });
    }

    const exitTime = req.body.exit_time || new Date().toISOString().slice(0, 19).replace('T', ' ');

    await db.query(`
      UPDATE visits 
      SET exit_time = ?, status = 'Completed' 
      WHERE visit_id = ?
    `, [exitTime, id]);

    const [updated] = await db.query(`
      SELECT 
        v.visit_id,
        v.resident_id,
        v.visitor_id,
        v.entry_time,
        v.exit_time,
        v.status,
        r.name AS resident_name,
        r.flat_no,
        vt.name AS visitor_name,
        vt.phone AS visitor_phone,
        vt.vehicle_no,
        vt.purpose
      FROM visits v
      JOIN residents r ON v.resident_id = r.resident_id
      JOIN visitors vt ON v.visitor_id = vt.visitor_id
      WHERE v.visit_id = ?
    `, [id]);

    res.json({
      success: true,
      message: 'Visitor exit recorded successfully',
      data: updated[0]
    });
  } catch (error) {
    handleError(res, error, 'Failed to record visitor exit');
  }
});

// DELETE visit record
app.delete('/api/visits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [exists] = await db.query('SELECT visit_id FROM visits WHERE visit_id = ?', [id]);
    if (exists.length === 0) {
      return res.status(404).json({ success: false, message: 'Visit record not found' });
    }

    await db.query('DELETE FROM visits WHERE visit_id = ?', [id]);

    res.json({
      success: true,
      message: 'Visit record deleted successfully'
    });
  } catch (error) {
    handleError(res, error, 'Failed to delete visit record');
  }
});

// Fallback to index.html for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express server
const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Apartment Visitor Management System Server Running    `);
  console.log(` URL: http://localhost:${PORT}                         `);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'} `);
  console.log(` Database: ${process.env.DB_NAME || 'apartment_visitor_management'}`);
  console.log(`=======================================================`);
});

module.exports = { app, server };
