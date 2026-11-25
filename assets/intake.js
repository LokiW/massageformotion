// Intake form: step navigation, validation, paper opt-out, and submission.
// Nothing is saved in the browser (no localStorage), so health info never lingers on a shared device.
(function () {
  const form = document.getElementById('intake');
  const steps = Array.from(form.querySelectorAll('.step'));
  const progress = Array.from(document.querySelectorAll('#progress li'));
  const paperNote = document.getElementById('paper-note');
  const consentSig = document.getElementById('consent-signature');
  const firstNext = steps[0].querySelector('[data-next]');
  const errorEl = document.getElementById('submit-error');
  const submitBtn = document.getElementById('submit-btn');
  let current = 0;

  // Default every date field to today, and carry the client's name forward between signatures.
  const today = new Date();
  const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  ['consentDate', 'treatDate', 'prefDate'].forEach(n => { form.elements[n].value = iso; });
  form.elements.consentName.addEventListener('change', e => {
    ['treatName', 'name', 'prefName'].forEach(n => { if (!form.elements[n].value) form.elements[n].value = e.target.value; });
  });

  function show(i) {
    steps.forEach((s, j) => s.classList.toggle('hidden', j !== i));
    progress.forEach((p, j) => {
      p.classList.toggle('active', j === i);
      p.classList.toggle('done', j < i);
    });
    current = i;
    steps[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
    const focusable = steps[i].querySelector('input, select, textarea');
    if (focusable) focusable.focus({ preventScroll: true });
  }

  // Validate only the fields in the visible step; report the first problem.
  function stepValid(step) {
    const fields = Array.from(step.querySelectorAll('input, select, textarea'))
      .filter(f => !f.closest('.hidden') && f.name !== 'website');
    for (const f of fields) {
      if (!f.checkValidity()) {
        f.reportValidity();
        return false;
      }
    }
    return true;
  }

  form.addEventListener('click', e => {
    if (e.target.matches('[data-next]')) {
      if (stepValid(steps[current])) show(current + 1);
    } else if (e.target.matches('[data-back]')) {
      show(current - 1);
    }
  });

  // Paper opt-out: hide the signature and stop. Nothing is sent.
  form.querySelectorAll('input[name="dataConsent"]').forEach(r => r.addEventListener('change', () => {
    const paper = form.elements.dataConsent.value === 'paper';
    paperNote.classList.toggle('hidden', !paper);
    consentSig.classList.toggle('hidden', paper);
    firstNext.classList.toggle('hidden', paper);
  }));

  // Show pregnancy / postpartum / lactation questions only when relevant.
  form.querySelectorAll('[data-toggle]').forEach(cb => {
    const target = document.getElementById(cb.dataset.toggle);
    cb.addEventListener('change', () => target.classList.toggle('hidden', !cb.checked));
  });

  document.getElementById('print-link').addEventListener('click', e => {
    e.preventDefault();
    window.print();
  });

  function collect() {
    const data = {};
    for (const [k, v] of new FormData(form)) {
      if (k === 'website') continue;
      data[k] = data[k] ? data[k] + '; ' + v : v;
    }
    data.type = 'intake';
    data.submittedAt = new Date().toISOString();
    data.formVersion = '2026-11-25';
    return data;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errorEl.classList.add('hidden');
    if (!stepValid(steps[current])) return;
    if (form.elements.dataConsent.value !== 'electronic') return;
    if (form.elements.website.value) return; // bot

    const endpoint = window.MFM_CONFIG && window.MFM_CONFIG.scriptUrl;
    if (!endpoint) {
      errorEl.textContent = 'Online forms are not connected yet. Please email loki.for.motion@gmail.com and I\'ll bring paper forms.';
      errorEl.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    try {
      // Google Apps Script web apps don't send CORS headers, so the response is opaque.
      // text/plain avoids a preflight request; the script parses the JSON body.
      await fetch(endpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(collect()),
      });
      form.reset();
      form.classList.add('hidden');
      document.querySelector('.intro-card').classList.add('hidden');
      document.getElementById('done').classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      errorEl.textContent = 'Something went wrong sending your forms. Please check your connection and try again, or email loki.for.motion@gmail.com.';
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit forms';
    }
  });

  show(0);
})();
