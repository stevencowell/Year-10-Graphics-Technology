(() => {
  'use strict';

  const data = window.Year10GraphicsData;
  const model = data?.progress;
  if (!data || !model) return;

  const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const parseRecord = key => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return isRecord(value) ? value : {};
    } catch {
      return {};
    }
  };
  const hasText = value => typeof value === 'string' && value.trim().length > 0;

  const packageResult = item => {
    const packageModel = data.packages[item.section_id];
    const state = parseRecord(item.storage_key);
    const checked = packageModel.questions.filter(question => state.checked?.[question.question_id] === true);
    const capstoneComplete = hasText(state.long_response);
    const firstUnchecked = packageModel.questions.find(question => state.checked?.[question.question_id] !== true);
    const started = checked.length > 0 || capstoneComplete || Object.keys(isRecord(state.answers) ? state.answers : {}).length > 0;
    const focusTarget = firstUnchecked?.question_id || packageModel.long_response.response_id;
    return {
      kind: item.kind,
      complete: checked.length === packageModel.questions.length && capstoneComplete,
      checked: checked.length,
      capstoneComplete,
      href: `${item.module_route}#${started ? focusTarget : item.package_id}`,
      focusTarget: started ? focusTarget : item.package_id,
      label: started
        ? `Continue Module ${item.module_number}: ${item.title}`
        : `Start Module ${item.module_number}: ${item.title}`
    };
  };

  const practiceResult = item => {
    const state = parseRecord(item.storage_key);
    const responses = isRecord(state.responses) ? state.responses : {};
    const complete = state.checked === true && item.required_response_keys.every(key => hasText(responses[key]));
    return {
      kind: item.kind,
      complete,
      href: item.route,
      focusTarget: item.focus_target,
      label: item.kind === 'activity'
        ? `Continue activity: ${item.title}`
        : `Review puzzle: ${item.title}`
    };
  };

  const folioTextState = () => {
    const state = parseRecord(model.folio_storage_key);
    return state.course_id === model.course_id && isRecord(state.cards) ? state : { cards: {} };
  };
  const folioResult = (item, state) => {
    const record = isRecord(state.cards[item.card_id]) ? state.cards[item.card_id] : {};
    return {
      kind: item.kind,
      complete: hasText(record.response) && hasText(record.caption),
      href: item.route,
      focusTarget: item.focus_target,
      label: `Continue folio: ${item.title}`
    };
  };

  const takeSnapshot = () => {
    const folioState = folioTextState();
    const totals = { checked_mcqs: 0, capstones: 0, activities: 0, folio_cards: 0, optional_puzzles: 0 };
    let next = null;

    for (const item of model.required_sequence) {
      let result;
      if (item.kind === 'package') {
        result = packageResult(item);
        totals.checked_mcqs += result.checked;
        totals.capstones += Number(result.capstoneComplete);
      } else if (item.kind === 'activity') {
        result = practiceResult(item);
        totals.activities += Number(result.complete);
      } else {
        result = folioResult(item, folioState);
        totals.folio_cards += Number(result.complete);
      }
      if (!next && !result.complete) next = result;
    }

    for (const item of model.optional_puzzles) {
      totals.optional_puzzles += Number(practiceResult(item).complete);
    }

    const completed = totals.checked_mcqs + totals.capstones + totals.activities + totals.folio_cards;
    const percentage = Math.round((completed / model.required_action_total) * 100);
    return {
      totals,
      completed,
      percentage,
      next: next || {
        kind: 'review',
        complete: false,
        href: model.completion_review.route,
        focusTarget: model.completion_review.focus_target,
        label: model.completion_review.label
      }
    };
  };

  const progressRoot = document.querySelector('[data-course-progress]');
  const update = () => {
    const snapshot = takeSnapshot();
    if (!progressRoot) return snapshot;

    const summary = progressRoot.querySelector('[data-course-progress-summary]');
    const bar = progressRoot.querySelector('[data-course-progress-bar]');
    const resume = progressRoot.querySelector('[data-course-resume]');
    const optionalPuzzles = progressRoot.querySelector('[data-optional-puzzle-status]');
    const values = {
      checked_mcqs: progressRoot.querySelector('[data-progress-value="checked-mcqs"]'),
      capstones: progressRoot.querySelector('[data-progress-value="capstones"]'),
      activities: progressRoot.querySelector('[data-progress-value="activities"]'),
      folio_cards: progressRoot.querySelector('[data-progress-value="folio-cards"]')
    };

    progressRoot.dataset.courseComplete = String(snapshot.completed === model.required_action_total);
    if (summary) summary.textContent = `${snapshot.completed} of ${model.required_action_total} required learning actions complete · ${snapshot.percentage}%`;
    if (bar) {
      bar.value = snapshot.completed;
      bar.max = model.required_action_total;
      bar.textContent = `${snapshot.percentage}%`;
      bar.setAttribute('aria-valuetext', `${snapshot.completed} of ${model.required_action_total} required learning actions complete, ${snapshot.percentage} per cent`);
    }
    values.checked_mcqs.textContent = `${snapshot.totals.checked_mcqs} / ${model.domain_totals.checked_mcqs}`;
    values.capstones.textContent = `${snapshot.totals.capstones} / ${model.domain_totals.capstones}`;
    values.activities.textContent = `${snapshot.totals.activities} / ${model.domain_totals.activities}`;
    values.folio_cards.textContent = `${snapshot.totals.folio_cards} / ${model.domain_totals.folio_cards}`;
    if (optionalPuzzles) optionalPuzzles.textContent = `${snapshot.totals.optional_puzzles} of ${model.optional_puzzles.length} optional review puzzles complete`;
    if (resume) {
      resume.textContent = snapshot.next.label;
      resume.href = snapshot.next.href;
      resume.dataset.courseResumeTarget = snapshot.next.focusTarget;
    }
    return snapshot;
  };

  const focusFragmentTarget = () => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    const drawer = target.matches('details') ? target : target.closest('details');
    if (drawer) drawer.open = true;
    window.requestAnimationFrame(() => {
      const focusTarget = target.matches('details') ? target.querySelector('summary') : target;
      if (focusTarget && !focusTarget.matches('a, button, input, textarea, select, summary')) focusTarget.tabIndex = -1;
      focusTarget?.focus({ preventScroll: true });
      focusTarget?.scrollIntoView({ block: 'start' });
    });
  };

  const relevantStorageKey = key => key === null || key === model.folio_storage_key || key.startsWith(`${model.storage_namespace}:section:`) || key.startsWith(`${model.storage_namespace}:activity:`) || key.startsWith(`${model.storage_namespace}:puzzle:`);
  window.addEventListener('storage', event => { if (relevantStorageKey(event.key)) update(); });
  window.addEventListener('pageshow', () => { update(); focusFragmentTarget(); });
  window.addEventListener('focus', update);
  window.addEventListener('hashchange', focusFragmentTarget);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  document.addEventListener('year10graphics:progresschange', update);

  window.Year10GraphicsCourseProgress = Object.freeze({ refresh: update, snapshot: takeSnapshot });
  update();
  focusFragmentTarget();
})();
