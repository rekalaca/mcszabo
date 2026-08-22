const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const os = require('os');

// Use /tmp directory on Vercel serverless to prevent read-only filesystem crash
const isVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
const dbPath = isVercel 
  ? path.join(os.tmpdir(), 'database.sqlite')
  : path.join(__dirname, '../data/database.sqlite');

const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;
let useSqlJs = false;
let SQL = null;
let sqlJsDb = null;

try {
  const sqlite3 = require('sqlite3').verbose();
  db = new sqlite3.Database(dbPath);
} catch (e) {
  console.warn('[DB NOTICE] Native sqlite3 binding unavailable, initializing sql.js WASM driver:', e.message);
  useSqlJs = true;
}

async function initSqlJs() {
  if (!SQL) {
    const initSqlJsLib = require('sql.js');
    SQL = await initSqlJsLib();
  }
  if (!sqlJsDb) {
    if (fs.existsSync(dbPath)) {
      const filebuffer = fs.readFileSync(dbPath);
      sqlJsDb = new SQL.Database(filebuffer);
    } else {
      sqlJsDb = new SQL.Database();
    }
  }
}

function saveSqlJsDb() {
  if (sqlJsDb && isVercel) {
    try {
      const data = sqlJsDb.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (e) {
      console.error('[DB ERROR] Failed to write sql.js file:', e);
    }
  }
}

async function runAsync(sql, params = []) {
  if (!useSqlJs && db) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  } else {
    await initSqlJs();
    sqlJsDb.run(sql, params);
    saveSqlJsDb();
    // Get last insert rowid if available
    let lastID = 1;
    try {
      const res = sqlJsDb.exec("SELECT last_insert_rowid() as id");
      if (res && res[0] && res[0].values && res[0].values[0]) {
        lastID = res[0].values[0][0];
      }
    } catch(e) {}
    return { lastID, changes: 1 };
  }
}

async function getAsync(sql, params = []) {
  if (!useSqlJs && db) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  } else {
    await initSqlJs();
    const stmt = sqlJsDb.prepare(sql);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
  }
}

async function allAsync(sql, params = []) {
  if (!useSqlJs && db) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  } else {
    await initSqlJs();
    const stmt = sqlJsDb.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }
}

async function initDatabase() {
  if (!useSqlJs && db) db.serialize();

  // Create Restaurants Table
  await runAsync(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      address TEXT,
      active INTEGER DEFAULT 1
    )
  `);

  // Create Job Positions Table
  await runAsync(`
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      active INTEGER DEFAULT 1
    )
  `);

  // Create Active Position Matrix Table (Restaurant x Position)
  await runAsync(`
    CREATE TABLE IF NOT EXISTS restaurant_positions (
      restaurant_id INTEGER NOT NULL,
      position_id INTEGER NOT NULL,
      is_open INTEGER DEFAULT 1,
      PRIMARY KEY (restaurant_id, position_id),
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
      FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE
    )
  `);

  // Create Applications Table
  await runAsync(`
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_type TEXT DEFAULT 'standard',
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      birth_year INTEGER NOT NULL,
      address TEXT NOT NULL,
      restaurant_id INTEGER NOT NULL,
      position_id INTEGER NOT NULL,
      education_level TEXT NOT NULL,
      is_student INTEGER DEFAULT 0,
      cv_filename TEXT NOT NULL,
      cv_original_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'uj',
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
      FOREIGN KEY (position_id) REFERENCES positions(id)
    )
  `);

  // Create Admin Users Table
  await runAsync(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    )
  `);

  // Seed default data if empty or sync
  const restCount = await getAsync(`SELECT COUNT(*) as count FROM restaurants`);
  const defaultRestaurants = [
    { name: "Nyíregyháza belvárosi McDonald's", code: 'nyiregyhaza_belvaros', address: '4400 Nyíregyháza, Dózsa György út 1.' },
    { name: 'Nyíregyháza McDrive', code: 'nyiregyhaza_mcdrive', address: '4400 Nyíregyháza, Pazonyi út 36.' },
    { name: "Kisvárda McDonald's", code: 'kisvarda', address: '4600 Kisvárda, Városmajor út 2.' },
    { name: "Mátészalka McDonald's", code: 'mateszalka', address: '4700 Mátészalka, Kórház u. 1.' },
    { name: "Sátoraljaújhely McDonald's", code: 'satoraljaujhely', address: '3980 Sátoraljaújhely, Rákóczi út 12.' }
  ];

  if (restCount.count === 0) {
    for (const r of defaultRestaurants) {
      await runAsync(`INSERT INTO restaurants (name, code, address) VALUES (?, ?, ?)`, [r.name, r.code, r.address]);
    }
  } else {
    // Sync existing restaurant records to new names
    for (let i = 0; i < defaultRestaurants.length; i++) {
      const r = defaultRestaurants[i];
      await runAsync(`UPDATE restaurants SET name = ?, code = ?, address = ? WHERE id = ?`, [r.name, r.code, r.address, i + 1]);
    }
  }

  const targetPositions = [
    { id: 1, title: 'Éttermi dolgozó', code: 'ettermi_dolgozo', description: 'Vevőkiszolgálás, pénztárkezelés és konyhai feladatok.' },
    { id: 2, title: 'Éjszakás dolgozó', code: 'ejszakas_dolgozo', description: 'Éjszakai műszakban éttermi és higiéniai feladatok.' },
    { id: 3, title: 'Vendégtéri koordinátor', code: 'vendegteri_koordinator', description: 'Gondoskodás a vendégek élményéről az étteremteremben.' },
    { id: 4, title: 'Tréner, oktató', code: 'trener_oktato', description: 'Új munkatársak betanítása és képzése.' },
    { id: 5, title: 'Koordinátor', code: 'koordinator', description: 'Éttermi folyamatok és műszakok koordinálása.' },
    { id: 6, title: 'Műszakvezető', code: 'muszakvezeto', description: 'Adott műszak operatív vezetéséért és a csapat irányításáért felelős pozíció.' },
    { id: 7, title: 'Karbantartó', code: 'karbantarto', description: 'Éttermi gépek, berendezések karbantartása és műszaki feladatai.' },
    { id: 8, title: 'Segéd karbantartó', code: 'seged_karbantarto', description: 'Karbantartási munkálatok segítése és műszaki előkészítés.' }
  ];

  // Reset positions table to exact 8 positions
  await runAsync(`DELETE FROM positions`);
  for (const p of targetPositions) {
    await runAsync(
      `INSERT INTO positions (id, title, code, description, active) VALUES (?, ?, ?, ?, 1)`,
      [p.id, p.title, p.code, p.description]
    );
  }

  // Populate or refresh restaurant_positions matrix for 5 restaurants x 8 positions
  await runAsync(`DELETE FROM restaurant_positions WHERE position_id NOT IN (1, 2, 3, 4, 5, 6, 7, 8)`);
  const restaurants = await allAsync(`SELECT id FROM restaurants`);
  for (const r of restaurants) {
    for (const p of targetPositions) {
      await runAsync(
        `INSERT INTO restaurant_positions (restaurant_id, position_id, is_open) 
         VALUES (?, ?, 1) 
         ON CONFLICT(restaurant_id, position_id) DO NOTHING`,
        [r.id, p.id]
      );
    }
  }

  // Seed default admin user (admin / adminpass) if none exists
  const adminCount = await getAsync(`SELECT COUNT(*) as count FROM admin_users`);
  if (adminCount.count === 0) {
    const passwordHash = await bcrypt.hash('adminpass', 10);
    await runAsync(`INSERT INTO admin_users (username, password_hash) VALUES (?, ?)`, ['admin', passwordHash]);
  }
}

module.exports = {
  db,
  runAsync,
  getAsync,
  allAsync,
  initDatabase
};
