# KisSzabó Kft. (McDonald's Franchisee) - Standalone Állásjelentkezési Webalkalmazás & Admin Portál

## 📌 Projekt Összefoglaló & Jelenlegi Állapot

Modern, önálló (standalone) webalkalmazás a **KisSzabó Kft.** részére, amely egyetlen script taggel / HTML elemmel beágyazható a meglévő WordPress honlapba (`kisszabo.hu`). 

Lehetővé teszi az álláskeresők számára a jelentkezést az 5 McDonald's étterem nyitott pozícióira, megelőzi a duplikált és a spam beküldéseket, valamint egy letisztult Adminisztrációs Portált biztosít a nyitott pozíciók heti kapcsolgatásához és a beérkezett önéletrajzok kezeléséhez.

---

## 🚀 Indítás & Elérések

### Szerver indítása:
```bash
npm install
npm run dev
# vagy: node src/server.js
```

### Helyi elérések (Local URLs):
* **WordPress Demó Beágyazó Oldal:** `http://localhost:3000/embed/demo.html`
* **Adminisztrációs Portál:** `http://localhost:3000/admin` *(Belépés: `admin` / `adminpass`)*
* **Beágyazható JS Script:** `http://localhost:3000/embed/kisszabo-form.js`
* **Stíluslap (Cardo font):** `http://localhost:3000/embed/style.css`

---

## ✅ Elkészült Funkciók (Alap Csomag - 1. Fázis)

1. **Beágyazható Widget (`client/embed/kisszabo-form.js`)**:
   - **WordPress Beágyazás**: Egyetlen `<script>` taggel beilleszthető a WP Elementor / HTML modulba.
   - **Arculat**: McDonald's piros & arany akcentusok, **Cardo** Google Font tipográfia (a kisszabo.hu arculatával megegyezően), smooth animációk.
   - **5 Étterem Helyszín**:
     - Nyíregyháza belvárosi McDonald's
     - Nyíregyháza McDrive
     - Kisvárda McDonald's
     - Mátészalka McDonald's
     - Sátoraljaújhely McDonald's
   - **Dinamikus Pozíció Mátrix**: Étterem kiválasztásakor a munkakör rádiógombok **dinamikusan frissülnek**, és csak az adott étteremben nyitott pozíciókat mutatják.
   - **5 Végzettség Opció**:
     - Kevesebb mint 8 általános
     - Befejezett általános iskola
     - Középfokú: szakmunkásképző, szakközépiskola, gimnázium
     - Felsőfokú szakképzés
     - Főiskola - egyetem
   - **2 Form Típus**: `standard` (Normál karrier oldal) & `disability` (Megváltozott munkaképességűek oldala).
   - **Honeypot Spam Védelem**: Láthatatlan csapda mező (`website_hp`) a spambotok kiszűrésére kapu-tesztek (reCAPTCHA) nélkül.
   - **48 Órás Duplikáció Szűrés**: Email + Név + Étterem + Munkakör ellenőrzése az utolsó 48 órában. Egyezéskor a kért figyelmeztető üzenetet adja:
     > *"A megadott adatokkal már nemrég beküldte jelentkezését, esetleg jelentkezhet másik étterembe vagy más munkakörre, köszönjük!"*
   - **CV Upload & GDPR**: PDF, DOC, DOCX feltöltés (max 10MB) és GDPR elfogadás modal felugró ablakkal.
   - **Visszaigazoló Email**: HTML formázott válaszemail küldés (SMTP beállítás vagy mock logger).

2. **Adminisztrációs Portál (`client/admin/`)**:
   - **Mátrix Kezelő (Nyitott Pozíciók)**: Interaktív 5x9-es grid toggle kapcsolókkal a pozíciók heti ki/bekapcsolásához.
   - **Jelentkezések Felület**: Kereshető, szűrhető adatbázis név, email, telefon, végzettség és csatolt önéletrajz letöltéssel.
   - **Statisztika & CSV Export**: Havi kimutatások és 1-kattintásos **CSV Letöltés**.
   - **WP Kód Generáló**: Másolható HTML/JS kódrészletek.

---

## 🔮 Következő Lépés: Bővített HR App / ATS (2. Fázis - Orsinak szánt Upsell)

Amikor a tulajdonossal (Orsival) egyeztettek, az Alap csomagra építve az alábbi modullal bővíthetjük a rendszert:
- **Jelöltkezelő Kanban tábla / Státuszok**: `Új jelentkező` ➔ `Előszűrt` ➔ `Interjúra hívva` ➔ `Elutasítva` ➔ `Felvéve`
- **Belső Jegyzetek & Önéletrajz Nézegető**: Belső megjegyzések fűzése a jelölthöz, CV megtekintés böngészőben letöltés nélkül.
- **Interjú Naptár**: Időpont hozzárendelése a jelölthöz és automatikus interjú meghívó email küldése.
- **GDPR Auto-Törlés**: X hónap után az elutasított jelöltek adatainak és önéletrajzainak automatikus megsemmisítése.

---

## 📁 Projekt Fájlstruktúra

```
MC_Donalds/
├── data/
│   └── database.sqlite         # SQLite Adatbázis (Étterem, pozíciók, jelentkezések, adminok)
├── public/
│   ├── admin/                  # Adminisztrációs Portál SPA
│   │   ├── index.html
│   │   ├── admin.css           # Montserrat font & responsive layout
│   │   └── admin.js            # JWT auth, matrix toggle, stats & export
│   └── embed/                  # Beágyazható WordPress Widget
│       ├── kisszabo-form.js    # Standalone JS Form Widget
│       ├── style.css           # UI stíluslap (Montserrat font)
│       └── demo.html           # WordPress beágyazási demó
├── src/
│   ├── database.js             # DB schema & 5 étterem / 9 pozíció seed
│   └── server.js               # REST API, Multer upload, Auth, Mailer
├── uploads/                    # Feltöltött önéletrajzok (CV fájlok)
├── package.json
└── README.md
```
