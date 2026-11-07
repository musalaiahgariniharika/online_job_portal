require('dotenv').config();
const mysql = require('mysql2/promise');

async function initDatabase() {
  console.log('--- Initializing Apartment Visitor Management Database ---');

  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'niha123',
    multipleStatements: true
  };

  const dbName = process.env.DB_NAME || 'apartment_visitor_management';

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log(`Connected to MySQL Server successfully at ${dbConfig.host}`);

    // 1. Create database if not exists
    console.log(`Creating database '${dbName}' if it does not exist...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    console.log(`Database '${dbName}' verified.`);

    await connection.query(`USE \`${dbName}\`;`);

    // 2. Create tables
    console.log('Creating tables: residents, visitors, visits...');

    const createResidentsTable = `
      CREATE TABLE IF NOT EXISTS residents (
        resident_id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        flat_no VARCHAR(20) NOT NULL,
        phone VARCHAR(15),
        email VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_residents_flat (flat_no),
        INDEX idx_residents_name (name)
      ) ENGINE=InnoDB;
    `;

    const createVisitorsTable = `
      CREATE TABLE IF NOT EXISTS visitors (
        visitor_id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(15),
        vehicle_no VARCHAR(30),
        purpose VARCHAR(150),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_visitors_phone (phone),
        INDEX idx_visitors_name (name)
      ) ENGINE=InnoDB;
    `;

    const createVisitsTable = `
      CREATE TABLE IF NOT EXISTS visits (
        visit_id INT PRIMARY KEY AUTO_INCREMENT,
        resident_id INT NOT NULL,
        visitor_id INT NOT NULL,
        entry_time DATETIME NOT NULL,
        exit_time DATETIME NULL,
        status VARCHAR(20) DEFAULT 'Inside',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_visits_status (status),
        INDEX idx_visits_entry (entry_time),
        CONSTRAINT fk_visits_resident FOREIGN KEY (resident_id)
          REFERENCES residents (resident_id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_visits_visitor FOREIGN KEY (visitor_id)
          REFERENCES visitors (visitor_id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB;
    `;

    await connection.query(createResidentsTable);
    console.log("Table 'residents' created or verified.");

    await connection.query(createVisitorsTable);
    console.log("Table 'visitors' created or verified.");

    await connection.query(createVisitsTable);
    console.log("Table 'visits' created or verified.");

    // 3. Verify tables and foreign keys
    const [tables] = await connection.query("SHOW TABLES;");
    const tableNames = tables.map(t => Object.values(t)[0]);
    console.log('Existing tables in database:', tableNames);

    // 4. Check if sample data is needed
    const [residentCount] = await connection.query("SELECT COUNT(*) AS count FROM residents;");
    if (residentCount[0].count === 0) {
      console.log('Seeding initial sample data for testing...');

      const sampleResidents = [
        ['Rajesh Sharma', 'A-101', '9876543210', 'rajesh.sharma@example.com'],
        ['Priya Patel', 'B-204', '9876543211', 'priya.patel@example.com'],
        ['Amit Verma', 'C-305', '9876543212', 'amit.verma@example.com'],
        ['Sneha Reddy', 'A-402', '9876543213', 'sneha.reddy@example.com'],
        ['Vikram Malhotra', 'B-103', '9876543214', 'vikram.m@example.com']
      ];

      await connection.query(
        "INSERT INTO residents (name, flat_no, phone, email) VALUES ?",
        [sampleResidents]
      );
      console.log(`Inserted ${sampleResidents.length} sample residents.`);

      const sampleVisitors = [
        ['Karan Mehta', '9123456780', 'MH-02-AB-1234', 'Personal Guest'],
        ['Suresh Kumar', '9123456781', 'MH-04-CD-5678', 'Amazon Courier Delivery'],
        ['Ananya Singh', '9123456782', 'DL-01-EF-9012', 'Family Visit'],
        ['Ramesh Electrician', '9123456783', 'KA-05-GH-3456', 'AC Repair Service'],
        ['Deepak Swiggy', '9123456784', 'TS-07-IJ-7890', 'Food Delivery']
      ];

      await connection.query(
        "INSERT INTO visitors (name, phone, vehicle_no, purpose) VALUES ?",
        [sampleVisitors]
      );
      console.log(`Inserted ${sampleVisitors.length} sample visitors.`);

      // Insert sample visits (3 inside, 2 completed)
      await connection.query(`
        INSERT INTO visits (resident_id, visitor_id, entry_time, exit_time, status) VALUES
        (1, 1, DATE_SUB(NOW(), INTERVAL 45 MINUTE), NULL, 'Inside'),
        (2, 2, DATE_SUB(NOW(), INTERVAL 30 MINUTE), NULL, 'Inside'),
        (3, 4, DATE_SUB(NOW(), INTERVAL 15 MINUTE), NULL, 'Inside'),
        (4, 3, DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), 'Completed'),
        (5, 5, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 105 MINUTE), 'Completed');
      `);
      console.log('Inserted sample visits with active and completed statuses.');
    } else {
      console.log(`Database already contains ${residentCount[0].count} residents. Preserving existing records.`);
    }

    // 5. Verification queries
    const [res] = await connection.query("SELECT COUNT(*) AS total_residents FROM residents;");
    const [vis] = await connection.query("SELECT COUNT(*) AS total_visitors FROM visitors;");
    const [vsts] = await connection.query("SELECT COUNT(*) AS total_visits FROM visits;");
    const [inside] = await connection.query("SELECT COUNT(*) AS inside FROM visits WHERE status = 'Inside';");
    const [completed] = await connection.query("SELECT COUNT(*) AS completed FROM visits WHERE status = 'Completed';");

    console.log('\n--- Verification Summary ---');
    console.log('Database Name:             ', dbName);
    console.log('Total Residents:           ', res[0].total_residents);
    console.log('Total Visitors:            ', vis[0].total_visitors);
    console.log('Total Visits:              ', vsts[0].total_visits);
    console.log('Active Visits (Inside):    ', inside[0].inside);
    console.log('Completed Visits:          ', completed[0].completed);
    console.log('Database setup and verification completed successfully!\n');

  } catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

initDatabase();
