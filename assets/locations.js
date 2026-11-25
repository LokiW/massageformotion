// Fills in upcoming dates per area from the "Massage Availability" calendar.
// If the script isn't connected or can't be reached, the general descriptions stay.
(async function () {
  const API = window.MFM_CONFIG && window.MFM_CONFIG.scriptUrl;
  if (!API) return;
  try {
    const res = await fetch(API + '?action=schedule');
    const data = await res.json();
    if (!data.ok) return;
    document.querySelectorAll('#schedule li[data-loc]').forEach(li => {
      const days = data.schedule[li.dataset.loc] || [];
      const span = li.querySelector('span');
      if (!days.length) {
        span.textContent = 'No dates scheduled yet. Email me!';
      } else {
        span.textContent = days.slice(0, 6).join(' · ') + (days.length > 6 ? ' · and more' : '');
      }
    });
  } catch (err) { /* keep the fallback text */ }
})();
