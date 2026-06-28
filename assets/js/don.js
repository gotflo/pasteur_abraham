/* =========================================================
   Abraham Andebi - Donation flow
   ========================================================= */
(function () {
  'use strict';

  const state = { amount: 20, freq: 'Une seule fois', purpose: 'Offrandes' };

  const $ = (id) => document.getElementById(id);
  const fmt = (n) => `${Number(n).toLocaleString('fr-CA')} $`;

  const sTotal = $('sTotal'), sFreq = $('sFreq'), sPurpose = $('sPurpose');

  const render = () => {
    sTotal.textContent = state.amount > 0 ? fmt(state.amount) : '0 $';
    sFreq.textContent = state.freq;
    sPurpose.textContent = state.purpose;
  };

  /* Frequency */
  $('freq').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $('freq').querySelectorAll('button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.freq = b.dataset.freq;
    render();
  });

  /* Preset amounts */
  const amountsBox = $('amounts');
  const customAmt = $('customAmt');
  amountsBox.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    amountsBox.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    customAmt.value = '';
    state.amount = +b.dataset.amt;
    render();
  });

  /* Custom amount */
  customAmt.addEventListener('input', () => {
    amountsBox.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
    state.amount = customAmt.value ? Math.max(0, +customAmt.value) : 0;
    render();
  });

  /* Purpose */
  $('purpose').addEventListener('change', (e) => { state.purpose = e.target.value; render(); });

  /* Submit -> confirmation */
  $('submitDon').addEventListener('click', () => {
    if (!state.amount || state.amount <= 0) {
      customAmt.focus();
      customAmt.style.borderColor = '#c0392b';
      return;
    }
    const name = $('name').value.trim();
    $('recap').innerHTML =
      `<span>Montant&nbsp;: <b>${fmt(state.amount)}</b></span>` +
      `<span>Fréquence&nbsp;: <b>${state.freq}</b></span>` +
      `<span>Affectation&nbsp;: <b>${state.purpose}</b></span>` +
      (name ? `<span>Donateur&nbsp;: <b>${name.replace(/[<>]/g, '')}</b></span>` : '');

    $('donForm').style.display = 'none';
    const thanks = $('donThanks');
    thanks.classList.add('show');
    thanks.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* Donate again */
  $('againBtn').addEventListener('click', () => {
    $('donThanks').classList.remove('show');
    $('donForm').style.display = '';
    $('donForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  render();
})();
