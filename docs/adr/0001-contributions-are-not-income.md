# 1. Contributions are not income

Date: 2026-08-22

## Status

Accepted

## Context

The source spreadsheet has two columns per month: `Pengeluaran` (expense) and `Pemasukan`
(income). Read naively, that is a normal personal-finance ledger, and the obvious app to
build on top of it shows income versus expense with a net figure.

But every one of the 58 rows under `Pemasukan` is a kas top-up: `Kas Ariq` 700,000,
`Kas Ika` 500,000, month after month. Not one row is anybody's salary. The two of them each
move a fixed sum from their own money into a shared pot, and the ledger tracks what the pot
buys.

So "income minus expense" here does not answer *did we earn more than we spent*. It answers
*did the shared pot cover the month* — a much narrower question wearing the same clothes. The
ledger has never contained either person's actual income and there is no plan for it to.

The requested feature list asked for "income vs. expense overview with clear net cashflow",
which is the naive reading, and building it that way would have produced a number that looks
authoritative and means something else.

## Decision

Model the shared pot explicitly as a **Pool**, and money entering it as a **Contribution**,
which is distinct from income.

The headline figure is **Pool Balance** — Contributions plus Settlements minus Expenses —
alongside a **Burn Rate** and a projected run-dry date. There is no income-versus-expense
view, because there is no income.

The database enforces the distinction: a Contribution must have a Member and must not have a
Category, so it can never be counted as spending, and an Expense must have a Category, so it
can never be mistaken for funding.

## Consequences

**Good.** Every number the app shows means what its label says. Budgets consume Expenses
only. "How long until the kas runs out" is answerable, and is the question actually being
asked several times a month.

**Bad.** The app cannot answer "are we saving money overall", because it does not know what
either person earns. Anyone expecting a conventional finance app will find that missing.

**Reversibility: poor.** Adding real income later means a new entry kind, new constraints,
and a second headline metric alongside Pool Balance. The concepts would coexist rather than
one replacing the other, which is more work than it sounds.

If personal income is ever wanted, it is a new kind of entry — not a redefinition of
Contribution.
