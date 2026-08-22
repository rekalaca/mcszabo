const path = require('path');
const fs = require('fs');
const os = require('os');
const bcrypt = require('bcryptjs');

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
let useMemoryStore = isVercel;
let SQL = null;
let sqlJsDb = null;

// Pure JS in-memory store for Vercel fallback
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
    { id: 8, title: 'Segéd karbantartó', code: 'seged_karbantarto', description: 'Karbantartási munkálatok segítése és műszaki előkészítés.', active: 1 }
  ],
  restaurant_positions: [],
  applications: [],
  admin_users: []
};

// Populate default matrix for memoryDb (all positions open for all restaurants)
for (let r = 1; r <= 5; r++) {
  for (let p = 1; p <= 8; p++) {
    memoryDb.restaurant_positions.push({ restaurant_id: r, position_id: p, is_open: 1 });
  }
}

if (!useSqlJs) {
  try {
    const sqlite3 = require('sqlite3').verbose();
    db = new sqlite3.Database(dbPath);
  } catch (e) {
    console.warn('[DB NOTICE] Native sqlite3 binding unavailable, using fallback driver:', e.message);
    useSqlJs = true;
  }
}

async function initSqlJs() {
  if (useMemoryStore) return;
  if (!SQL) {
    try {
      const initSqlJsLib = require('sql.js');
      const wasmPath = path.join(process.cwd(), 'node_modules/sql.js/dist');
      SQL = await initSqlJsLib({
        locateFile: file => path.join(wasmPath, file)
      });
    } catch (err) {
      console.warn('[DB NOTICE] WASM initialization failed, using pure JS memory store:', err.message);
      useMemoryStore = true;
      return;
    }
  }
  if (!sqlJsDb && SQL) {
    try {
      if (fs.existsSync(dbPath)) {
        const filebuffer = fs.readFileSync(dbPath);
        sqlJsDb = new SQL.Database(filebuffer);
      } else {
        sqlJsDb = new SQL.Database();
      }
    } catch (e) {
      useMemoryStore = true;
    }
  }
}

function saveSqlJsDb() {
  if (sqlJsDb && isVercel && !useMemoryStore) {
    try {
      const data = sqlJsDb.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (e) {}
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
  }
  
  await initSqlJs();

  if (useMemoryStore || !sqlJsDb) {
    // Memory store fallback for writes
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

  try {
    sqlJsDb.run(sql, params);
    saveSqlJsDb();
    let lastID = 1;
    try {
      const res = sqlJsDb.exec("SELECT last_insert_rowid() as id");
      if (res && res[0] && res[0].values && res[0].values[0]) {
        lastID = res[0].values[0][0];
      }
    } catch(e) {}
    return { lastID, changes: 1 };
  } catch (err) {
    console.error('SQL.JS Run Error:', err.message);
    return { lastID: 1, changes: 0 };
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
  }

  await initSqlJs();

  if (useMemoryStore || !sqlJsDb) {
    const sqlLower = sql.toLowerCase().trim();
    if (sqlLower.includes('from restaurants')) {
      return { count: memoryDb.restaurants.length, name: (memoryDb.restaurants.find(r => r.id === params[0]) || {}).name || '' };
    }
    if (sqlLower.includes('from positions')) {
      return { count: memoryDb.positions.length, title: (memoryDb.positions.find(p => p.id === params[0]) || {}).title || '' };
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

  try {
    const stmt = sqlJsDb.prepare(sql);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
  } catch (e) {
    return null;
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
  }

  await initSqlJs();

  if (useMemoryStore || !sqlJsDb) {
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

  try {
    const stmt = sqlJsDb.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch (e) {
    return [];
  }
}

function execAsync(sql) {
  if (!useSqlJs && db) {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  return (async () => {
    await initSqlJs();
    if (sqlJsDb && !useMemoryStore) {
      try {
        sqlJsDb.exec(sql);
        saveSqlJsDb();
      } catch (e) {}
    }
  })();
}

async function initDatabase() {
  if (!useSqlJs && db) db.serialize();

  await execAsync(`
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
  `);

  if (!useMemoryStore && (!useSqlJs && db)) {
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

    await runAsync(`DELETE FROM positions`);
    for (const p of targetPositions) {
      await runAsync(
        `INSERT INTO positions (id, title, code, description, active) VALUES (?, ?, ?, ?, 1)`,
        [p.id, p.title, p.code, p.description]
      );
    }

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

    const adminCount = await getAsync(`SELECT COUNT(*) as count FROM admin_users`);
    if (adminCount.count === 0) {
      const passwordHash = await bcrypt.hash('adminpass', 10);
      await runAsync(`INSERT INTO admin_users (username, password_hash) VALUES (?, ?)`, ['admin', passwordHash]);
    }
  }
}

module.exports = {
  db,
  runAsync,
  getAsync,
  allAsync,
  initDatabase
};
