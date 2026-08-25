# Context

The shared vocabulary for this project. Terms are defined here and used with exactly this
meaning in code, in the database, and in conversation.

This is a glossary, not a specification. It records what words mean, not how anything is
built. Implementation decisions belong in `docs/adr/`.

---

## Pool

The shared pot of money that Ariq and Ika spend from together. Also called the **kas**.

The Pool is **notional**: it is a running total in this ledger, not a bank account with a
balance you could go and check. Nothing reconciles it against real money anywhere.

## Member

A person who funds the Pool and spends from it. There are exactly two: **Ariq** and **Ika**.

Ika also appears in historical records as *Rizka*, and as *Pacarnya Ariq*. These are the same
person, not a third member.

## Contribution

Money a Member moves **into** the Pool.

A Contribution is **not income**. It is funding — money that was already that person's,
moved from their own pocket into the shared one. Treating a top-up as income would make
"net cashflow" mean "did the Pool run dry this cycle", which is a different and much smaller
question than "did we earn more than we spent". This ledger has never contained anyone's
actual income and does not attempt to.

A Contribution can be **negative**, which is how funding is taken back out of the Pool
without being recorded as spending.

## Expense

Money leaving the Pool for shared spending. The only kind of entry that carries a Category.

## Settlement

Money arriving from **outside** the Pool that repays a specific Expense — a friend paying you
back for their concert ticket.

Distinct from a Contribution: a Contribution is a Member funding the Pool, a Settlement is an
outsider reimbursing it.

## Reimbursement

The link between one Expense and the Settlement(s) that repaid it.

A Reimbursement carries **an amount**, because repayment is often partial. A 1,794,000
purchase with 900,000 repaid leaves 894,000 that genuinely was shared spending and must still
count against a budget.

Reimbursed money is excluded from spending analytics and budget consumption, but still moves
the Pool Balance — it really did leave and really did come back, and both movements exist as
their own entries.

## Cycle

The budget period. Runs from the anchor day of one month to the day before the anchor day of
the next: with the default anchor of 25, a Cycle runs 25 January to 24 February.

Cycles follow the money rather than the calendar, because the Pool refills when the two of
them top it up — historically somewhere between the 18th and the 26th, most often the 25th.

The anchor is capped at 28. A 29th, 30th or 31st does not exist in every month, and every
rule for handling that makes some Cycle a different length for a reason nobody would
remember later.

## Pool Balance

Contributions plus Settlements, minus Expenses, over all time.

The headline number. Negative is normal in the days before a top-up lands.

## Burn Rate

Non-reimbursed Expenses per elapsed day in the current Cycle. Feeds the projected date the
Pool runs dry.

## Merchant

A canonical business — `Sei-Rock Ya`, `Chagee`. Owns the set of spellings that mean it, and
the Category it usually implies.

## Place

A canonical venue — `Grand Indonesia`, `MKG`. Owns its spellings. Optional on an Expense, and
never required, so it cannot slow down entry.

Distinct from a Merchant: `Sushi Tei` is the Merchant, `Grand Indonesia` is the Place.

---

## Retired terms

Words from the original spreadsheet that are deliberately **not** used any more, because each
meant two different things:

| Retired | Why | Use instead |
|---|---|---|
| **Pemasukan** ("income") | Every row under this heading was a kas top-up. None of it was income. | Contribution |
| **Sisa Uang** | Meant this-month net on the monthly sheets, but all-time cumulative balance on the Overview sheet. | Pool Balance, or Cycle Net |
| **Jenis Pengeluaran** | Had degenerated into a catch-all: `Makan` covered 75% of rows and contained a cinema ticket and a locker. | Category |
