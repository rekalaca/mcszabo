const path = require('path');
const fs = require('fs');
const os = require('os');
const bcrypt = require('bcryptjs');

// Load environment variables if available
try {
  require('dotenv').config();
} catch (e) {}

const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_REGION || process.env.AWS_REGION);
const databaseUrl = process.env.DATABASE_URL;

let pgPool = null;
let usePostgres = Boolean(databaseUrl);

if (usePostgres) {
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
    console.log('[DB INFO] Using PostgreSQL / Supabase connection');
  } catch (err) {
    console.error('[DB ERROR] Failed to initialize PostgreSQL pool:', err.message);
    usePostgres = false;
  }
}

// Fallback SQLite / Memory configuration
const dbPath = isVercel 
  ? path.join(os.tmpdir(), 'database.sqlite')
  : path.join(__dirname, '../data/database.sqlite');

let db = null;
let useSqlJs = false;
let useMemoryStore = isVercel && !usePostgres;
let SQL = null;
let sqlJsDb = null;

const memoryDb = {
  restaurants: [
    { id: 1, name: "Nyíregyháza belvárosi McDonald's", code: 'nyiregyhaza_belvaros', address: '4400 Nyíregyháza, Dózsa György út 1.', active: 1 },
    { id: 2, name: 'Nyíregyháza McDrive', code: 'nyiregyhaza_mcdrive', address: '4400 Nyíregyháza, Pazonyi út 36.', active: 1 },
    { id: 3, name: "Kisvárda McDonald's", code: 'kisvarda', address: '4600 Kisvárda, Városmajor út 2.', active: 1 },
    { id: 4, name: "Mátészalka McDonald's", code: 'mateszalka', address: '4700 Mátészalka, Kórház u. 1.', active: 1 },
    { id: 5, name: "Sátoraljaújhely McDonald's", code: 'satoraljaujhely', address: '3980 Sátoraljaújhely, Rákóczi út 12.', active: 1 }
  ],
  positions: [
    { id: 1, title: 'Éttermi dolgozó', code: 'ettermi_dolgozo', description: 'Vevőkiszolgálás, pénztárkezelés és konyhai feladatok.', active: 1 },
    { id: 2, title: 'Éjszakás dolgozó', code: 'ejszakas_dolgozo', description: 'Éjszakai műszakban éttermi és higiéniai feladatok.', active: 1 },
    { id: 3, title: 'Vendégtéri koordinátor', code: 'vendegteri_koordinator', description: 'Gondoskodás a vendégek élményéről az étteremteremben.', active: 1 },
    { id: 4, title: 'Tréner, oktató', code: 'trener_oktato', description: 'Új munkatársak betanítása és képzése.', active: 1 },
    { id: 5, title: 'Koordinátor', code: 'koordinator', description: 'Éttermi folyamatok és műszakok koordinálása.', active: 1 },
    { id: 6, title: 'Műszakvezető', code: 'muszakvezeto', description: 'Adott műszak operatív vezetéséért és a csapat irányításáért felelős pozíció.', active: 1 },
    { id: 7, title: 'Karbantartó', code: 'karbantarto', description: 'Éttermi gépek, berendezések karbantartása és műszaki feladatai.', active: 1 },
    { id: 8, title: 'Segéd karbantartó', code: 'seged_karbantarto', description: 'Karbantartási munkálatok segítése és műszaki előkészítés.' }
  ],
  restaurant_positions: [],
  applications: [],
  admin_users: []
};

for (let r = 1; r <= 5; r++) {
  for (let p = 1; p <= 8; p++) {
    memoryDb.restaurant_positions.push({ restaurant_id: r, position_id: p, is_open: 1 });
  }
}

if (!usePostgres && !useMemoryStore) {
  try {
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const sqlite3 = require('sqlite3').verbose();
    db = new sqlite3.Database(dbPath);
  } catch (e) {
    useSqlJs = true;
  }
}

function adaptSqlForPg(sql) {
  let paramIndex = 1;
  let adapted = sql.replace(/\?/g, () => `$${paramIndex++}`);
  adapted = adapted.replace(/strftime\('%Y-%m',\s*([a-zA-Z0-9_.]+)\)/gi, "to_char($1, 'YYYY-MM')");
  adapted = adapted.replace(/DATETIME\('now',\s*'-48 hours'\)/gi, "(NOW() - INTERVAL '48 hours')");
  adapted = adapted.replace(/DATETIME\('now'\)/gi, "NOW()");
  return adapted;
}

async function runAsync(sql, params = []) {
  if (usePostgres && pgPool) {
    let pgSql = adaptSqlForPg(sql);
    const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT INTO');
    if (isInsert && !pgSql.toUpperCase().includes('RETURNING')) {
      pgSql += ' RETURNING id';
    }
    const res = await pgPool.query(pgSql, params);
    const lastID = res.rows && res.rows[0] && res.rows[0].id ? res.rows[0].id : 1;
    return { lastID, changes: res.rowCount };
  }

  if (useMemoryStore) {
    const sqlLower = sql.toLowerCase().trim();
    if (sqlLower.startsWith('insert into applications')) {
      const newApp = {
        id: memoryDb.applications.length + 1,
        form_type: params[0],
        full_name: params[1],
        email: params[2],
        phone: params[3],
        birth_year: params[4],
        address: params[5],
        restaurant_id: params[6],
        position_id: params[7],
        education_level: params[8],
        is_student: params[9],
        cv_filename: params[10],
        cv_original_name: params[11],
        created_at: new Date().toISOString(),
        status: 'uj'
      };
      memoryDb.applications.push(newApp);
      return { lastID: newApp.id, changes: 1 };
    } else if (sqlLower.startsWith('insert into restaurant_positions') || sqlLower.startsWith('update restaurant_positions')) {
      const rId = params[0];
      const pId = params[1];
      const isOpen = params[2];
      const existing = memoryDb.restaurant_positions.find(m => m.restaurant_id === rId && m.position_id === pId);
      if (existing) {
        existing.is_open = isOpen ? 1 : 0;
      } else {
        memoryDb.restaurant_positions.push({ restaurant_id: rId, position_id: pId, is_open: isOpen ? 1 : 0 });
      }
      return { lastID: 1, changes: 1 };
    }
    return { lastID: 1, changes: 1 };
  }

  if (!useSqlJs && db) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  return { lastID: 1, changes: 1 };
}

async function getAsync(sql, params = []) {
  if (usePostgres && pgPool) {
    const pgSql = adaptSqlForPg(sql);
    const res = await pgPool.query(pgSql, params);
    return res.rows[0] || null;
  }

  if (useMemoryStore) {
    const sqlLower = sql.toLowerCase().trim();
    if (sqlLower.includes('from restaurants')) {
      const rest = memoryDb.restaurants.find(r => r.id === params[0]);
      return { count: memoryDb.restaurants.length, name: rest ? rest.name : '' };
    }
    if (sqlLower.includes('from positions')) {
      const pos = memoryDb.positions.find(p => p.id === params[0]);
      return { count: memoryDb.positions.length, title: pos ? pos.title : '' };
    }
    if (sqlLower.includes('from admin_users')) {
      const user = params[0];
      if (user === 'admin') {
        const hash = bcrypt.hashSync('adminpass', 10);
        return { id: 1, username: 'admin', password_hash: hash };
      }
      return null;
    }
    if (sqlLower.includes('from applications')) {
      return memoryDb.applications[0] || null;
    }
    return { count: 0 };
  }

  if (!useSqlJs && db) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  return null;
}

async function allAsync(sql, params = []) {
  if (usePostgres && pgPool) {
    const pgSql = adaptSqlForPg(sql);
    const res = await pgPool.query(pgSql, params);
    return res.rows;
  }

  if (useMemoryStore) {
    const sqlLower = sql.toLowerCase().trim();
    if (sqlLower.includes('from restaurants')) {
      return memoryDb.restaurants;
    }
    if (sqlLower.includes('from positions')) {
      return memoryDb.positions;
    }
    if (sqlLower.includes('from restaurant_positions')) {
      return memoryDb.restaurant_positions;
    }
    if (sqlLower.includes('from applications')) {
      return memoryDb.applications.map(a => {
        const r = memoryDb.restaurants.find(res => res.id === a.restaurant_id) || {};
        const p = memoryDb.positions.find(pos => pos.id === a.position_id) || {};
        return {
          ...a,
          restaurant_name: r.name || '',
          position_title: p.title || ''
        };
      });
    }
    return [];
  }

  if (!useSqlJs && db) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  return [];
}

async function initDatabase() {
  if (usePostgres && pgPool) {
    // Create Tables in Postgres
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS restaurants (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        address TEXT,
        active INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS positions (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        description TEXT,
        active INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS restaurant_positions (
        restaurant_id INTEGER NOT NULL,
        position_id INTEGER NOT NULL,
        is_open INTEGER DEFAULT 1,
        PRIMARY KEY (restaurant_id, position_id)
      );

      CREATE TABLE IF NOT EXISTS applications (
        id SERIAL PRIMARY KEY,
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
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'uj'
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
      );
    `);

    // Seed initial restaurants
    const restCountRes = await pgPool.query('SELECT COUNT(*) as count FROM restaurants');
    if (parseInt(restCountRes.rows[0].count, 10) === 0) {
      const defaultRestaurants = [
        { name: "Nyíregyháza belvárosi McDonald's", code: 'nyiregyhaza_belvaros', address: '4400 Nyíregyháza, Dózsa György út 1.' },
        { name: 'Nyíregyháza McDrive', code: 'nyiregyhaza_mcdrive', address: '4400 Nyíregyháza, Pazonyi út 36.' },
        { name: "Kisvárda McDonald's", code: 'kisvarda', address: '4600 Kisvárda, Városmajor út 2.' },
        { name: "Mátészalka McDonald's", code: 'mateszalka', address: '4700 Mátészalka, Kórház u. 1.' },
        { name: "Sátoraljaújhely McDonald's", code: 'satoraljaujhely', address: '3980 Sátoraljaújhely, Rákóczi út 12.' }
      ];
      for (const r of defaultRestaurants) {
        await pgPool.query('INSERT INTO restaurants (name, code, address) VALUES ($1, $2, $3)', [r.name, r.code, r.address]);
      }
    }

    const defaultPositions = [
      { id: 1, title: 'Éttermi dolgozó', code: 'ettermi_dolgozo', description: 'Vevőkiszolgálás, pénztárkezelés és konyhai feladatok.' },
      { id: 2, title: 'Éjszakás dolgozó', code: 'ejszakas_dolgozo', description: 'Éjszakai műszakban éttermi és higiéniai feladatok.' },
      { id: 3, title: 'Vendégtéri koordinátor', code: 'vendegteri_koordinator', description: 'Gondoskodás a vendégek élményéről az étteremteremben.' },
      { id: 4, title: 'Tréner, oktató', code: 'trener_oktato', description: 'Új munkatársak betanítása és képzése.' },
      { id: 5, title: 'Koordinátor', code: 'koordinator', description: 'Éttermi folyamatok és műszakok koordinálása.' },
      { id: 6, title: 'Műszakvezető', code: 'muszakvezeto', description: 'Adott műszak operatív vezetéséért és a csapat irányításáért felelős pozíció.' },
      { id: 7, title: 'Karbantartó', code: 'karbantarto', description: 'Éttermi gépek, berendezések karbantartása és műszaki feladatai.' },
      { id: 8, title: 'Segéd karbantartó', code: 'seged_karbantarto', description: 'Karbantartási munkálatok segítése és műszaki előkészítés.' }
    ];

    const posCountRes = await pgPool.query('SELECT COUNT(*) as count FROM positions');
    if (parseInt(posCountRes.rows[0].count, 10) === 0) {
      for (const p of defaultPositions) {
        await pgPool.query(
          'INSERT INTO positions (id, title, code, description, active) VALUES ($1, $2, $3, $4, 1) ON CONFLICT (code) DO NOTHING',
          [p.id, p.title, p.code, p.description]
        );
      }
    }

    const rests = await pgPool.query('SELECT id FROM restaurants');
    for (const r of rests.rows) {
      for (const p of defaultPositions) {
        await pgPool.query(
          `INSERT INTO restaurant_positions (restaurant_id, position_id, is_open) 
           VALUES ($1, $2, 1) 
           ON CONFLICT (restaurant_id, position_id) DO NOTHING`,
          [r.id, p.id]
        );
      }
    }

    const adminCountRes = await pgPool.query('SELECT COUNT(*) as count FROM admin_users');
    if (parseInt(adminCountRes.rows[0].count, 10) === 0) {
      const passwordHash = await bcrypt.hash('adminpass', 10);
      await pgPool.query('INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)', ['admin', passwordHash]);
    }
    return;
  }

  // SQLite fallback initialization
  if (!useMemoryStore && (!useSqlJs && db)) {
    // Standard SQLite tables
    await new Promise((res, rej) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS restaurants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          code TEXT UNIQUE NOT NULL,
          address TEXT,
          active INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS positions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          code TEXT UNIQUE NOT NULL,
          description TEXT,
          active INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS restaurant_positions (
          restaurant_id INTEGER NOT NULL,
          position_id INTEGER NOT NULL,
          is_open INTEGER DEFAULT 1,
          PRIMARY KEY (restaurant_id, position_id)
        );
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
          status TEXT DEFAULT 'uj'
        );
        CREATE TABLE IF NOT EXISTS admin_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL
        );
      `, err => err ? rej(err) : res());
    });
  }
}

module.exports = {
  db,
  pgPool,
  runAsync,
  getAsync,
  allAsync,
  initDatabase
};
