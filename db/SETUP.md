# Putting this on a real database

Until this is done the app runs exactly as it always has: everything
in one browser, and **a customer's order on their phone is invisible
to the shop**. That is the one thing this fixes.

The app stays on GitHub Pages. Supabase is only the database behind
it — there is no server to run and no monthly bill.

---

## 1. Make the project

[supabase.com](https://supabase.com) → **New project**.

- **Region: Mumbai (ap-south-1).** Not a detail. Every query from a
  Borivali phone crosses to wherever this sits and back; Mumbai is
  ~20 ms and Virginia is ~250 ms, which is the difference between the
  board ticking and the board lagging.
- Save the database password somewhere. It is not used by the app, and
  it cannot be recovered.

## 2. Create the tables

**SQL Editor** → paste all of `db/schema.sql` → **Run**.

It is safe to run twice. It makes five tables — `staff`, `addresses`,
`orders`, `order_lines`, `runs` — and the rules that decide who may
read what.

The catalogue is deliberately **not** in there. All 115 products, the
prices, the categories and the delivery windows stay in
`app/data/*.json` in git, edited with `tools/setprice.pl` and checked
by `tools/data.pl`. They are the same for everybody and they do not
need a database.

## 3. Turn on anonymous sign-in

**Authentication → Sign In / Providers**:

- **Anonymous sign-ins: on.** Every visitor gets a session silently,
  so nobody is asked to log in to buy groceries. It is what gives each
  order an owner.
- **Email: on.**
- **Manual linking: on.** This is what lets somebody who has been
  shopping anonymously attach their email later and *keep* the
  addresses they already saved, instead of starting again on a fresh
  account.

Then **Authentication → Emails → Templates → Magic Link**, and make
sure the body contains `{{ .Token }}`. If it contains
`{{ .ConfirmationURL }}` instead, Supabase sends a *link* rather than
a six-digit code, and the app is built for the code.

## 4. Make email actually reach customers

⚠️ **Supabase's built-in email sender only delivers to your own team**
and is capped at a couple of messages an hour. Left alone, every
customer reports "the code never came".

[resend.com](https://resend.com) → sign up → **SMTP** → copy the host,
port, user and password into **Supabase → Project Settings →
Authentication → SMTP Settings**. Free tier is about 3,000 emails a
month, which is far more sign-ins than this shop will ever have.

Then **Authentication → Rate Limits** and raise the hourly cap, which
stays at 30 new users/hour even with your own SMTP.

## 5. Point the app at it

**Project Settings → API**, then into `app/config.js`:

```js
export const SUPABASE = {
  url: 'https://xxxxxxxx.supabase.co',
  key: 'eyJ...',            // the anon / publishable key
};
```

**Both of these belong in client code and neither is a secret.** The
key identifies the project and nothing else; what protects the data is
the rules in `schema.sql`, which run on the server where nobody can
edit them. A key in a browser is only a secret if the server trusts
it, and this one is not trusted.

Leave `url` empty and the app falls straight back to one-browser mode,
which is what keeps `perl tools/serve.pl 8110 app` working with no
project at all.

## 6. Make Milan staff

He signs in once in the app with his email. Then **Authentication →
Users**, copy his UUID, and in the SQL editor:

```sql
insert into staff (user_id) values ('paste-his-uuid-here');
```

Until that row exists the Store view shows nothing, because the rules
hand out other people's orders to staff and to nobody else.

**This is the real lock.** The six-digit code in the app stops someone
tapping Store on a phone; it runs in a browser the customer owns and
can never be more than that. This row is the one the server enforces.
Both are worth having and they do different jobs.

---

## What it costs

Nothing, on the free tier: two projects, 500 MB each, 50,000 users a
month. This shop will not approach any of it.

⚠️ **A free project pauses after 7 days with no activity** and has to
be restored by hand from the dashboard. A shop taking orders daily
never hits that; a quiet fortnight of testing does. Pro is $25/month
and removes it — worth it once real customers depend on the app, not
before.

## What is still true afterwards

- **`paid` is a note, not an observation.** UPI sends no callback to a
  page. The shop's own UPI app stays the source of truth.
- **The UPI id is still the demo one** (`demo.not.real@example`), which
  cannot resolve, so money cannot move. See CLAUDE.md to go live.
- **Prices are illustrative** until somebody walks the shelves with
  `tools/pricelist.pl`.
