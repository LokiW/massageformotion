// Booking page. Talks to the Apps Script web app (see apps-script/Booking.gs).
// Prices here are only a preview: the script recalculates them when booking.
(function () {
  const API = window.MFM_CONFIG && window.MFM_CONFIG.scriptUrl;
  const EMAIL = 'loki.for.motion@gmail.com';

  // Keep in sync with BOOKING in apps-script/Booking.gs.
  const LOCATIONS = [
    { id: 'seattle', name: 'Seattle' },
    { id: 'quilcene', name: 'Quilcene', localDiscount: 10 },
    { id: 'port-townsend', name: 'Port Townsend' },
    { id: 'poulsbo', name: 'Poulsbo' },
    { id: 'sequim', name: 'Sequim' },
  ];
  const PRICES = { 60: 140, 90: 160 };
  const HOUSEHOLD = 20, TABLE = 70, MAX_PEOPLE = 3;

  const form = document.getElementById('booking');
  const locBox = document.getElementById('locations');
  const peopleBox = document.getElementById('people');
  const addBtn = document.getElementById('add-person');
  const ownTable = document.getElementById('own-table');
  const summary = document.getElementById('price-summary');
  const slotsBox = document.getElementById('slots');
  const errorEl = document.getElementById('book-error');
  const bookBtn = document.getElementById('book-btn');

  const state = { location: null, people: [{ name: '', duration: 60 }], start: null, slotsReq: 0 };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function chip(label, pressed, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = label;
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------- step 1: location
  function renderLocations() {
    locBox.replaceChildren(...LOCATIONS.map(l => chip(l.name, state.location === l.id, () => {
      state.location = l.id;
      renderLocations();
      renderSummary();
      loadSlots();
    })));
  }

  // ---------- step 2: people
  function renderPeople() {
    peopleBox.replaceChildren(...state.people.map((p, i) => {
      const row = document.createElement('div');
      row.className = 'person-row';
      if (i === 0) {
        row.innerHTML = '<span class="who">You</span>';
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Their first name';
        input.value = p.name;
        input.setAttribute('aria-label', 'Person ' + (i + 1) + ' name');
        input.style.maxWidth = '200px';
        input.addEventListener('input', () => { p.name = input.value; });
        row.append(input);
      }
      const durs = document.createElement('div');
      durs.className = 'choices';
      Object.keys(PRICES).forEach(m => durs.append(chip(m + ' min', p.duration === +m, () => {
        p.duration = +m; renderPeople(); renderSummary(); loadSlots();
      })));
      row.append(durs);
      if (i > 0) {
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'btn secondary';
        rm.textContent = 'Remove';
        rm.addEventListener('click', () => { state.people.splice(i, 1); renderPeople(); renderSummary(); loadSlots(); });
        row.append(rm);
      }
      return row;
    }));
    addBtn.classList.toggle('hidden', state.people.length >= MAX_PEOPLE);
  }
  addBtn.addEventListener('click', () => {
    state.people.push({ name: '', duration: 60 });
    renderPeople(); renderSummary(); loadSlots();
  });
  ownTable.addEventListener('change', renderSummary);

  function prices() {
    const loc = LOCATIONS.find(l => l.id === state.location) || {};
    const household = state.people.length > 1;
    return state.people.map(p => {
      let v = PRICES[p.duration];
      const notes = [];
      if (household) { v -= HOUSEHOLD; notes.push('household'); }
      if (ownTable.checked) { v -= TABLE; notes.push('own table'); }
      if (loc.localDiscount) { v -= loc.localDiscount; notes.push('Quilbilly'); }
      return { v: Math.max(0, v), notes: notes };
    });
  }

  function renderSummary() {
    const ps = prices();
    const rows = state.people.map((p, i) => {
      const who = i === 0 ? 'You' : (p.name || 'Person ' + (i + 1));
      const note = ps[i].notes.length ? ' <span class="hint" style="display:inline">(' + ps[i].notes.join(', ') + ')</span>' : '';
      return '<div><span>' + esc(who) + ': ' + p.duration + ' min' + note + '</span><span>$' + ps[i].v + '</span></div>';
    });
    const total = ps.reduce((a, b) => a + b.v, 0);
    summary.innerHTML = rows.join('') + '<div class="total"><span>Estimated total</span><span>$' + total + '</span></div>';
  }

  // ---------- step 3: times
  async function loadSlots() {
    state.start = null;
    if (!state.location) return;
    if (!API) {
      slotsBox.innerHTML = '<p>Online booking isn\'t connected yet. Please <a href="mailto:' + EMAIL + '">email me</a> to book.</p>';
      return;
    }
    const req = ++state.slotsReq;
    slotsBox.innerHTML = '<p class="loading">Checking my calendar…</p>';
    try {
      const durations = state.people.map(p => p.duration).join(',');
      const res = await fetch(API + '?action=slots&location=' + encodeURIComponent(state.location) + '&durations=' + durations);
      const data = await res.json();
      if (req !== state.slotsReq) return; // a newer request replaced this one
      if (!data.ok) throw new Error(data.error);
      renderSlots(data.days);
    } catch (err) {
      if (req !== state.slotsReq) return;
      slotsBox.innerHTML = '<p class="error-msg">Couldn\'t load available times. Please try again, or <a href="mailto:' + EMAIL + '">email me</a>.</p>';
    }
  }

  function renderSlots(days) {
    if (!days.length) {
      const name = LOCATIONS.find(l => l.id === state.location).name;
      slotsBox.innerHTML = '<p>No open times in ' + esc(name) + ' for this booking in the next two months. ' +
        '<a href="mailto:' + EMAIL + '">Email me</a> and we\'ll find something.</p>';
      return;
    }
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Day');
    days.forEach((d, i) => select.add(new Option(d.label + ' (' + d.times.length + ' open)', i)));
    const times = document.createElement('div');
    times.className = 'choices';
    times.style.marginTop = '12px';
    const draw = () => {
      const day = days[select.value];
      times.replaceChildren(...day.times.map(t => chip(t.label, state.start === t.start, () => {
        state.start = t.start;
        state.startLabel = day.label + ' at ' + t.label;
        draw();
      })));
    };
    select.addEventListener('change', () => { state.start = null; draw(); });
    slotsBox.replaceChildren(select, times);
    draw();
  }

  // ---------- step 4: submit
  function showError(msg) {
    errorEl.innerHTML = msg;
    errorEl.classList.remove('hidden');
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errorEl.classList.add('hidden');
    if (!state.location) return showError('Please choose your area (step 1).');
    if (!state.start) return showError('Please pick a time (step 3).');
    for (const f of form.querySelectorAll('input, textarea')) {
      if (f.name !== 'website' && !f.checkValidity()) { f.reportValidity(); return; }
    }
    if (!API) return showError('Online booking isn\'t connected yet. Please <a href="mailto:' + EMAIL + '">email me</a>.');

    const fd = new FormData(form);
    const payload = {
      type: 'booking',
      location: state.location,
      durations: state.people.map(p => p.duration),
      people: state.people.map((p, i) => i === 0 ? fd.get('name') : (p.name || 'Person ' + (i + 1))),
      start: state.start,
      ownTable: ownTable.checked,
    };
    ['name', 'phone', 'email', 'street', 'city', 'zip', 'access', 'clientType', 'referredBy', 'notes', 'privacyConsent', 'website']
      .forEach(k => { payload[k] = fd.get(k) || ''; });

    bookBtn.disabled = true;
    bookBtn.textContent = 'Booking…';
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.ok) {
        showError(esc(data.error || 'Something went wrong.'));
        loadSlots();
        return;
      }
      document.getElementById('booked-details').innerHTML =
        '<p><strong>' + esc(data.when) + '</strong> in ' + esc(data.location) + '<br>Estimated total: $' + esc(data.total) + '</p>';
      document.getElementById('booked-intake').classList.toggle('hidden', !data.isNew);
      form.classList.add('hidden');
      document.getElementById('booked').classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      showError('Couldn\'t reach the booking system. Please check your connection and try again, or <a href="mailto:' + EMAIL + '">email me</a>.');
    } finally {
      bookBtn.disabled = false;
      bookBtn.textContent = 'Request this time';
    }
  });

  renderLocations();
  renderPeople();
  renderSummary();
})();
