/* Leap Bank demo — mock backend.
 * Runs in the browser and stores data in localStorage (in memory if storage
 * is unavailable). Every call is async with realistic latency.
 */
(function () {
  'use strict';
  const DATA_KEY = 'leapbank.data.v1';
  const SESSION_KEY = 'leapbank.session';
  let db = null;
  let memSession = null;

  class ApiError extends Error {
    constructor(message, field) { super(message); this.name = 'ApiError'; this.field = field || null; }
  }

  function load() {
    if (db) return db;
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (raw) { db = JSON.parse(raw); if (db && db.version === 1) return db; }
    } catch (e) { /* fall through to seed */ }
    db = window.LeapData.seed();
    persist();
    return db;
  }
  function persist() {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(db)); } catch (e) { /* in-memory only */ }
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function today() { return window.LeapData.isoDaysFromToday(0); }

  function wait(payments) {
    const ms = (payments ? 250 : 120) + Math.random() * 260;
    return new Promise((r) => setTimeout(r, ms));
  }
  async function call(fn, payments) {
    await wait(payments);
    return clone(fn(load()));
  }

  // "Keep me signed in": the session lives in localStorage, so it survives reloads
  // (and Playwright's storageState can carry it between tests).
  function getSession() {
    try { return localStorage.getItem(SESSION_KEY); } catch (e) { return memSession; }
  }
  function setSession(v) {
    memSession = v;
    try { if (v) localStorage.setItem(SESSION_KEY, v); else localStorage.removeItem(SESSION_KEY); } catch (e) { /* memory only */ }
  }
  function genId(d, prefix) { return prefix + (d.nextId++); }
  function confirmation() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = 'LB-';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  function addTx(d, t) {
    d.transactions.unshift(Object.assign({ id: 't' + (d.nextTxId++), date: today() }, t));
  }
  function account(d, id) {
    const a = d.accounts.find((x) => x.id === id);
    if (!a) throw new ApiError('That account was not found.');
    return a;
  }

  const api = {
    ApiError,

    currentUser() {
      if (getSession() !== 'ok') return null;
      const u = load().user;
      return { firstName: u.firstName, name: u.name, email: u.email };
    },

    login(email, password) {
      return call((d) => {
        if (d.failedLogins >= 5) throw new ApiError('This account is locked after too many attempts. Reset the demo data to unlock it.');
        const okUser = String(email || '').trim().toLowerCase() === d.user.email;
        if (!okUser || password !== d.user.password) {
          d.failedLogins += 1;
          persist();
          if (d.failedLogins >= 5) throw new ApiError('This account is locked after too many attempts. Reset the demo data to unlock it.');
          throw new ApiError('Email or password is incorrect.');
        }
        d.failedLogins = 0;
        persist();
        setSession('ok');
        return { ok: true };
      });
    },

    logout() { setSession(null); },

    getAccounts() { return call((d) => d.accounts); },

    getTransactions(f) {
      f = f || {};
      return call((d) => {
        let list = d.transactions;
        if (f.accountId) list = list.filter((t) => t.accountId === f.accountId);
        if (f.type) list = list.filter((t) => t.type === f.type);
        if (f.days) {
          const from = window.LeapData.isoDaysFromToday(-Number(f.days));
          list = list.filter((t) => t.date >= from);
        }
        if (f.q) {
          const q = String(f.q).trim().toLowerCase();
          if (q) {
            list = list.filter((t) => t.desc.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) ||
              (Math.abs(t.amount) / 100).toFixed(2).includes(q.replace(/[$,]/g, '')));
          }
        }
        if (f.limit) list = list.slice(0, f.limit);
        return list;
      });
    },

    transfer(req) {
      return call((d) => {
        const from = account(d, req.from);
        const to = account(d, req.to);
        const amount = Number(req.amount);
        if (from.id === to.id) throw new ApiError('Choose two different accounts.', 'to');
        if (from.type === 'credit') throw new ApiError('You can’t transfer from a credit card.', 'from');
        if (!Number.isInteger(amount) || amount <= 0) throw new ApiError('Enter an amount greater than $0.00.', 'amount');
        if (amount > 2500000) throw new ApiError('Transfers are limited to $25,000.00 per day.', 'amount');
        if (amount > from.balance) throw new ApiError('Insufficient funds in ' + from.name + '.', 'amount');
        if (to.type === 'credit' && amount > -to.balance) throw new ApiError('That’s more than the ' + to.name + ' balance owed.', 'amount');
        from.balance -= amount;
        to.balance += amount;
        const memo = String(req.memo || '').trim().slice(0, 60);
        addTx(d, { accountId: from.id, desc: 'Transfer to ' + to.short + (memo ? ' — ' + memo : ''), category: 'Transfer', type: 'transfer', amount: -amount });
        addTx(d, { accountId: to.id, desc: 'Transfer from ' + from.short + (memo ? ' — ' + memo : ''), category: 'Transfer', type: 'transfer', amount });
        persist();
        return { confirmation: confirmation(), from: from.name, to: to.name, amount };
      }, true);
    },

    getPayees() { return call((d) => d.payees); },

    addPayee(req) {
      return call((d) => {
        const name = String(req.name || '').trim();
        const acct = String(req.accountNumber || '').replace(/\s/g, '');
        if (!name) throw new ApiError('Enter the payee’s name.', 'name');
        if (!/^\d{4,17}$/.test(acct)) throw new ApiError('Account numbers are 4 to 17 digits.', 'accountNumber');
        if (d.payees.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new ApiError('You already have a payee with that name.', 'name');
        const p = { id: genId(d, 'p'), name, accountNumber: acct };
        d.payees.push(p);
        persist();
        return p;
      });
    },

    getScheduled() {
      return call((d) => d.scheduled.slice().sort((a, b) => (a.date < b.date ? -1 : 1)));
    },

    payBill(req) {
      return call((d) => {
        const payee = d.payees.find((p) => p.id === req.payeeId);
        if (!payee) throw new ApiError('Choose a payee.', 'payee');
        const from = account(d, req.from);
        const amount = Number(req.amount);
        const date = req.date || today();
        if (!Number.isInteger(amount) || amount <= 0) throw new ApiError('Enter an amount greater than $0.00.', 'amount');
        if (date < today()) throw new ApiError('Choose today or a future date.', 'date');
        if (date === today()) {
          if (amount > from.balance) throw new ApiError('Insufficient funds in ' + from.name + '.', 'amount');
          from.balance -= amount;
          addTx(d, { accountId: from.id, desc: payee.name, category: 'Bills', type: 'billpay', amount: -amount });
          persist();
          return { status: 'sent', confirmation: confirmation(), payee: payee.name, amount, date };
        }
        const s = { id: genId(d, 's'), payeeId: payee.id, from: from.id, amount, date };
        d.scheduled.push(s);
        persist();
        return { status: 'scheduled', confirmation: confirmation(), payee: payee.name, amount, date };
      }, true);
    },

    cancelScheduled(id) {
      return call((d) => {
        const i = d.scheduled.findIndex((s) => s.id === id);
        if (i < 0) throw new ApiError('That payment was not found.');
        d.scheduled.splice(i, 1);
        persist();
        return { ok: true };
      }, true);
    },

    resetData() {
      return call(() => {
        db = window.LeapData.seed();
        persist();
        return { ok: true };
      });
    }
  };

  window.LeapApi = api;
})();
