(() => {
  'use strict';

  const config = Object.freeze({
    courseId: 'year-10-graphics-technology',
    storageNamespace: 'tas:year10-graphics:v1',
    moduleIds: Object.freeze(['m01', 'm02', 'm03', 'm04']),
    sectionIds: Object.freeze([
      'm01s01', 'm01s02', 'm01s03',
      'm02s01', 'm02s02', 'm02s03',
      'm03s01', 'm03s02', 'm03s03',
      'm04s01', 'm04s02', 'm04s03'
    ])
  });

  const storageKey = (...parts) => [config.storageNamespace, ...parts].join(':');

  window.Year10GraphicsFoundation = Object.freeze({
    config,
    storageKey,
    sectionStorageKey: sectionId => storageKey('section', sectionId),
    activityStorageKey: sectionId => storageKey('activity', sectionId),
    folioStorageKey: record => storageKey('folio', record)
  });

  document.querySelectorAll('[data-year]').forEach(node => {
    node.textContent = String(new Date().getFullYear());
  });

  const openFragmentTarget = () => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    const drawer = target.matches('details') ? target : target.closest('details');
    if (drawer) drawer.open = true;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start' });
      const focusTarget = target.matches('details') ? target.querySelector('summary') : target;
      if (focusTarget && !focusTarget.matches('a, button, input, textarea, summary')) {
        focusTarget.tabIndex = -1;
      }
      focusTarget?.focus({ preventScroll: true });
    });
  };

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    const drawer = target?.matches('details') ? target : target?.closest('details');
    if (drawer) drawer.open = true;
  });

  openFragmentTarget();
  window.addEventListener('hashchange', openFragmentTarget);
})();
