require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { initDatabase, runAsync, getAsync, allAsync } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'kisszabo_hr_secret_key_2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Lazy DB init for requests
let dbInitialized = false;
let dbInitPromise = null;

app.use(async (req, res, next) => {
  try {
    if (!dbInitialized) {
      if (!dbInitPromise) {
        dbInitPromise = initDatabase().then(() => {
          dbInitialized = true;
        });
      }
      await dbInitPromise;
    }
    next();
  } catch (err) {
    console.error('DB init middleware error:', err);
    res.status(500).json({ error: 'Database init error: ' + err.message });
  }
});

// Serve Static files for Embed script, Admin SPA and Pictures
app.use('/embed', express.static(path.join(__dirname, '../public/embed')));
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));
app.use('/pictures', express.static(path.join(__dirname, '../public/pictures')));

const os = require('os');
const isVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);

// Ensure Uploads Directory exists (use /tmp on Vercel serverless)
const uploadDir = isVercel
  ? path.join(os.tmpdir(), 'uploads')
  : path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Dynamic CV Delivery Endpoint (works on Vercel serverless and local disk)
app.get(['/uploads/:filename', '/api/admin/cv/:id', '/api/admin/cv/file/:filename'], async (req, res) => {
  try {
    const { filename, id } = req.params;
    let appRecord = null;
    
    if (id && !isNaN(parseInt(id, 10))) {
      appRecord = await getAsync('SELECT cv_filename, cv_original_name, cv_mimetype, cv_data FROM applications WHERE id = ?', [parseInt(id, 10)]);
    } else if (filename) {
      appRecord = await getAsync('SELECT cv_filename, cv_original_name, cv_mimetype, cv_data FROM applications WHERE cv_filename = ?', [filename]);
    }

    const targetFilename = filename || (appRecord ? appRecord.cv_filename : '');
    const diskPath = path.join(uploadDir, targetFilename);
    const localFallbackPath = path.join(__dirname, '../uploads', targetFilename);

    if (fs.existsSync(diskPath)) {
      return res.sendFile(diskPath);
    }
    if (fs.existsSync(localFallbackPath)) {
      return res.sendFile(localFallbackPath);
    }

    if (appRecord && appRecord.cv_data) {
      const fileBuffer = Buffer.from(appRecord.cv_data, 'base64');
      const mimeType = appRecord.cv_mimetype || 'application/pdf';
      const originalName = appRecord.cv_original_name || 'oneletrajz.pdf';
      
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
      return res.send(fileBuffer);
    }

    return res.status(404).send('Önéletrajz fájl nem található.');
  } catch (err) {
    console.error('Error delivering CV:', err);
    res.status(500).send('Hiba történt a fájl megnyitásakor.');
  }
});

// Multer Storage Configuration for CV Files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'cv-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Csak PDF, DOC és DOCX formátumú önéletrajz tölthető fel!'));
    }
  }
});

// Admin JWT Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Bejelentkezés szükséges!' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Érvénytelen vagy lejárt munkamenet!' });
    req.user = user;
    next();
  });
}

// Nodemailer Transporter Setup
const smtpHost = process.env.SMTP_HOST || 'mail.rekalaca-webdesign.hu';
const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
const smtpUser = process.env.SMTP_USER || 'contact@rekalaca-webdesign.hu';
const smtpPass = process.env.SMTP_PASS || 'Webdesign2025?';
const smtpSecure = process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === 'true' : (smtpPort === 465);

let transporter = null;
if (smtpHost && smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure, // true for 465, false for 587/25
    auth: {
      user: smtpUser,
      pass: smtpPass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
  console.log(`[SMTP CONFIG] Transporter initialized for ${smtpUser} via ${smtpHost}:${smtpPort}`);
}

async function sendAutoReplyEmail(toEmail, applicantName, positionTitle, restaurantName) {
  const subject = `Köszönjük jelentkezését - KisSzabó Kft. (${restaurantName})`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #da291c; margin: 0;">KisSzabó Kft. - Állásjelentkezés</h2>
      </div>
      <p>Kedves <strong>${applicantName}</strong>!</p>
      <p>Köszönjük, hogy jelentkeztél a(z) <strong>${restaurantName}</strong> éttermünkbe a(z) <strong>${positionTitle}</strong> munkakörre!</p>
      <p style="background-color: #fff8e1; padding: 15px; border-left: 4px solid #ffbc0d; border-radius: 4px;">
        Jelentkezésedet sikeresen rögzítettük rendszerünkben. HR kollégánk hamarosan feldolgozza az adataidat és felveszi veled a kapcsolatot a megadott elérhetőségeiden.
      </p>
      <p>Üdvözlettel,<br><strong>KisSzabó Kft. HR Csapat</strong></p>
      <hr style="border: none; border-top: 1px solid #eee; margin-top: 30px;">
      <p style="font-size: 12px; color: #888; text-align: center;">Ez egy automatikus visszaigazoló üzenet, kérjük ne válaszolj rá.</p>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: `"KisSzabó Kft. Karrier" <${smtpUser}>`,
        to: toEmail,
        subject,
        html: htmlContent
      });
      console.log(`[EMAIL SENT] Auto-reply sent to ${toEmail}`);
    } catch (error) {
      console.error(`[EMAIL ERROR] Failed to send email to ${toEmail}:`, error.message);
    }
  } else {
    console.log(`[MOCK EMAIL LOG] Auto-reply to ${toEmail} for position '${positionTitle}' at '${restaurantName}'`);
  }
}

// -------------------------------------------------------------
// PUBLIC API ENDPOINTS (FOR EMBEDDABLE FORM)
// -------------------------------------------------------------

// 1. Get initial configuration (restaurants & open positions matrix)
app.get('/api/public/config', async (req, res) => {
  try {
    const restaurants = await allAsync(`SELECT id, name, code, address FROM restaurants WHERE active = 1`);
    const positions = await allAsync(`SELECT id, title, code, description FROM positions WHERE active = 1`);

    // Get open positions matrix mapping
    const openMatrix = await allAsync(`
      SELECT restaurant_id, position_id 
      FROM restaurant_positions 
      WHERE is_open = 1
    `);

    res.json({
      restaurants,
      positions,
      openMatrix,
      educationLevels: [
        'Kevesebb mint 8 általános',
        'Befejezett általános iskola',
        'Középfokú: szakmunkásképző, szakközépiskola, gimnázium',
        'Felsőfokú szakképzés',
        'Főiskola - egyetem'
      ]
    });
  } catch (error) {
    console.error('Error fetching public config:', error);
    res.status(500).json({ error: 'Szerver hiba az adatok lekérésekor!' });
  }
});

// 2. Process Application Submission
app.post('/api/public/apply', upload.single('cv'), async (req, res) => {
  try {
    const {
      form_type = 'standard',
      full_name,
      email,
      phone,
      birth_year,
      address,
      restaurant_id,
      position_id,
      education_level,
      is_student,
      gdpr_consent,
      website_hp // Honeypot field
    } = req.body;

    // A) Honeypot Spam Protection Check
    if (website_hp && website_hp.trim() !== '') {
      console.warn(`[SPAM DETECTED] Honeypot field filled by bot: ${email}`);
      // Return fake success to confuse bots without inserting into DB
      return res.json({
        success: true,
        message: 'Köszönjük jelentkezését! Kollégánk hamarosan keresni fogja.'
      });
    }

    // B) Required Fields Validation
    if (!full_name || !email || !phone || !birth_year || !address || !restaurant_id || !position_id || !education_level) {
      return res.status(400).json({ error: 'Kérjük, töltsön ki minden kötelező mezőt!' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Az önéletrajz csatolása kötelező!' });
    }

    if (gdpr_consent !== 'true' && gdpr_consent !== '1' && gdpr_consent !== true) {
      return res.status(400).json({ error: 'Az Adatkezelési Tájékoztató elfogadása kötelező!' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = full_name.trim();

    // C) 48-Hour Duplicate Submission Check
    const existingSubmission = await getAsync(
      `SELECT id, created_at FROM applications 
       WHERE LOWER(email) = ? 
         AND LOWER(full_name) = LOWER(?) 
         AND restaurant_id = ? 
         AND position_id = ? 
         AND created_at >= DATETIME('now', '-48 hours')
       LIMIT 1`,
      [cleanEmail, cleanName, restaurant_id, position_id]
    );

    if (existingSubmission) {
      // Clean up uploaded file if duplicate rejected
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(422).json({
        duplicate: true,
        message: 'A megadott adatokkal már nemrég beküldte jelentkezését, esetleg jelentkezhet másik étterembe vagy más munkakörre, köszönjük!'
      });
    }

    // D) Extract CV file content as Base64 for persistent cloud storage
    let cvData = '';
    let cvMime = req.file.mimetype || 'application/pdf';
    try {
      if (req.file.path && fs.existsSync(req.file.path)) {
        cvData = fs.readFileSync(req.file.path).toString('base64');
      } else if (req.file.buffer) {
        cvData = req.file.buffer.toString('base64');
      }
    } catch (e) {
      console.warn('[CV STORAGE] Failed reading file buffer:', e.message);
    }

    // Save to Database
    const result = await runAsync(
      `INSERT INTO applications (
        form_type, full_name, email, phone, birth_year, address,
        restaurant_id, position_id, education_level, is_student,
        cv_filename, cv_original_name, cv_mimetype, cv_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        form_type,
        cleanName,
        cleanEmail,
        phone.trim(),
        parseInt(birth_year, 10),
        address.trim(),
        parseInt(restaurant_id, 10),
        parseInt(position_id, 10),
        education_level,
        is_student === 'true' || is_student === '1' || is_student === true ? 1 : 0,
        req.file.filename,
        req.file.originalname,
        cvMime,
        cvData
      ]
    );

    // E) Get names for email notification
    const restaurant = await getAsync(`SELECT name FROM restaurants WHERE id = ?`, [restaurant_id]);
    const position = await getAsync(`SELECT title FROM positions WHERE id = ?`, [position_id]);

    // Send Auto-reply email (awaiting on serverless to ensure delivery)
    try {
      await sendAutoReplyEmail(cleanEmail, cleanName, position ? position.title : '', restaurant ? restaurant.name : '');
    } catch (emailErr) {
      console.error('[EMAIL ERROR] Non-blocking email sending error:', emailErr.message);
    }

    res.json({
      success: true,
      application_id: result.lastID,
      message: 'Köszönjük jelentkezését! Kollégánk hamarosan keresni fogja.'
    });
  } catch (error) {
    console.error('Error processing application:', error);
    res.status(500).json({ error: 'Szerver hiba történt a jelentkezés feldolgozásakor!' });
  }
});

// -------------------------------------------------------------
// ADMIN API ENDPOINTS (PROTECTED BY JWT)
// -------------------------------------------------------------

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Felhasználónév és jelszó megadása kötelező!' });
  }

  try {
    const admin = await getAsync(`SELECT * FROM admin_users WHERE username = ?`, [username]);
    if (!admin) {
      return res.status(401).json({ error: 'Érvénytelen felhasználónév vagy jelszó!' });
    }

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Érvénytelen felhasználónév vagy jelszó!' });
    }

    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: admin.username });
  } catch (error) {
    console.error('Error logging in admin:', error);
    res.status(500).json({ error: 'Szerver hiba a bejelentkezéskor!' });
  }
});

// Get Matrix (Open positions per restaurant)
app.get('/api/admin/matrix', authenticateToken, async (req, res) => {
  try {
    const restaurants = await allAsync(`SELECT * FROM restaurants ORDER BY id ASC`);
    const positions = await allAsync(`SELECT * FROM positions ORDER BY id ASC`);
    const matrix = await allAsync(`SELECT * FROM restaurant_positions`);

    res.json({ restaurants, positions, matrix });
  } catch (error) {
    console.error('Error fetching matrix:', error);
    res.status(500).json({ error: 'Hiba a mátrix lekérésekor!' });
  }
});

// Toggle Position Status in Matrix
app.post('/api/admin/matrix/toggle', authenticateToken, async (req, res) => {
  const { restaurant_id, position_id, is_open } = req.body;
  try {
    await runAsync(
      `INSERT INTO restaurant_positions (restaurant_id, position_id, is_open) 
       VALUES (?, ?, ?) 
       ON CONFLICT(restaurant_id, position_id) 
       DO UPDATE SET is_open = excluded.is_open`,
      [restaurant_id, position_id, is_open ? 1 : 0]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error toggling matrix position:', error);
    res.status(500).json({ error: 'Hiba a pozíció frissítésekor!' });
  }
});

// List Applications with Search, Filters & Pagination
app.get('/api/admin/applications', authenticateToken, async (req, res) => {
  const { month, restaurant_id, position_id, search, form_type } = req.query;

  let query = `
    SELECT 
      a.id, a.form_type, a.full_name, a.email, a.phone, a.birth_year, a.address,
      a.education_level, a.is_student, a.cv_filename, a.cv_original_name,
      a.created_at, a.status,
      r.name as restaurant_name,
      p.title as position_title
    FROM applications a
    JOIN restaurants r ON a.restaurant_id = r.id
    JOIN positions p ON a.position_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (month) {
    query += ` AND strftime('%Y-%m', a.created_at) = ?`;
    params.push(month);
  }

  if (restaurant_id) {
    query += ` AND a.restaurant_id = ?`;
    params.push(restaurant_id);
  }

  if (position_id) {
    query += ` AND a.position_id = ?`;
    params.push(position_id);
  }

  if (form_type) {
    query += ` AND a.form_type = ?`;
    params.push(form_type);
  }

  if (search) {
    query += ` AND (a.full_name LIKE ? OR a.email LIKE ? OR a.phone LIKE ?)`;
    const searchPattern = `%${search.trim()}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  query += ` ORDER BY a.created_at DESC`;

  try {
    const applications = await allAsync(query, params);
    res.json({ applications });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ error: 'Hiba a jelentkezések lekérésekor!' });
  }
});

// Monthly Statistics Aggregation
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
  try {
    const monthlySummary = await allAsync(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as total_count,
        SUM(CASE WHEN form_type = 'standard' THEN 1 ELSE 0 END) as standard_count,
        SUM(CASE WHEN form_type = 'disability' THEN 1 ELSE 0 END) as disability_count
      FROM applications
      GROUP BY month
      ORDER BY month DESC
    `);

    const restaurantSummary = await allAsync(`
      SELECT 
        r.name as restaurant_name,
        COUNT(a.id) as count
      FROM restaurants r
      LEFT JOIN applications a ON r.id = a.restaurant_id
      GROUP BY r.id
      ORDER BY count DESC
    `);

    const positionSummary = await allAsync(`
      SELECT 
        p.title as position_title,
        COUNT(a.id) as count
      FROM positions p
      LEFT JOIN applications a ON p.id = a.position_id
      GROUP BY p.id
      ORDER BY count DESC
    `);

    res.json({
      monthlySummary,
      restaurantSummary,
      positionSummary
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Hiba a statisztikák lekérésekor!' });
  }
});

// CSV Export for a specific month or all applications
app.get('/api/admin/stats/export', authenticateToken, async (req, res) => {
  const { month } = req.query;

  let query = `
    SELECT 
      a.id, a.created_at, a.form_type, a.full_name, a.email, a.phone, 
      a.birth_year, a.address, r.name as restaurant, p.title as position,
      a.education_level, a.is_student
    FROM applications a
    JOIN restaurants r ON a.restaurant_id = r.id
    JOIN positions p ON a.position_id = p.id
  `;
  const params = [];

  if (month) {
    query += ` WHERE strftime('%Y-%m', a.created_at) = ?`;
    params.push(month);
  }

  query += ` ORDER BY a.created_at DESC`;

  try {
    const rows = await allAsync(query, params);

    // Build CSV with UTF-8 BOM for Excel compatibility
    let csv = '\uFEFF';
    csv += 'ID;Dátum;Típus;Név;Email;Telefon;Születési év;Lakcím;Étterem;Munkakör;Végzettség;Nappali tagozatos diák\n';

    for (const r of rows) {
      const formTypeLabel = r.form_type === 'disability' ? 'Megváltozott munkaképességű' : 'Normál';
      const isStudentLabel = r.is_student ? 'Igen' : 'Nem';
      csv += `"${r.id}";"${r.created_at}";"${formTypeLabel}";"${r.full_name}";"${r.email}";"${r.phone}";"${r.birth_year}";"${r.address}";"${r.restaurant}";"${r.position}";"${r.education_level}";"${isStudentLabel}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=kisszabo_jelentkezesek_${month || 'osszes'}.csv`);
    res.status(200).send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Hiba a CSV exportálásakor!' });
  }
});

// Default redirect for root
app.get('/', (req, res) => {
  res.redirect('/admin');
});

if (!isVercel) {
  initDatabase().then(() => {
    app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(` KisSzabó Kft. Job App Server Running!`);
      console.log(` Admin Portal:  http://localhost:${PORT}/admin`);
      console.log(` Embed Script:  http://localhost:${PORT}/embed/kisszabo-form.js`);
      console.log(`====================================================`);
    });
  }).catch(err => {
    console.error('Failed to initialize database:', err);
  });
}

module.exports = app;
