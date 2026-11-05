/* Leap Bank demo — seed data. Fictional bank, fake data. */
(function () {
  'use strict';

  // Deterministic PRNG so every reset produces the same data set.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function isoDaysFromToday(n) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + n);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  const MERCHANTS = [
    // name, category, min cents, max cents (negative = money out)
    ['Harbor Grocers', 'Groceries', -4000, -12500],
    ['Corner Coffee Co.', 'Dining', -450, -950],
    ['Metro Transit', 'Transport', -275, -3300],
    ['Bookshop on 3rd', 'Shopping', -1500, -6000],
    ['Riverside Pharmacy', 'Health', -800, -4500],
    ['Lantern Thai Kitchen', 'Dining', -2200, -6500],
    ['Northwind Hardware', 'Home', -1200, -9000],
    ['Cinema Paloma', 'Entertainment', -1400, -3200]
  ];

  function seed() {
    const rand = mulberry32(20261104);
    const accounts = [
      { id: 'chk', name: 'Everyday Checking', short: 'Checking', mask: '4417', type: 'checking', balance: 418236 },
      { id: 'sav', name: 'High-Yield Savings', short: 'Savings', mask: '9021', type: 'savings', balance: 1894000 },
      { id: 'card', name: 'Travel Card', short: 'Card', mask: '1188', type: 'credit', balance: -61209, limit: 800000 }
    ];

    const transactions = [];
    let n = 1;
    const push = (t) => transactions.push(Object.assign({ id: 't' + (n++) }, t));

    for (let d = 0; d < 90; d++) {
      const date = isoDaysFromToday(-d);
      if (d % 14 === 3) push({ date, accountId: 'chk', desc: 'Payroll deposit — Lumen Studio', category: 'Income', type: 'deposit', amount: 312000 });
      if (d % 30 === 5) push({ date, accountId: 'sav', desc: 'Interest earned', category: 'Interest', type: 'interest', amount: 6127 });
      if (d % 30 === 9) push({ date, accountId: 'chk', desc: 'StreamBox subscription', category: 'Subscriptions', type: 'purchase', amount: -1599 });
      if (d % 30 === 12) push({ date, accountId: 'chk', desc: 'City Power & Light', category: 'Bills', type: 'billpay', amount: -14218 });
      const count = Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        const m = MERCHANTS[Math.floor(rand() * MERCHANTS.length)];
        const amount = Math.round(m[2] + (m[3] - m[2]) * rand());
        push({ date, accountId: rand() < 0.6 ? 'card' : 'chk', desc: m[0], category: m[1], type: 'purchase', amount });
      }
    }
    transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    return {
      version: 1,
      user: { firstName: 'Alex', name: 'Alex Rivera', email: 'demo@leapbank.test', password: 'demo1234' },
      failedLogins: 0,
      accounts,
      transactions,
      nextTxId: n,
      payees: [
        { id: 'p1', name: 'City Power & Light', accountNumber: '88412231' },
        { id: 'p2', name: 'Metro Water Authority', accountNumber: '50017764' },
        { id: 'p3', name: 'Northside Mobile', accountNumber: '3309912045' }
      ],
      scheduled: [
        { id: 's1', payeeId: 'p2', from: 'chk', amount: 6450, date: isoDaysFromToday(6) }
      ],
      nextId: 100
    };
  }

  window.LeapData = { seed, isoDaysFromToday };
})();
