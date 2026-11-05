# Leap Bank (demo)

A fictional online bank built as a test target. All data is fake, and nothing leaves the browser.

**Live:** https://steve-antimatter.github.io/leap-bank-app/
**Sign in:** `demo@leapbank.test` / `demo1234`

## Features

- **Sign in.** Five wrong passwords lock the account until the demo data is reset.
- **Accounts:** Everyday Checking, High-Yield Savings and a Travel Card (credit), with total available funds and a recent-activity list. Each account has its own transaction history.
- **Activity:** 90 days of transactions with search (payee, category or amount) and filters for account, type and period.
- **Transfer money** between accounts, with an optional memo. Validation covers insufficient funds, a $25,000 daily limit, same-account transfers, and paying more than a card's balance. A confirmation number is shown on success.
- **Bill pay:** pay a saved payee today or schedule a future payment, cancel scheduled payments, and add payees (account numbers are 4–17 digits).
- **Profile:** view details and reset all demo data.

## How it's built

A static site (HTML, CSS and JavaScript, no build step). `app/api.js` is a mock backend that stores data in the browser's `localStorage` and adds realistic latency to every call. `app/data.js` seeds the same starting data on every reset.

## Run locally

```bash
cd app && python3 -m http.server 8080
# open http://localhost:8080/#login
```
