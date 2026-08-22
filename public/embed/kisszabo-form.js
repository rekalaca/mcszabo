(function () {
  'use strict';

  // Determine API Base URL from script tag src or fallback to current origin
  const scriptTag = document.currentScript || Array.from(document.querySelectorAll('script')).find(s => s.src && s.src.includes('kisszabo-form.js'));
  let apiBaseUrl = '';
  if (scriptTag && scriptTag.src) {
    const url = new URL(scriptTag.src);
    apiBaseUrl = url.origin;
  } else {
    apiBaseUrl = window.location.origin;
  }

  // Inject CSS if not already present
  if (!document.getElementById('ks-form-styles')) {
    const link = document.createElement('link');
    link.id = 'ks-form-styles';
    link.rel = 'stylesheet';
    link.href = `${apiBaseUrl}/embed/style.css`;
    document.head.appendChild(link);
  }

  class KisszaboJobForm {
    constructor(container) {
      this.container = container;
      this.formType = container.getAttribute('data-form-type') || 'standard';
      this.config = null;
      this.selectedRestaurantId = null;
      this.init();
    }

    async init() {
      this.container.innerHTML = `<div class="ks-form-container"><p style="text-align:center; padding: 20px;">Űrlap betöltése...</p></div>`;

      try {
        const response = await fetch(`${apiBaseUrl}/api/public/config`);
        if (!response.ok) throw new Error('Nem sikerült az adatokat lekérni');
        this.config = await response.json();
        this.render();
      } catch (error) {
        console.error('Error loading Kisszabo Job Form:', error);
        this.container.innerHTML = `
          <div class="ks-form-container">
            <div class="ks-alert ks-alert-error">
              ❌ Hiba történt a jelentkezési űrlap betöltésekor. Kérjük, próbálja újra később!
            </div>
          </div>
        `;
      }
    }

    render() {
      const isDisability = this.formType === 'disability';
      const title = isDisability 
        ? 'Jelentkezés Megváltozott Munkaképességgel' 
        : 'Munkára jelentkezés - KisSzabó Kft.';
      const subtitle = isDisability
        ? 'Büszkék vagyunk az elfogadó munkakörnyezetünkre. Töltse ki az alábbi adatokat!'
        : 'Válassza ki a legközelebbi éttermet és küldje el jelentkezését hozzánk!';

      this.container.innerHTML = `
        <div class="ks-form-container">
          <div class="ks-form-header">
            <img src="${apiBaseUrl}/pictures/work.png" class="ks-form-badge-img" alt="KisSzabó Kft. Logo">
            <div class="ks-form-header-text">
              <h2>${title}</h2>
              <p>${subtitle}</p>
            </div>
          </div>

          <div id="ks-alert-box"></div>

          <form id="ks-job-application-form" enctype="multipart/form-data">
            <input type="hidden" name="form_type" value="${this.formType}">

            <!-- Honeypot Invisible Spam Field -->
            <input type="text" name="website_hp" class="ks-hp-field" tabindex="-1" autocomplete="off">

            <div class="ks-form-grid">
              <!-- Full Name -->
              <div class="ks-field">
                <label class="ks-label">Teljes név <span class="required">*</span></label>
                <input type="text" name="full_name" class="ks-input" required>
              </div>

              <!-- Email -->
              <div class="ks-field">
                <label class="ks-label">Email cím <span class="required">*</span></label>
                <input type="email" name="email" class="ks-input" required>
              </div>

              <!-- Phone -->
              <div class="ks-field">
                <label class="ks-label">Telefonszám <span class="required">*</span></label>
                <input type="tel" name="phone" class="ks-input" required>
              </div>

              <!-- Birth Year -->
              <div class="ks-field">
                <label class="ks-label">Születési év <span class="required">*</span></label>
                <input type="number" name="birth_year" class="ks-input" min="1950" max="2010" required>
              </div>

              <!-- Address -->
              <div class="ks-field ks-col-full">
                <label class="ks-label">Lakcím <span class="required">*</span></label>
                <input type="text" name="address" class="ks-input" required>
              </div>

              <!-- Restaurant Selection -->
              <div class="ks-field ks-col-full">
                <label class="ks-label">Válasszon éttermet <span class="required">*</span></label>
                <select name="restaurant_id" id="ks-restaurant-select" class="ks-select" required>
                  <option value="">-- Kérjük, válasszon éttermet --</option>
                  ${this.config.restaurants.map(r => `<option value="${r.id}">${r.name} (${r.address || ''})</option>`).join('')}
                </select>
              </div>

              <!-- Dynamic Position Radio Buttons -->
              <div class="ks-field ks-col-full">
                <label class="ks-label">Nyitott munkakörök az adott étteremben <span class="required">*</span></label>
                <div id="ks-positions-container">
                  <p style="font-size: 14px; color: #888; margin: 4px 0;">Először válasszon éttermet a nyitott pozíciók megjelenítéséhez!</p>
                </div>
              </div>

              <!-- Highest Education -->
              <div class="ks-field ks-col-full">
                <label class="ks-label">Legmagasabb iskolai végzettség <span class="required">*</span></label>
                <select name="education_level" class="ks-select" required>
                  <option value="">-- Kérjük, válasszon --</option>
                  ${this.config.educationLevels.map(e => `<option value="${e}">${e}</option>`).join('')}
                </select>
              </div>

              <!-- Student Status -->
              <div class="ks-field ks-col-full">
                <label class="ks-label">Jelenleg nappali tagozatos hallgató / diák vagy? <span class="required">*</span></label>
                <div class="ks-inline-radios">
                  <label class="ks-checkbox-label">
                    <input type="radio" name="is_student" value="true" required> Igen
                  </label>
                  <label class="ks-checkbox-label">
                    <input type="radio" name="is_student" value="false" checked required> Nem
                  </label>
                </div>
              </div>

              <!-- CV Upload -->
              <div class="ks-field ks-col-full">
                <label class="ks-label">Önéletrajz csatolása (PDF, DOC, DOCX - max 10MB) <span class="required">*</span></label>
                <div class="ks-file-upload" onclick="document.getElementById('ks-cv-file').click()">
                  <div class="ks-file-upload-icon">📄</div>
                  <div><strong>Kattintson az önéletrajz kiválasztásához</strong></div>
                  <div style="font-size: 12px; color: #777;">Kattintson vagy húzza ide a fájlt</div>
                  <div class="ks-file-name" id="ks-file-name-display"></div>
                </div>
                <input type="file" id="ks-cv-file" name="cv" accept=".pdf,.doc,.docx" required onchange="
                  const display = document.getElementById('ks-file-name-display');
                  if (this.files && this.files[0]) {
                    display.innerText = 'Kiválasztott fájl: ' + this.files[0].name;
                  } else {
                    display.innerText = '';
                  }
                ">
              </div>

              <!-- GDPR Consent -->
              <div class="ks-field ks-col-full">
                <label class="ks-checkbox-label">
                  <input type="checkbox" name="gdpr_consent" value="true" required>
                  <span>Elfogadom az <a class="ks-link" onclick="window.openAdatkezelésiModal && window.openAdatkezelésiModal(); return false;">Adatkezelési Tájékoztatót</a> és hozzájárulok személyes adataim kezeléséhez a jelentkezés során. <span class="required">*</span></span>
                </label>
              </div>

              <!-- Submit Button -->
              <div class="ks-field ks-col-full" style="margin-top: 10px;">
                <button type="submit" class="ks-submit-btn" id="ks-submit-btn">
                  <span>Jelentkezés beküldése</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      `;

      this.bindEvents();
    }

    bindEvents() {
      const restaurantSelect = this.container.querySelector('#ks-restaurant-select');
      const positionsContainer = this.container.querySelector('#ks-positions-container');
      const form = this.container.querySelector('#ks-job-application-form');

      restaurantSelect.addEventListener('change', (e) => {
        const restaurantId = parseInt(e.target.value, 10);
        this.selectedRestaurantId = restaurantId;

        if (!restaurantId) {
          positionsContainer.innerHTML = `<p style="font-size: 14px; color: #888; margin: 4px 0;">Először válasszon éttermet a nyitott pozíciók megjelenítéséhez!</p>`;
          return;
        }

        // Filter open positions for selected restaurant
        const openPositionIds = this.config.openMatrix
          .filter(m => m.restaurant_id === restaurantId)
          .map(m => m.position_id);

        const availablePositions = this.config.positions.filter(p => openPositionIds.includes(p.id));

        if (availablePositions.length === 0) {
          positionsContainer.innerHTML = `<p style="font-size: 14px; color: #d32f2f; margin: 4px 0;">Jelenleg ebben az étteremben nincs nyitott pozíció!</p>`;
          return;
        }

        positionsContainer.innerHTML = `
          <div class="ks-positions-grid">
            ${availablePositions.map((p, idx) => `
              <div class="ks-radio-card">
                <input type="radio" id="pos_${p.id}" name="position_id" value="${p.id}" ${idx === 0 ? 'checked' : ''} required>
                <label for="pos_${p.id}" class="ks-radio-card-label">
                  <span class="ks-radio-indicator"></span>
                  <span>${p.title}</span>
                </label>
              </div>
            `).join('')}
          </div>
        `;
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = this.container.querySelector('#ks-submit-btn');

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>⏳ Beküldés folyamatban...</span>`;

        const formData = new FormData(form);

        try {
          const response = await fetch(`${apiBaseUrl}/api/public/apply`, {
            method: 'POST',
            body: formData
          });

          const result = await response.json();

          if (response.status === 422 && result.duplicate) {
            // 48h Duplicate Submission Warning
            showKsModal(
              'warning',
              'Már beküldött jelentkezés!',
              result.message || 'A megadott adatokkal már nemrég beküldte jelentkezését az adott étterembe és munkakörre. Kérjük válasszon másik munkakört vagy éttermet!'
            );
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>Jelentkezés beküldése</span>`;
            return;
          }

          if (!response.ok || !result.success) {
            throw new Error(result.error || 'Hiba történt a jelentkezés beküldése során. Kérjük, próbálja újra!');
          }

          // Success Modal
          showKsModal(
            'success',
            'Sikeres jelentkezés! 🎉',
            `${result.message || 'Köszönjük jelentkezését! Rendkívül örülünk, hogy csapatunk tagja szeretne lenni.'}<br><br>📧 <em>Visszaigazoló e-mailt küldtünk a megadott e-mail címre, HR kollégánk pedig hamarosan keresni fogja!</em>`,
            () => {
              form.reset();
              const display = document.getElementById('ks-file-name-display');
              if (display) display.innerText = '';
              positionsContainer.innerHTML = `<p style="font-size: 14px; color: #888; margin: 4px 0;">Először válasszon éttermet a nyitott pozíciók megjelenítéséhez!</p>`;
              window.scrollTo({ top: this.container.offsetTop - 50, behavior: 'smooth' });
            }
          );

          form.reset();
          const display = document.getElementById('ks-file-name-display');
          if (display) display.innerText = '';
          positionsContainer.innerHTML = `<p style="font-size: 14px; color: #888; margin: 4px 0;">Először válasszon éttermet a nyitott pozíciók megjelenítéséhez!</p>`;

          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span>Jelentkezés beküldése</span>`;

        } catch (err) {
          showKsModal(
            'error',
            'Hiba a beküldéskor ❌',
            err.message || 'Nem sikerült elküldeni a jelentkezést. Kérjük ellenőrizze az internetkapcsolatot vagy próbálja újra!'
          );
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span>Jelentkezés beküldése</span>`;
        }
      });
    }
  }

  // Interactive Popup Modal Helper
  function showKsModal(type, title, message, onClose) {
    let modalOverlay = document.getElementById('ks-modal-overlay');
    if (!modalOverlay) {
      modalOverlay = document.createElement('div');
      modalOverlay.id = 'ks-modal-overlay';
      modalOverlay.className = 'ks-modal-overlay';
      document.body.appendChild(modalOverlay);
    }

    const iconMap = {
      success: '✓',
      warning: '!',
      error: '✕'
    };

    modalOverlay.className = `ks-modal-overlay ks-modal-${type} active`;
    modalOverlay.innerHTML = `
      <div class="ks-modal-card">
        <div class="ks-modal-icon-wrap">
          ${iconMap[type] || 'ℹ'}
        </div>
        <h3 class="ks-modal-title">${title}</h3>
        <div class="ks-modal-body">${message}</div>
        <button type="button" class="ks-modal-btn" id="ks-modal-close-btn">Rendben, köszönöm</button>
      </div>
    `;

    const closeBtn = modalOverlay.querySelector('#ks-modal-close-btn');
    const closeModal = () => {
      modalOverlay.classList.remove('active');
      if (onClose) onClose();
    };

    closeBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  // Global helper to show simple GDPR modal if clicked
  window.openAdatkezelésiModal = function () {
    alert('ADATKEZELÉSI TÁJÉKOZTATÓ (KisSzabó Kft.)\n\nA megadott személyes adatokat kizárólag a munkaerő-toborzás és kiválasztás céljából kezeljük a GDPR előírásainak megfelelően. Az adatokat harmadik félnek nem adjuk át, és a jelentkezési folyamat lezárulását követően bizalmasan tároljuk vagy kérésre töröljük.');
  };

  // Auto-initialize when DOM is ready
  function initAllForms() {
    const containers = document.querySelectorAll('#kisszabo-job-form, .kisszabo-job-form');
    containers.forEach(container => {
      if (!container.dataset.initialized) {
        container.dataset.initialized = 'true';
        new KisszaboJobForm(container);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllForms);
  } else {
    initAllForms();
  }

})();
