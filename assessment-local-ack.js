(() => {
  const root = document.querySelector('[data-assessment-notification]');
  if (!root) return;

  const notificationId = root.dataset.notificationId;
  const version = root.dataset.notificationVersion;
  const key = `y10graphics:assessment:ack:${notificationId}:${version}`;
  const checkbox = document.querySelector('[data-ack-checkbox]');
  const saveButton = document.querySelector('[data-ack-save]');
  const clearButton = document.querySelector('[data-ack-clear]');
  const status = document.querySelector('[data-ack-status]');

  if (!checkbox || !saveButton || !clearButton || !status) return;

  const showStatus = (message) => {
    status.textContent = message;
  };

  const load = () => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        checkbox.checked = false;
        saveButton.disabled = true;
        clearButton.disabled = true;
        showStatus('No acknowledgement is saved in this browser for this notification version.');
        return;
      }
      const saved = JSON.parse(raw);
      if (saved.version !== version || typeof saved.localTimestamp !== 'string') {
        localStorage.removeItem(key);
        load();
        return;
      }
      checkbox.checked = true;
      saveButton.disabled = true;
      clearButton.disabled = false;
      const readable = new Date(saved.localTimestamp).toLocaleString('en-AU');
      showStatus(`Saved in this browser for version ${saved.version} at ${readable}.`);
    } catch (error) {
      showStatus('Browser-local storage is unavailable. No acknowledgement was saved.');
      saveButton.disabled = true;
      clearButton.disabled = true;
    }
  };

  checkbox.addEventListener('change', () => {
    saveButton.disabled = !checkbox.checked;
  });

  saveButton.addEventListener('click', () => {
    if (!checkbox.checked) return;
    try {
      const record = {
        version,
        localTimestamp: new Date().toISOString()
      };
      localStorage.setItem(key, JSON.stringify(record));
      load();
    } catch (error) {
      showStatus('Browser-local storage is unavailable. No acknowledgement was saved.');
    }
  });

  clearButton.addEventListener('click', () => {
    try {
      localStorage.removeItem(key);
      load();
    } catch (error) {
      showStatus('Browser-local storage is unavailable. Nothing was changed.');
    }
  });

  load();
})();
