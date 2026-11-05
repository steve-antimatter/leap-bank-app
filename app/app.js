/* Leap Bank demo — UI and routing.
 * Views live on plain hash names (#accounts, #transfer, #account-chk …) so the
 * app works on GitHub Pages and inside sandboxed preview frames.
 * Markup favors roles and labels so tests can use getByRole / getByLabel.
 */
(function () {
  'use strict';
  const api = window.LeapApi;
  const app = document.getElementById('app');
  const ribbon = document.getElementById('demo-ribbon');
  const toastEl = document.getElementById('toast');

  const BRAND = '<img class="brand-mark" src="leapwork-wordmark-white.png" alt="Leapwork" width="140" height="33"><span class="brand-name">Leap Bank</span>';
  // Geometric linework from the Leapwork visual language: half-discs, rings, bars.
  const PATTERN = '<svg class="pattern" viewBox="0 0 420 240" aria-hidden="true" focusable="false">' +
    '<circle cx="330" cy="70" r="92" fill="none" stroke="#D2E1EA" stroke-width="1.25" opacity="0.45"></circle>' +
    '<circle cx="330" cy="70" r="58" fill="none" stroke="#D2E1EA" stroke-width="1.25" opacity="0.3"></circle>' +
    '<path d="M248 240 a82 82 0 0 1 164 0 z" fill="#618FA4" opacity="0.35"></path>' +
    '<path d="M180 0 a46 46 0 0 0 92 0 z" fill="none" stroke="#D2E1EA" stroke-width="1.25" opacity="0.5"></path>' +
    '<rect x="196" y="150" width="40" height="6" fill="#D2E1EA" opacity="0.5"></rect>' +
    '<rect x="196" y="164" width="24" height="6" fill="#D2E1EA" opacity="0.3"></rect>' +
    '</svg>';

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function money(cents) {
    const v = (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (cents < 0 ? '−' : '') + '$' + v;
  }
  function signedMoney(cents) { return (cents > 0 ? '+' : '') + money(cents); }
  function parseAmount(str) {
    const s = String(str || '').replace(/[$,\s]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
    return Math.round(parseFloat(s) * 100);
  }
  function fmtDate(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function today() { return window.LeapData.isoDaysFromToday(0); }
  function debounce(fn, ms) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; }
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4000);
  }
  let flash = null;
  function flashHTML() {
    if (!flash) return '';
    const h = '<div class="flash" role="status">' + esc(flash) + '</div>';
    flash = null;
    return h;
  }
  function go(hash) {
    if (location.hash === '#' + hash) route(); else location.hash = hash;
  }
  function setFieldError(input, msg) {
    const id = input.id + '-error';
    let p = document.getElementById(id);
    if (!msg) {
      if (p) p.remove();
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
      return;
    }
    if (!p) {
      p = document.createElement('p');
      p.id = id;
      p.className = 'field-error';
      input.insertAdjacentElement('afterend', p);
    }
    p.textContent = msg;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', id);
  }
  function clearErrors(form) {
    form.querySelectorAll('[aria-invalid]').forEach((el) => setFieldError(el, null));
    const alert = form.querySelector('.alert');
    if (alert) { alert.hidden = true; alert.textContent = ''; }
  }
  function showFormError(form, msg) {
    const alert = form.querySelector('.alert');
    alert.textContent = msg;
    alert.hidden = false;
  }
  function busy(btn, on, label) {
    if (on) {
      btn.dataset.label = btn.textContent;
      btn.textContent = label || 'Processing…';
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  }
  function accountOptions(accounts, selected, placeholder) {
    return (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '') +
      accounts.map((a) => '<option value="' + a.id + '"' + (a.id === selected ? ' selected' : '') + '>' +
        esc(a.name + ' ending ' + a.mask + ' (' + (a.type === 'credit' ? money(-a.balance) + ' owed' : money(a.balance)) + ')') + '</option>').join('');
  }

  /* ---------- chrome ---------- */
  function renderRibbon() {
    ribbon.innerHTML = '<span>Demo environment: fictional bank, fake data</span>';
  }

  function shell(active, inner) {
    const user = api.currentUser() || { email: '' };
    const nav = [
      ['accounts', 'Accounts'],
      ['activity', 'Activity'],
      ['transfer', 'Transfer'],
      ['billpay', 'Bill pay'],
      ['profile', 'Profile']
    ].map(([k, label]) => '<li><a href="#' + k + '"' + (active === k ? ' aria-current="page"' : '') +
      ' data-testid="' + 'nav-' + k + '">' + esc(label) + '</a></li>').join('');
    return '<div class="layout' + '' + '">' +
      '<header class="sidebar">' +
        '<a class="brand" href="#accounts">' + BRAND + '</a>' +
        '<nav aria-label="Main"><ul class="nav">' + nav + '</ul></nav>' +
        '<div class="whoami"><span>Signed in as</span><strong>' + esc(user.email) + '</strong>' +
        '<button type="button" class="link-btn" id="signout" data-testid="' + 'signout' + '">Sign out</button></div>' +
      '</header>' +
      '<main id="main" class="content" tabindex="-1">' + inner + '</main></div>';
  }
  function bindShell() {
    const so = document.getElementById('signout');
    if (so) so.addEventListener('click', () => { api.logout(); go('login'); });
  }

  /* ---------- shared components ---------- */
  function accountCard(a) {
    const credit = a.type === 'credit';
    return '<li><a class="card" href="#account-' + a.id + '" data-testid="' + 'account-card' + '">' +
      '<span class="card-name">' + esc(a.name) + ' <span class="card-mask">ending ' + a.mask + '</span></span>' +
      '<span class="card-balance">' + money(credit ? -a.balance : a.balance) + '</span>' +
      '<span class="card-sub">' + (credit ? 'Balance owed' : 'Available balance') + '</span></a></li>';
  }

  function txTable(tx, accounts, caption) {
    if (!tx.length) return '<p class="empty">No transactions match.</p>';
    const name = (id) => { const a = accounts.find((x) => x.id === id); return a ? a.short + ' ' + a.mask : id; };
    return '<div class="table-wrap"><table class="tx" data-testid="' + 'tx-table' + '">' +
      '<caption class="visually-hidden">' + esc(caption) + '</caption>' +
      '<thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Category</th><th scope="col">Account</th><th scope="col" class="num">Amount</th></tr></thead><tbody>' +
      tx.map((t) => '<tr><td>' + fmtDate(t.date) + '</td><td class="desc">' + esc(t.desc) + '</td><td>' + esc(t.category) +
        '</td><td>' + esc(name(t.accountId)) + '</td><td class="num ' + (t.amount > 0 ? 'pos' : 'neg') + '">' + signedMoney(t.amount) + '</td></tr>').join('') +
      '</tbody></table></div>';
  }

  /* ---------- pages ---------- */
  function pageLogin() {
    return {
      title: 'Sign in',
      public: true,
      html: '<div class="login-split">' +
        '<div class="login-brand">' + PATTERN + '<div class="brand brand--login">' + BRAND + '</div>' +
        '<p class="login-tag">A demo online bank. Every account, balance and payee here is made up.</p></div>' +
        '<main id="main" class="login" tabindex="-1"><div class="login-card">' +
        '<h1>Sign in</h1>' +
        '<form id="login-form" novalidate>' +
          '<div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required></div>' +
          '<div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>' +
          '<div class="alert" role="alert" hidden></div>' +
          '<button type="submit" class="btn btn--lg btn--block" data-testid="' + 'login-submit' + '">Sign in</button>' +
        '</form>' +
        '<aside class="hint" aria-label="Demo credentials"><strong>Demo login</strong><span>Email: demo@leapbank.test</span><span>Password: demo1234</span></aside>' +
        '</div></main></div>',
      bind() {
        const form = document.getElementById('login-form');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          clearErrors(form);
          const email = form.email.value.trim();
          const pw = form.password.value;
          let bad = false;
          if (!email) { setFieldError(form.email, 'Enter your email.'); bad = true; }
          if (!pw) { setFieldError(form.password, 'Enter your password.'); bad = true; }
          if (bad) { form.querySelector('[aria-invalid]').focus(); return; }
          const btn = form.querySelector('button[type=submit]');
          busy(btn, true, 'Signing in…');
          try {
            await api.login(email, pw);
            go('accounts');
          } catch (err) {
            busy(btn, false);
            showFormError(form, err.message);
          }
        });
      }
    };
  }

  async function pageAccounts() {
    const [accounts, tx] = await Promise.all([api.getAccounts(), api.getTransactions({ limit: 6 })]);
    const h = new Date().getHours();
    const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const user = api.currentUser();
    const totalAvail = accounts.filter((a) => a.type !== 'credit').reduce((n, a) => n + a.balance, 0);
    return {
      title: 'Accounts',
      html: flashHTML() +
        '<section class="hero" aria-labelledby="hero-h">' + PATTERN +
          '<div class="hero-body"><h1 id="hero-h">' + greet + ', ' + esc(user.firstName) + '</h1>' +
          '<p class="hero-label">Available across checking and savings</p>' +
          '<p class="hero-total" data-testid="' + 'total-available' + '">' + money(totalAvail) + '</p>' +
          '<div class="actions"><a class="btn btn--inverse" href="#transfer" data-testid="' + 'quick-transfer' + '">' + esc('Transfer') + '</a>' +
          '<a class="btn btn--outline-light" href="#billpay">Pay a bill</a></div></div></section>' +
        '<section aria-labelledby="acct-h"><h2 id="acct-h" class="visually-hidden">Your accounts</h2><ul class="cards">' + accounts.map(accountCard).join('') + '</ul></section>' +
        '<section class="panel" aria-labelledby="recent-h"><div class="panel-head"><h2 id="recent-h">Recent activity</h2><a href="#activity">View all activity</a></div>' +
        txTable(tx, accounts, 'Recent activity') + '</section>'
    };
  }

  async function pageAccount(id) {
    const [accounts, tx] = await Promise.all([api.getAccounts(), api.getTransactions({ accountId: id })]);
    const a = accounts.find((x) => x.id === id);
    if (!a) return { title: 'Not found', html: '<h1>Account not found</h1><p><a href="#accounts">Back to accounts</a></p>' };
    const credit = a.type === 'credit';
    return {
      title: a.name,
      active: 'accounts',
      html: '<p class="crumb"><a href="#accounts">← All accounts</a></p>' +
        '<div class="page-head"><div><h1>' + esc(a.name) + '</h1><p class="muted">Account ending ' + a.mask + '</p></div>' +
        '<div class="balance-block"><span class="muted">' + (credit ? 'Balance owed' : 'Available balance') + '</span>' +
        '<strong class="big" data-testid="' + 'account-balance' + '">' + money(credit ? -a.balance : a.balance) + '</strong>' +
        (credit ? '<span class="muted">Credit limit ' + money(a.limit) + '</span>' : '') + '</div></div>' +
        '<section class="panel" aria-labelledby="hist-h"><div class="panel-head"><h2 id="hist-h">Transactions</h2><span class="muted">' + tx.length + ' in the last 90 days</span></div>' +
        txTable(tx, accounts, a.name + ' transactions') + '</section>'
    };
  }

  const activityFilters = { q: '', accountId: '', type: '', days: '30' };
  async function pageActivity() {
    const [accounts, tx] = await Promise.all([api.getAccounts(), api.getTransactions(activityFilters)]);
    const f = activityFilters;
    const types = [['', 'All types'], ['purchase', 'Purchases'], ['deposit', 'Deposits'], ['transfer', 'Transfers'], ['billpay', 'Bill payments'], ['interest', 'Interest']];
    const periods = [['30', 'Last 30 days'], ['60', 'Last 60 days'], ['90', 'Last 90 days']];
    const opt = (list, v) => list.map(([k, l]) => '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + l + '</option>').join('');
    return {
      title: 'Activity',
      html: '<div class="page-head"><h1>Activity</h1></div>' +
        '<form id="filters" class="filters panel" role="search" aria-label="Filter transactions">' +
          '<div class="field"><label for="q">Search</label><input id="q" name="q" type="search" placeholder="Payee, category or amount" value="' + esc(f.q) + '"></div>' +
          '<div class="field"><label for="f-account">Account</label><select id="f-account" name="accountId"><option value="">All accounts</option>' +
            accounts.map((a) => '<option value="' + a.id + '"' + (a.id === f.accountId ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('') + '</select></div>' +
          '<div class="field"><label for="f-type">Type</label><select id="f-type" name="type">' + opt(types, f.type) + '</select></div>' +
          '<div class="field"><label for="f-days">Period</label><select id="f-days" name="days">' + opt(periods, f.days) + '</select></div>' +
        '</form>' +
        '<section class="panel" aria-labelledby="res-h"><div class="panel-head"><h2 id="res-h">Transactions</h2>' +
        '<p id="result-count" class="muted" role="status" data-testid="' + 'result-count' + '">' + tx.length + ' transaction' + (tx.length === 1 ? '' : 's') + '</p></div>' +
        '<div id="results">' + txTable(tx, accounts, 'Filtered transactions') + '</div></section>',
      bind() {
        const form = document.getElementById('filters');
        form.addEventListener('submit', (e) => e.preventDefault());
        const update = debounce(async () => {
          Object.assign(activityFilters, { q: form.q.value, accountId: form.accountId.value, type: form.type.value, days: form.days.value });
          const res = document.getElementById('results');
          if (!res) return; // user already left the page
          res.setAttribute('aria-busy', 'true');
          const list = await api.getTransactions(activityFilters);
          if (!document.body.contains(res)) return;
          res.innerHTML = txTable(list, accounts, 'Filtered transactions');
          res.removeAttribute('aria-busy');
          document.getElementById('result-count').textContent = list.length + ' transaction' + (list.length === 1 ? '' : 's');
        }, 250);
        form.addEventListener('input', update);
        form.addEventListener('change', update);
      }
    };
  }

  async function pageTransfer() {
    const accounts = await api.getAccounts();
    const fromAccts = accounts.filter((a) => a.type !== 'credit');
    return {
      title: 'Transfer money',
      html: '<div class="page-head"><h1>' + esc('Transfer money') + '</h1></div>' +
        '<section class="panel narrow" id="transfer-panel">' +
        '<form id="transfer-form" novalidate>' +
          '<div class="field"><label for="from">From</label><select id="from" name="from">' + accountOptions(fromAccts, 'chk') + '</select></div>' +
          '<div class="field"><label for="to">To</label><select id="to" name="to">' + accountOptions(accounts, '', 'Choose an account') + '</select></div>' +
          '<div class="field"><label for="amount">Amount</label><input id="amount" name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00"></div>' +
          '<div class="field"><label for="memo">Memo <span class="muted">(optional)</span></label><input id="memo" name="memo" maxlength="60" autocomplete="off"></div>' +
          '<div class="alert" role="alert" hidden></div>' +
          '<button type="submit" class="btn btn--lg btn--block" data-testid="' + 'transfer-submit' + '">' + esc('Transfer') + '</button>' +
        '</form>' +
        '<div id="result" hidden></div>' +
        '</section>',
      bind() {
        const form = document.getElementById('transfer-form');
        const result = document.getElementById('result');

        async function submit(req, btn, onError) {
          busy(btn, true);
          try {
            const res = await api.transfer(req);
            form.hidden = true;
            result.innerHTML = '<div class="success" role="status"><h2>' + esc('Transfer complete') + '</h2>' +
              '<p>' + money(res.amount) + ' moved from ' + esc(res.from) + ' to ' + esc(res.to) + '.</p>' +
              '<p>Confirmation number <strong data-testid="' + 'transfer-confirmation' + '">' + res.confirmation + '</strong></p>' +
              '<div class="actions"><button type="button" class="btn" id="again">' + esc('Make another transfer') + '</button>' +
              '<a class="btn btn--ghost" href="#activity">View activity</a></div></div>';
            result.hidden = false;
            document.getElementById('again').addEventListener('click', () => route());
            result.querySelector('h2').setAttribute('tabindex', '-1');
            result.querySelector('h2').focus();
          } catch (err) {
            busy(btn, false);
            onError(err);
          }
        }

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          clearErrors(form);
          const req = { from: form.from.value, to: form.to.value, amount: parseAmount(form.amount.value), memo: form.memo.value };
          let bad = false;
          if (!req.to) { setFieldError(form.to, 'Choose an account to transfer to.'); bad = true; }
          else if (req.to === req.from) { setFieldError(form.to, 'Choose two different accounts.'); bad = true; }
          if (!(req.amount > 0)) { setFieldError(form.amount, 'Enter an amount greater than $0.00.'); bad = true; }
          if (bad) { form.querySelector('[aria-invalid]').focus(); return; }
          const fail = (err) => {
            form.hidden = false;
            if (err.field && form[err.field]) { setFieldError(form[err.field], err.message); form[err.field].focus(); }
            else showFormError(form, err.message);
          };
          submit(req, form.querySelector('button[type=submit]'), fail);
        });
      }
    };
  }

  async function pageBillpay() {
    const [accounts, payees, scheduled] = await Promise.all([api.getAccounts(), api.getPayees(), api.getScheduled()]);
    const fromAccts = accounts.filter((a) => a.type !== 'credit');
    const payeeName = (id) => { const p = payees.find((x) => x.id === id); return p ? p.name : 'Unknown payee'; };
    const acctName = (id) => { const a = accounts.find((x) => x.id === id); return a ? a.short + ' ' + a.mask : id; };
    const sched = scheduled.length
      ? '<div class="table-wrap"><table class="tx tx--compact" data-testid="' + 'scheduled-table' + '"><caption class="visually-hidden">Scheduled payments</caption>' +
        '<thead><tr><th scope="col">Payee</th><th scope="col">Date</th><th scope="col">From</th><th scope="col" class="num">Amount</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody>' +
        scheduled.map((s) => '<tr><td class="desc">' + esc(payeeName(s.payeeId)) + '</td><td>' + fmtDate(s.date) + '</td><td>' + esc(acctName(s.from)) +
          '</td><td class="num">' + money(s.amount) + '</td><td class="num"><button type="button" class="link-btn" data-cancel="' + s.id + '" aria-label="Cancel payment to ' +
          esc(payeeName(s.payeeId)) + ' on ' + fmtDate(s.date) + '">Cancel</button></td></tr>').join('') + '</tbody></table></div>'
      : '<p class="empty">No scheduled payments.</p>';
    return {
      title: 'Bill pay',
      html: flashHTML() + '<div class="page-head"><h1>Bill pay</h1></div>' +
        '<div class="two-col">' +
        '<section class="panel" aria-labelledby="pay-h"><h2 id="pay-h">Pay a bill</h2>' +
        '<form id="pay-form" novalidate>' +
          '<div class="field"><label for="payee">Payee</label><select id="payee" name="payee"><option value="">Choose a payee</option>' +
            payees.map((p) => '<option value="' + p.id + '">' + esc(p.name) + ' (ending ' + p.accountNumber.slice(-4) + ')' + '</option>').join('') + '</select></div>' +
          '<div class="field"><label for="pay-from">From</label><select id="pay-from" name="from">' + accountOptions(fromAccts, 'chk') + '</select></div>' +
          '<div class="field"><label for="pay-amount">Amount</label><input id="pay-amount" name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00"></div>' +
          '<div class="field"><label for="pay-date">Payment date</label><input id="pay-date" name="date" type="date" min="' + today() + '" value="' + today() + '"></div>' +
          '<div class="alert" role="alert" hidden></div>' +
          '<button type="submit" class="btn btn--lg btn--block" data-testid="' + 'billpay-submit' + '">Pay bill</button>' +
        '</form></section>' +
        '<div class="stack">' +
        '<section class="panel" aria-labelledby="sched-h"><h2 id="sched-h">Scheduled payments</h2>' + sched + '</section>' +
        '<section class="panel"><details id="add-payee"><summary>Add a payee</summary>' +
        '<form id="payee-form" novalidate>' +
          '<div class="field"><label for="payee-name">Payee name</label><input id="payee-name" name="name" autocomplete="off"></div>' +
          '<div class="field"><label for="payee-acct">Account number</label><input id="payee-acct" name="accountNumber" inputmode="numeric" autocomplete="off"></div>' +
          '<div class="alert" role="alert" hidden></div>' +
          '<button type="submit" class="btn">Add payee</button>' +
        '</form></details></section>' +
        '</div></div>',
      bind() {
        const form = document.getElementById('pay-form');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          clearErrors(form);
          const req = { payeeId: form.payee.value, from: form.from.value, amount: parseAmount(form.amount.value), date: form.date.value };
          let bad = false;
          if (!req.payeeId) { setFieldError(form.payee, 'Choose a payee.'); bad = true; }
          if (!(req.amount > 0)) { setFieldError(form.amount, 'Enter an amount greater than $0.00.'); bad = true; }
          if (!req.date || req.date < today()) { setFieldError(form.date, 'Choose today or a future date.'); bad = true; }
          if (bad) { form.querySelector('[aria-invalid]').focus(); return; }
          const btn = form.querySelector('button[type=submit]');
          busy(btn, true);
          try {
            const res = await api.payBill(req);
            flash = res.status === 'sent'
              ? 'Payment of ' + money(res.amount) + ' to ' + res.payee + ' sent. Confirmation ' + res.confirmation + '.'
              : 'Payment of ' + money(res.amount) + ' to ' + res.payee + ' scheduled for ' + fmtDate(res.date) + '. Confirmation ' + res.confirmation + '.';
            route();
          } catch (err) {
            busy(btn, false);
            const map = { payee: form.payee, amount: form.amount, date: form.date };
            if (err.field && map[err.field]) { setFieldError(map[err.field], err.message); map[err.field].focus(); }
            else showFormError(form, err.message);
          }
        });

        app.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
          busy(b, true, 'Cancelling…');
          try {
            await api.cancelScheduled(b.dataset.cancel);
            flash = 'Scheduled payment cancelled.';
            route();
          } catch (err) { busy(b, false); toast(err.message); }
        }));

        const pf = document.getElementById('payee-form');
        pf.addEventListener('submit', async (e) => {
          e.preventDefault();
          clearErrors(pf);
          const btn = pf.querySelector('button[type=submit]');
          busy(btn, true, 'Adding…');
          try {
            const p = await api.addPayee({ name: pf.name.value, accountNumber: pf.accountNumber.value });
            flash = p.name + ' added as a payee.';
            route();
          } catch (err) {
            busy(btn, false);
            const map = { name: pf.name, accountNumber: pf.accountNumber };
            if (err.field && map[err.field]) { setFieldError(map[err.field], err.message); map[err.field].focus(); }
            else showFormError(pf, err.message);
          }
        });
      }
    };
  }

  function pageProfile() {
    const u = api.currentUser();
    return {
      title: 'Profile',
      html: flashHTML() + '<div class="page-head"><h1>Profile</h1></div>' +
        '<section class="panel narrow" aria-labelledby="me-h"><h2 id="me-h">Your details</h2>' +
        '<dl class="review"><div><dt>Name</dt><dd>' + esc(u.name) + '</dd></div><div><dt>Email</dt><dd>' + esc(u.email) + '</dd></div></dl></section>' +
        '<section class="panel narrow" aria-labelledby="data-h"><h2 id="data-h">Demo data</h2>' +
        '<p>Put every balance, transaction, payee and scheduled payment back to the starting set. Also unlocks the account after too many failed sign-ins.</p>' +
        '<button type="button" class="btn btn--danger" id="reset" data-testid="' + 'reset-data' + '">Reset demo data</button></section>',
      bind() {
        const b = document.getElementById('reset');
        b.addEventListener('click', async () => {
          busy(b, true, 'Resetting…');
          await api.resetData();
          flash = 'Demo data reset.';
          route();
        });
      }
    };
  }

  /* ---------- router ---------- */
  const PUBLIC = { login: pageLogin };
  const PRIVATE = { accounts: pageAccounts, activity: pageActivity, transfer: pageTransfer, billpay: pageBillpay, profile: pageProfile };
  let renderToken = 0;

  async function route() {
    renderRibbon();
    const hash = location.hash.replace(/^#/, '') || 'accounts';
    let name = hash, arg = null;
    if (hash.indexOf('account-') === 0) { name = 'account'; arg = hash.slice(8); }
    const signedIn = !!api.currentUser();

    if (PUBLIC[name]) {
      if (name === 'login' && signedIn) { go('accounts'); return; }
      const page = PUBLIC[name]();
      renderToken++;
      app.innerHTML = page.html;
      page.bind && page.bind();
      document.title = page.title + ' — Leap Bank (demo)';
      return;
    }
    if (!PRIVATE[name] && name !== 'account') { go('accounts'); return; }
    if (!signedIn) { go('login'); return; }

    const token = ++renderToken;
    const active = name === 'account' ? 'accounts' : name;
    app.innerHTML = shell(active, '<p class="loading" aria-busy="true">Loading…</p>');
    bindShell();
    try {
      const page = name === 'account' ? await pageAccount(arg) : await PRIVATE[name]();
      if (token !== renderToken) return;
      app.innerHTML = shell(page.active || active, page.html);
      bindShell();
      page.bind && page.bind();
      document.title = page.title + ' — Leap Bank (demo)';
    } catch (err) {
      if (token !== renderToken) return;
      app.innerHTML = shell(active, '<div class="alert" role="alert">' + esc(err.message) + '</div>');
      bindShell();
    }
  }

  document.getElementById('skip-link').addEventListener('click', (e) => {
    e.preventDefault();
    const m = document.getElementById('main');
    if (m) m.focus();
  });
  window.addEventListener('hashchange', route);
  route();
})();
