(() => {
  'use strict';

  const root = document.querySelector('[data-folio-root]');
  const configNode = document.getElementById('folio-config');
  if (!root || !configNode) return;

  const config = JSON.parse(configNode.textContent);
  const schemaVersion = '1.0';
  const textKey = 'tas:year10-graphics:v1:folio:text';
  const imageKey = 'tas:year10-graphics:v1:folio:images';
  const legacyTextKeys = ['tas:year10-graphics:folio:text', 'tas:year10-graphics:v0:folio:text'];
  const legacyImageKeys = ['tas:year10-graphics:folio:images', 'tas:year10-graphics:v0:folio:images'];
  const compatibleLegacySchemas = new Set(['0.9', '0.9.0']);
  const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const maxImageBytes = 2.5 * 1024 * 1024;
  const cardIds = new Set(config.cards.map(card => card.id));

  const defaultTextState = () => ({
    schema_version: schemaVersion,
    course_id: config.course_id,
    student_name: '',
    class_group: '',
    cards: Object.fromEntries(config.cards.map(card => [card.id, { response: '', caption: '' }])),
    updated_at: null
  });

  const safeParse = (value, fallback) => {
    try { return JSON.parse(value); } catch { return fallback; }
  };

  function normaliseTextState(stored) {
    if (!stored || stored.course_id !== config.course_id) return null;
    const isCurrent = stored.schema_version === schemaVersion;
    const isCompatibleLegacy = compatibleLegacySchemas.has(stored.schema_version);
    if (!isCurrent && !isCompatibleLegacy) return null;
    const next = defaultTextState();
    next.student_name = typeof stored.student_name === 'string' ? stored.student_name : (typeof stored.studentName === 'string' ? stored.studentName : '');
    next.class_group = typeof stored.class_group === 'string' ? stored.class_group : (typeof stored.classGroup === 'string' ? stored.classGroup : '');
    next.updated_at = stored.updated_at || null;
    for (const id of cardIds) {
      const record = stored.cards?.[id];
      if (typeof record === 'string') next.cards[id] = { response: record, caption: '' };
      else if (record) next.cards[id] = {
          response: typeof record.response === 'string' ? record.response : '',
          caption: typeof record.caption === 'string' ? record.caption : ''
        };
    }
    return { state: next, migrated: !isCurrent };
  }

  function loadTextState() {
    const candidates = [[textKey, safeParse(localStorage.getItem(textKey), null)], ...legacyTextKeys.map(key => [key, safeParse(localStorage.getItem(key), null)])];
    for (const [key, stored] of candidates) {
      const loaded = normaliseTextState(stored);
      if (!loaded) continue;
      if (loaded.migrated || key !== textKey) localStorage.setItem(textKey, JSON.stringify(loaded.state));
      return loaded.state;
    }
    return defaultTextState();
  }

  function validImageRecord(image) {
    return Boolean(
      image &&
      allowedImageTypes.has(image.type) &&
      Number.isFinite(image.size) &&
      image.size >= 0 &&
      image.size <= maxImageBytes &&
      typeof image.name === 'string' &&
      typeof image.data_url === 'string' &&
      image.data_url.startsWith(`data:${image.type};base64,`)
    );
  }

  function loadImages() {
    const candidates = [[imageKey, safeParse(localStorage.getItem(imageKey), null)], ...legacyImageKeys.map(key => [key, safeParse(localStorage.getItem(key), null)])];
    const [loadedKey, stored] = candidates.find(([, value]) => value && typeof value === 'object') || [imageKey, {}];
    const clean = {};
    for (const id of cardIds) {
      const image = stored?.[id];
      if (validImageRecord(image)) clean[id] = image;
    }
    if (loadedKey !== imageKey && Object.keys(clean).length) localStorage.setItem(imageKey, JSON.stringify(clean));
    return clean;
  }

  let textState = loadTextState();
  let images = loadImages();
  let saveTimer = null;

  const statusNode = document.querySelector('[data-folio-save-status]');
  const progressNode = document.querySelector('[data-folio-progress]');
  const nextNode = document.querySelector('[data-folio-next]');
  const nameInput = document.querySelector('[data-folio-name]');
  const classInput = document.querySelector('[data-folio-class]');
  if (nameInput) nameInput.value = textState.student_name;
  if (classInput) classInput.value = textState.class_group;

  function announce(message) {
    if (statusNode) statusNode.textContent = message;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  function persistText() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    textState.updated_at = new Date().toISOString();
    localStorage.setItem(textKey, JSON.stringify(textState));
    announce(`Saved on this device at ${new Date(textState.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    updateProgress();
  }

  function scheduleSave() {
    announce('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistText, 350);
  }

  function persistImages() {
    try {
      localStorage.setItem(imageKey, JSON.stringify(images));
      announce('Image saved in this browser and included in backup/export.');
    } catch {
      announce('This image could not be stored. Try a smaller file or remove another imported image.');
      throw new Error('image-storage-quota');
    }
  }

  function isComplete(cardId) {
    const record = textState.cards[cardId];
    return Boolean(record?.response.trim() && record?.caption.trim());
  }

  function updateProgress() {
    const complete = config.cards.filter(card => isComplete(card.id)).length;
    if (progressNode) progressNode.textContent = `${complete} of ${config.cards.length} evidence cards ready`;
    const next = config.cards.find(card => !isComplete(card.id));
    if (nextNode) nextNode.innerHTML = next
      ? `Next useful action: <a href="#${escapeHtml(next.id)}">${escapeHtml(next.title)}</a>`
      : 'All evidence cards contain a response and caption. Review the quality of the evidence before exporting.';
    document.querySelectorAll('[data-card-status]').forEach(node => {
      const id = node.getAttribute('data-card-status');
      node.textContent = isComplete(id) ? 'Response and caption saved' : 'Continue when this evidence is available';
    });
  }

  function moduleLabel(moduleId) {
    const number = Number(moduleId.slice(1));
    return `Module ${number}`;
  }

  function renderCards() {
    root.innerHTML = config.cards.map(card => {
      const record = textState.cards[card.id];
      const image = images[card.id];
      return `
        <article class="folio-card" id="${escapeHtml(card.id)}" data-folio-card="${escapeHtml(card.id)}">
          <header class="folio-card__header">
            <p class="eyebrow">${escapeHtml(moduleLabel(card.module_id))} · Selected evidence</p>
            <h2>${escapeHtml(card.title)}</h2>
            <p class="folio-card__action"><strong>Do:</strong> ${escapeHtml(card.action)}</p>
            <p class="folio-card__why"><strong>Why:</strong> ${escapeHtml(card.why)}</p>
          </header>
          <div class="folio-card__body">
            <p><strong>Evidence to add:</strong> ${escapeHtml(card.evidence)}</p>
            <label for="${escapeHtml(card.id)}-response">${escapeHtml(card.prompt)}</label>
            <textarea id="${escapeHtml(card.id)}-response" data-folio-response="${escapeHtml(card.id)}" rows="7">${escapeHtml(record.response)}</textarea>
            <div class="folio-print-value" data-print-response="${escapeHtml(card.id)}">${escapeHtml(record.response)}</div>
            <details class="folio-support">
              <summary>Sentence support</summary>
              <ul>${card.sentence_starters.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </details>
            <div class="folio-image-control">
              <label for="${escapeHtml(card.id)}-image">Optional image evidence</label>
              <p class="field-help">PNG, JPG or WebP up to 2.5 MB. It stays in this browser unless you create a backup or evidence export.</p>
              <input id="${escapeHtml(card.id)}-image" type="file" accept="image/png,image/jpeg,image/webp" data-folio-image="${escapeHtml(card.id)}">
              <div class="folio-image-preview" data-image-preview="${escapeHtml(card.id)}">
                ${image ? `<img src="${image.data_url}" alt="Imported evidence preview for ${escapeHtml(card.title)}"><p>${escapeHtml(image.name)}</p><button type="button" class="button button--quiet" data-remove-image="${escapeHtml(card.id)}">Remove image</button>` : '<p>No image imported.</p>'}
              </div>
            </div>
            <label for="${escapeHtml(card.id)}-caption">${escapeHtml(card.caption_prompt)}</label>
            <textarea id="${escapeHtml(card.id)}-caption" data-folio-caption="${escapeHtml(card.id)}" rows="3">${escapeHtml(record.caption)}</textarea>
            <div class="folio-print-value" data-print-caption="${escapeHtml(card.id)}">${escapeHtml(record.caption)}</div>
            <p class="field-help">${escapeHtml(card.assessment_relationship)}</p>
            <p class="folio-card__status" data-card-status="${escapeHtml(card.id)}"></p>
          </div>
        </article>`;
    }).join('');
  }

  function updateImagePreview(cardId) {
    const node = document.querySelector(`[data-image-preview="${CSS.escape(cardId)}"]`);
    if (!node) return;
    const image = images[cardId];
    node.innerHTML = image
      ? `<img src="${image.data_url}" alt="Imported evidence preview"><p>${escapeHtml(image.name)}</p><button type="button" class="button button--quiet" data-remove-image="${escapeHtml(cardId)}">Remove image</button>`
      : '<p>No image imported.</p>';
  }

  function updatePrintMirror(cardId, field, value) {
    const node = document.querySelector(`[data-print-${field}="${CSS.escape(cardId)}"]`);
    if (node) node.textContent = value;
  }

  function download(filename, type, content) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function createBackup() {
    persistText();
    const backup = {
      backup_type: 'editable-folio-backup',
      schema_version: schemaVersion,
      course_id: config.course_id,
      created_at: new Date().toISOString(),
      text: textState,
      images
    };
    download(`year-10-graphics-folio-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', `${JSON.stringify(backup, null, 2)}\n`);
    announce('Editable backup downloaded, including imported images.');
  }

  function createEvidenceExport() {
    persistText();
    const sections = config.cards.map(card => {
      const record = textState.cards[card.id];
      const image = images[card.id];
      return `<section><p class="module">${escapeHtml(moduleLabel(card.module_id))}</p><h2>${escapeHtml(card.title)}</h2><p><strong>Task context:</strong> ${escapeHtml(card.action)}</p><p><strong>Thinking prompt:</strong> ${escapeHtml(card.prompt)}</p><div class="response">${escapeHtml(record.response).replace(/\n/g, '<br>') || '<em>No response saved.</em>'}</div>${image ? `<figure><img src="${image.data_url}" alt="Student-selected evidence"><figcaption>${escapeHtml(record.caption || 'No caption saved.')}</figcaption></figure>` : `<p><strong>Caption:</strong> ${escapeHtml(record.caption) || '<em>No image imported.</em>'}</p>`}</section>`;
    }).join('');
    const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Year 10 Graphics evidence export</title><style>body{font-family:Arial,sans-serif;color:#25171a;max-width:900px;margin:0 auto;padding:32px;line-height:1.5}header{border-bottom:4px solid #8b2433;margin-bottom:28px}section{break-inside:avoid;border-bottom:1px solid #d8c9cc;padding:20px 0}.module{color:#8b2433;font-weight:700;text-transform:uppercase;font-size:12px}h1,h2{color:#3b1118}.response{white-space:normal;background:#fbf3f5;padding:16px;border-left:4px solid #8b2433}img{max-width:100%;max-height:520px;object-fit:contain}figcaption{font-style:italic;margin-top:8px}@media print{body{padding:0}section{page-break-inside:avoid}}</style></head><body><header><h1>Year 10 Graphics evidence export</h1><p><strong>Student:</strong> ${escapeHtml(textState.student_name || 'Not entered')} · <strong>Class:</strong> ${escapeHtml(textState.class_group || 'Not entered')}</p><p>Created ${escapeHtml(new Date().toLocaleString('en-AU'))}. This export contains locally selected evidence; it is not proof of submission or teacher verification.</p></header>${sections}</body></html>`;
    download(`year-10-graphics-evidence-${new Date().toISOString().slice(0, 10)}.html`, 'text/html', html);
    announce('Self-contained evidence export downloaded.');
  }

  async function restoreBackup(file) {
    if (!file || file.size > 30 * 1024 * 1024) throw new Error('Choose a Year 10 Graphics folio backup smaller than 30 MB.');
    const backup = safeParse(await file.text(), null);
    if (!backup || backup.backup_type !== 'editable-folio-backup' || backup.course_id !== config.course_id || backup.schema_version !== schemaVersion) {
      throw new Error('This is not a compatible Year 10 Graphics folio backup.');
    }
    const restoredText = backup.text;
    if (!restoredText || restoredText.course_id !== config.course_id || restoredText.schema_version !== schemaVersion) throw new Error('The backup text record is not compatible.');
    const restoredState = defaultTextState();
    restoredState.student_name = typeof restoredText.student_name === 'string' ? restoredText.student_name : '';
    restoredState.class_group = typeof restoredText.class_group === 'string' ? restoredText.class_group : '';
    for (const id of cardIds) {
      const record = restoredText.cards?.[id];
      if (record) restoredState.cards[id] = {
        response: typeof record.response === 'string' ? record.response : '',
        caption: typeof record.caption === 'string' ? record.caption : ''
      };
    }
    const restoredImages = {};
    for (const id of cardIds) {
      const image = backup.images?.[id];
      if (image && !validImageRecord(image)) throw new Error(`The backup contains an invalid image record for ${id}.`);
      if (image) restoredImages[id] = image;
    }
    textState = restoredState;
    images = restoredImages;
    persistText();
    persistImages();
    if (nameInput) nameInput.value = textState.student_name;
    if (classInput) classInput.value = textState.class_group;
    renderCards();
    bindCardEvents();
    updateProgress();
    announce('Backup restored on this device. Review the evidence before continuing.');
  }

  function bindCardEvents() {
    root.querySelectorAll('[data-folio-response]').forEach(input => input.addEventListener('input', event => {
      textState.cards[event.currentTarget.dataset.folioResponse].response = event.currentTarget.value;
      updatePrintMirror(event.currentTarget.dataset.folioResponse, 'response', event.currentTarget.value);
      scheduleSave();
    }));
    root.querySelectorAll('[data-folio-caption]').forEach(input => input.addEventListener('input', event => {
      textState.cards[event.currentTarget.dataset.folioCaption].caption = event.currentTarget.value;
      updatePrintMirror(event.currentTarget.dataset.folioCaption, 'caption', event.currentTarget.value);
      scheduleSave();
    }));
    root.querySelectorAll('[data-folio-image]').forEach(input => input.addEventListener('change', event => {
      const cardId = event.currentTarget.dataset.folioImage;
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      if (!allowedImageTypes.has(file.type)) { announce('Use a PNG, JPG or WebP image.'); event.currentTarget.value = ''; return; }
      if (file.size > maxImageBytes) { announce('That image is larger than 2.5 MB. Resize it before importing.'); event.currentTarget.value = ''; return; }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        if (typeof reader.result !== 'string' || !reader.result.startsWith(`data:${file.type};base64,`)) {
          announce('That image could not be read as a valid PNG, JPG or WebP file.');
          event.currentTarget.value = '';
          return;
        }
        const previous = images[cardId];
        images[cardId] = { name: file.name, type: file.type, size: file.size, data_url: reader.result };
        try { persistImages(); updateImagePreview(cardId); } catch { if (previous) images[cardId] = previous; else delete images[cardId]; }
      });
      reader.readAsDataURL(file);
    }));
    if (!root.dataset.removeImageHandlerBound) {
      root.dataset.removeImageHandlerBound = 'true';
      root.addEventListener('click', event => {
        const button = event.target.closest('[data-remove-image]');
        if (!button) return;
        delete images[button.dataset.removeImage];
        persistImages();
        updateImagePreview(button.dataset.removeImage);
        announce('The browser-local image was removed from this card.');
      });
    }
  }

  renderCards();
  bindCardEvents();
  updateProgress();
  window.dispatchEvent(new Event('hashchange'));
  if (textState.updated_at) announce(`Restored work saved ${new Date(textState.updated_at).toLocaleString('en-AU')}.`);

  nameInput?.addEventListener('input', event => { textState.student_name = event.currentTarget.value; scheduleSave(); });
  classInput?.addEventListener('input', event => { textState.class_group = event.currentTarget.value; scheduleSave(); });
  document.querySelector('[data-folio-backup]')?.addEventListener('click', createBackup);
  document.querySelector('[data-folio-export]')?.addEventListener('click', createEvidenceExport);
  document.querySelector('[data-folio-print]')?.addEventListener('click', () => window.print());
  const restoreInput = document.querySelector('[data-folio-restore-input]');
  document.querySelector('[data-folio-restore]')?.addEventListener('click', () => restoreInput?.click());
  restoreInput?.addEventListener('change', async event => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    try { await restoreBackup(file); } catch (error) { announce(error.message || 'The backup could not be restored.'); }
    input.value = '';
  });
  document.querySelector('[data-folio-reset]')?.addEventListener('click', () => {
    if (!window.confirm('Reset this Year 10 Graphics folio on this device? Download a backup first if you may need the work again.')) return;
    localStorage.removeItem(textKey);
    localStorage.removeItem(imageKey);
    legacyTextKeys.forEach(key => localStorage.removeItem(key));
    legacyImageKeys.forEach(key => localStorage.removeItem(key));
    textState = defaultTextState();
    images = {};
    if (nameInput) nameInput.value = '';
    if (classInput) classInput.value = '';
    renderCards();
    bindCardEvents();
    updateProgress();
    announce('This device’s folio record has been reset.');
  });
  window.addEventListener('beforeprint', persistText);
  window.addEventListener('beforeunload', () => { if (saveTimer) { clearTimeout(saveTimer); persistText(); } });
})();
