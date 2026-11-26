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

  // "Have I submitted before?" Needs email AND date of birth, so an email alone reveals nothing.
  const stResult = document.getElementById('st-result');
  document.getElementById('st-check').addEventListener('click', async () => {
    const email = document.getElementById('st-email').value.trim();
    const dob = document.getElementById('st-dob').value;
    const endpoint = window.MFM_CONFIG && window.MFM_CONFIG.scriptUrl;
    if (!email || !dob) { stResult.textContent = 'Please enter both your email and date of birth.'; return; }
    if (!endpoint) { stResult.textContent = 'Online forms are not connected yet.'; return; }
    stResult.textContent = 'Checking…';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type: 'intakeStatus', email: email, dob: dob }),
      });
      const r = await res.json();
      if (!r.ok) throw new Error(r.error);
      stResult.textContent = r.found
        ? 'Yes. Your forms were last submitted on ' + r.last + '. If nothing has changed, you\'re all set. Otherwise, fill them out again below.'
        : 'I don\'t see forms for that email and date of birth. Please fill them out below.';
    } catch (err) {
      stResult.textContent = 'Couldn\'t check right now. If you\'re not sure, it\'s always fine to fill them out again.';
    }
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
      // text/plain avoids a CORS preflight; the script parses the JSON body and replies with {ok, error}.
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(collect()),
      });
      let result;
      try {
        result = await res.json();
      } catch (parseErr) {
        throw new Error('The form service sent an unexpected reply (HTTP ' + res.status + ').');
      }
      if (!result.ok) throw new Error('The form service reported: ' + (result.error || 'unknown error') + '.');
      form.reset();
      form.classList.add('hidden');
      document.querySelector('.intro-card').classList.add('hidden');
      document.getElementById('done').classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      // Show the specific reason so problems can be diagnosed. Network failures surface as a TypeError.
      const detail = err instanceof TypeError ? 'Couldn\'t reach the form service.' : err.message;
      errorEl.textContent = 'Your forms were not saved. ' + detail + ' Please try again, or email loki.for.motion@gmail.com.';
      console.error('Intake submit failed:', err);
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit forms';
    }
  });

  show(0);
})();
