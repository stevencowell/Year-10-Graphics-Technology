(() => {
  'use strict';
  const data = window.Year10GraphicsData;
  if (!data) return;

  const blankPackage = () => ({ answers: {}, checked: {}, long_response: '', saved_at: null });
  const read = (key, fallback) => {
    try { return { ...fallback(), ...JSON.parse(localStorage.getItem(key) || '{}') }; }
    catch { return fallback(); }
  };
  const save = (key, state) => {
    state.saved_at = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(state));
  };
  const download = (name, payload) => {
    const blob = new Blob([payload], {type: 'application/json'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  const initialiseVideoPlayers = () => {
    const launches = [...document.querySelectorAll('[data-video-launch]')];
    if (!launches.length) return;

    const closePlayer = (frame, restoreFocus = true) => {
      const launch = frame.querySelector('[data-video-launch]');
      frame.querySelector('iframe')?.remove();
      frame.querySelector('[data-video-close]')?.remove();
      frame.removeAttribute('data-player-open');
      if (launch) {
        launch.hidden = false;
        if (restoreFocus) launch.focus();
      }
    };

    launches.forEach(launch => {
      launch.addEventListener('click', () => {
        const frame = launch.closest('[data-video-frame]');
        const videoId = String(launch.dataset.videoId || '');
        if (!frame || !/^[A-Za-z0-9_-]{11}$/.test(videoId) || frame.querySelector('iframe')) return;

        document.querySelectorAll('[data-video-frame][data-player-open]').forEach(otherFrame => {
          if (otherFrame !== frame) closePlayer(otherFrame, false);
        });

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'video-close';
        close.dataset.videoClose = '';
        close.textContent = 'Close video player';
        close.addEventListener('click', () => closePlayer(frame));

        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
        iframe.title = launch.dataset.videoTitle || 'Official Onshape tutorial';
        iframe.loading = 'eager';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.setAttribute('allow', 'encrypted-media; picture-in-picture; web-share');
        iframe.setAttribute('allowfullscreen', '');

        launch.hidden = true;
        frame.dataset.playerOpen = '';
        frame.append(close, iframe);
        close.focus();
      });
    });

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const active = document.querySelector('[data-video-frame][data-player-open]');
      if (!active) return;
      event.preventDefault();
      closePlayer(active);
    });
  };

  initialiseVideoPlayers();

  const packageProgress = (sectionId, state) => {
    const model = data.packages[sectionId];
    const checked = model.questions.filter(q => state.checked[q.question_id]).length;
    const capstone = state.long_response.trim().length > 0;
    return {
      checked,
      total: model.questions.length,
      capstone,
      complete: checked === model.questions.length && capstone,
      label: checked === model.questions.length && capstone
        ? `Complete: ${checked}/${model.questions.length} questions checked and capstone saved`
        : `${checked}/${model.questions.length} questions checked; capstone ${capstone ? 'saved' : 'not started'}`
    };
  };
  const updateModuleProgress = () => {
    for (const module of data.modules) {
      const node = document.querySelector(`[data-module-progress="${module.id}"]`);
      if (!node) continue;
      const complete = module.section_ids.filter(id => {
        const pack = document.querySelector(`.learning-package[data-section-id="${id}"]`);
        if (!pack) return false;
        return packageProgress(id, read(pack.dataset.storageKey, blankPackage)).complete;
      }).length;
      node.textContent = complete === 3 ? '3 of 3 sections complete' : complete ? `${complete} of 3 sections complete` : 'Not started';
    }
  };
  const updateReview = (sectionId, state) => {
    const progress = packageProgress(sectionId, state);
    document.querySelectorAll(`[data-review-status="${sectionId}"]`).forEach(node => { node.textContent = progress.label; });
    document.querySelectorAll(`.learning-package[data-section-id="${sectionId}"] [data-package-summary]`).forEach(node => { node.textContent = progress.label; });
    updateModuleProgress();
    return progress;
  };

  for (const node of document.querySelectorAll('.learning-package')) {
    const sectionId = node.dataset.sectionId;
    const key = node.dataset.storageKey;
    const model = data.packages[sectionId];
    if (!model) continue;
    let state = read(key, blankPackage);
    const status = node.querySelector('[data-save-status]');
    const setStatus = prefix => {
      const progress = updateReview(sectionId, state);
      status.textContent = `${prefix} — ${progress.label}. Browser-local only; not submitted.`;
    };
    const paintQuestion = (question, announce = false) => {
      const fieldset = node.querySelector(`[data-question-id="${question.question_id}"]`);
      const feedback = fieldset.querySelector('[data-question-feedback]');
      const selected = fieldset.querySelector('input[type="radio"]:checked');
      if (!state.checked[question.question_id]) {
        feedback.textContent = '';
        feedback.removeAttribute('data-correct');
        return;
      }
      if (!selected) {
        feedback.textContent = 'Choose one response before checking.';
        feedback.dataset.correct = 'false';
        return;
      }
      const option = question.options.find(item => item.option_id === selected.value);
      feedback.textContent = option.feedback;
      feedback.dataset.correct = String(selected.value === question.correct_option_id);
      if (announce) feedback.focus?.();
    };
    for (const question of model.questions) {
      const fieldset = node.querySelector(`[data-question-id="${question.question_id}"]`);
      const saved = state.answers[question.question_id];
      if (saved) fieldset.querySelector(`input[value="${CSS.escape(saved)}"]`)?.setAttribute('checked', '');
      fieldset.querySelectorAll('input[type="radio"]').forEach(input => input.addEventListener('change', () => {
        state.answers[question.question_id] = input.value;
        state.checked[question.question_id] = false;
        save(key, state); paintQuestion(question); setStatus('Saved; check the revised response when ready');
      }));
      fieldset.querySelector('[data-check-question]')?.addEventListener('click', () => {
        const selected = fieldset.querySelector('input[type="radio"]:checked');
        state.checked[question.question_id] = Boolean(selected);
        if (selected) state.answers[question.question_id] = selected.value;
        save(key, state); paintQuestion(question, true); setStatus(selected ? 'Checked and saved' : 'Response needed');
      });
      paintQuestion(question);
    }
    const response = node.querySelector('[data-long-response]');
    response.value = state.long_response || '';
    response.addEventListener('input', () => {
      state.long_response = response.value;
      save(key, state); setStatus('Autosaved');
    });
    node.querySelector('[data-reset-package]')?.addEventListener('click', () => {
      if (!confirm(`Reset only the ${sectionId.toUpperCase()} formative learning package on this device?`)) return;
      localStorage.removeItem(key); state = blankPackage();
      node.querySelectorAll('input[type="radio"]').forEach(input => { input.checked = false; });
      node.querySelectorAll('[data-question-feedback]').forEach(item => { item.textContent = ''; item.removeAttribute('data-correct'); });
      response.value = ''; setStatus('Reset');
    });
    node.querySelector('[data-export-package]')?.addEventListener('click', () => {
      const payload = {schema_version:'1.0', label:'Formative learning evidence', section_id:sectionId, formal_submission:false, exported_at:new Date().toISOString(), ...state};
      download(`${sectionId}-formative-learning-evidence.json`, `${JSON.stringify(payload,null,2)}\n`);
    });
    node.querySelector('[data-print-package]')?.addEventListener('click', () => {
      document.body.dataset.printPackage = sectionId;
      window.print();
      delete document.body.dataset.printPackage;
    });
    setStatus(state.saved_at ? 'Restored' : 'Not started');
  }

  const blankPractice = () => ({responses:{}, checked:false, checked_at:null, saved_at:null});
  const controlKey = control => control.name || control.id;
  const readControl = control => control.type === 'checkbox' ? control.checked : control.value;
  const restoreControl = (control, value) => {
    if (control.type === 'checkbox') control.checked = Boolean(value);
    else if (control.type === 'radio') control.checked = control.value === value;
    else control.value = value ?? '';
  };
  const allEvaluationRows = card => [
    ...card.querySelectorAll('[data-checkable]'),
    ...card.querySelectorAll('[data-choice-group]'),
    ...card.querySelectorAll('[data-checkbox-row]')
  ];
  const evaluateRow = row => {
    let actual=''; let feedbackNode=row.querySelector?.('[data-inline-feedback]'); let feedback=row.dataset.feedback || '';
    if (row.matches('[data-checkable]')) {
      actual=String(row.value);
      feedbackNode=row.closest('.practice-row, fieldset, label')?.querySelector('[data-inline-feedback]') || feedbackNode;
      feedback=row.dataset.feedback || feedback;
    } else if (row.matches('[data-choice-group]')) {
      actual=String(row.querySelector('input[type="radio"]:checked')?.value || '');
    } else if (row.matches('[data-checkbox-row]')) {
      actual=String(Boolean(row.querySelector('input[type="checkbox"]')?.checked));
    }
    const answered=actual!=='';
    const correct=answered && actual===String(row.dataset.expected);
    if (feedbackNode) {
      feedbackNode.textContent = answered ? (feedback || (correct ? 'Correct — keep the evidence link.' : 'Revisit the concept and retry.')) : 'Choose a response before checking.';
      feedbackNode.dataset.correct=String(correct);
    }
    return {answered,correct};
  };
  const activityStatus = (card,state) => {
    const rows=allEvaluationRows(card);
    const authentic=[...card.querySelectorAll('[data-authentic]')];
    const hasAny=Object.values(state.responses).some(value => value === true || String(value ?? '').trim());
    const authenticComplete=!authentic.length || authentic.every(control => String(readControl(control) ?? '').trim());
    const complete=state.checked && authenticComplete;
    return {complete,label:complete?'Practice complete':hasAny?'In progress':'Not started',rows,authentic};
  };
  for (const card of document.querySelectorAll('[data-practice-card]')) {
    const key=card.dataset.storageKey;
    let state=read(key,blankPractice);
    const controls=[...card.querySelectorAll('[data-practice-input]')];
    for (const control of controls) {
      const saved=state.responses[controlKey(control)];
      if (control.type==='radio') {
        if (saved !== undefined) restoreControl(control,saved);
      } else if (saved !== undefined) restoreControl(control,saved);
      control.addEventListener('input', () => {
        if (control.type==='radio') state.responses[controlKey(control)]=control.value;
        else state.responses[controlKey(control)]=readControl(control);
        state.checked=false;
        save(key,state); updateStatus('Saved');
      });
    }
    const status=card.querySelector('[data-practice-status]');
    const updateStatus=prefix => {
      const value=activityStatus(card,state);
      status.textContent=`${prefix}: ${value.label}. Browser-local formative practice; not submitted.`;
      status.dataset.complete=String(value.complete);
    };
    card.querySelector('[data-check-practice]')?.addEventListener('click', () => {
      const results=allEvaluationRows(card).map(evaluateRow);
      const allAnswered=results.every(result=>result.answered);
      state.checked=allAnswered;
      state.checked_at=allAnswered?new Date().toISOString():null;
      for (const control of controls) state.responses[controlKey(control)]=readControl(control);
      save(key,state);
      const correct=results.filter(result=>result.correct).length;
      const prefix=allAnswered?`Checked ${correct}/${results.length}; retry remains available`:'Some checkable responses still need an answer';
      updateStatus(prefix);
      status.focus?.();
    });
    card.querySelector('[data-reset-practice]')?.addEventListener('click', () => {
      const label=card.dataset.recordKind==='puzzle'?'puzzle':'activity';
      if (!confirm(`Reset only this ${label}: ${card.dataset.recordId}?`)) return;
      localStorage.removeItem(key); state=blankPractice();
      controls.forEach(control => { if (control.type==='checkbox'||control.type==='radio') control.checked=false; else control.value=''; });
      card.querySelectorAll('[data-inline-feedback]').forEach(node=>{node.textContent='';node.removeAttribute('data-correct');});
      updateStatus('Reset');
    });
    updateStatus(state.saved_at?'Restored':'Ready');
  }

  for (const link of document.querySelectorAll('[data-review-link]')) {
    link.addEventListener('click', () => {
      const target=document.querySelector(link.getAttribute('href'));
      if (target instanceof HTMLDetailsElement) {
        target.open=true;
        requestAnimationFrame(()=>target.querySelector('summary')?.focus());
      }
    });
  }
})();
