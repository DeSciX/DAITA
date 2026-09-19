# Credits

Running AI is what the platform actually spends money on, so that is what it meters. Everything
here is billed in **USD credits**, by actual usage, the way an AI API bills.

## You can start without buying anything

Two credits arrive without a purchase, and they behave differently.

A **one-time welcome credit** is granted when your account finishes setup — connecting the
connector, or signing in from the CLI. You do not claim it; the platform grants it at the moment it
sees you finish, once per account. It is paid from a shared sponsored pool, so if that pool is empty
or has reached its limit for the day the grant is declined and the platform says so rather than
failing quietly.

A **free daily credit applies automatically to your first metered call each day**, and renews the
next day. There is nothing to enable.

One thing that surprises people: the daily credit is not held in your balance beforehand — it is
applied at the moment you use it. So a balance of **$0.00** does not mean you cannot make a call.
`get_credit_balance` tells you both positions:

```
get_credit_balance({})
→ { usd_balance, daily_free_credit_usd, daily_free_credit_available_today, ... }
```

## What costs credits, and what doesn't

| | |
|---|---|
| Connecting the connector | free |
| `tell_me_how` discovery | free |
| Browsing communities and apps | free |
| Asking an app's knowledge base | metered |
| Retrieving source chunks | flat-rate per query |

Metering is per actual token usage of the call you made. Every answer returns its own usage
figures, so the cost of a call is visible on the call itself rather than inferred from a bill.

## Topping up

You can buy credits by card. **$1 bought is $1 of credit** — the purchase is one-to-one, and
there is no markup at the point of purchase.

```
tell_me_how({ question: "buy AI credits" })
```

## Every movement is auditable

Credits are an append-only ledger, not a number that changes silently. You can read your own
history at any time:

```
execute_remote_command({ command: "get_credit_history", params: { limit: 40 } })
```

Every grant, debit and purchase is a row with its own entry id. Grants are double-entry: the pool
is debited by exactly what your balance is credited.

## The shared pool

Free daily credits are paid from a **shared sponsored pool**, not printed. When the pool is empty
the platform says so plainly rather than failing obscurely — and buying credits still works.

The pool is designed to be funded by community-token purchases from the treasury: proceeds flow
into the same pool that pays everyone's free daily credit. That is the intended flywheel — the
people buying into a community underwrite the AI usage of everyone exploring it.

<sub>Stated as design, not as a running fact: the mechanism is built and wired end to end, but no
token sale has yet funded the pool in production.</sub>

## What is not here yet

Earning mechanics — contribution standing, referrals, and airdrops — are being reworked and are
deliberately not documented here. They will be described once they behave the way this page
describes credits: verifiable by you, on your own account, with a command you can run.
