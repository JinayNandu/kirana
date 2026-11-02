# Putting this on a real database

Until this is done the app runs as it always has: everything in one
browser, and **a customer's order on their phone is invisible to the
shop**. That is the one thing this fixes.

The app stays on GitHub Pages. Supabase is only the database behind
it — no server to run, no monthly bill.

Every link below contains `_`, which Supabase resolves to your
project. Sign in first and they go straight to the right page.

---

## 1. Make the project — 2 min

[supabase.com/dashboard](https://supabase.com/dashboard) → **New
project**.

- **Region: Mumbai (ap-south-1).** Not a detail. Every query from a
  Borivali phone crosses to wherever this sits and back — Mumbai is
  about 20 ms, Virginia about 250 ms. That is the difference between
  the board ticking and the board lagging.
- Save the database password somewhere. The app never uses it and it
  cannot be recovered.

## 2. Create the tables — 1 min

[SQL Editor](https://supabase.com/dashboard/project/_/sql/new) →
paste all of
[`db/schema.sql`](https://github.com/JinayNandu/kirana/blob/main/db/schema.sql)
→ **Run**.

Safe to run twice. It makes five tables — `staff`, `addresses`,
`orders`, `order_lines`, `runs` — and the rules deciding who may read
what. Expect *"Success. No rows returned."*

The catalogue is deliberately **not** in there. The 115 products,
prices, categories and delivery windows stay in `app/data/*.json` in
git, edited with `tools/setprice.pl` and checked by `tools/data.pl`.
They are the same for everybody and need no database.

## 3. Three auth switches — 2 min

[Authentication → Sign In / Providers](https://supabase.com/dashboard/project/_/auth/providers)

| | |
|---|---|
| **Anonymous sign-ins** | **on** — every visitor gets a session silently, so nobody is asked to log in to buy groceries and every order has an owner |
| **Email** | **on** |
| **Allow manual linking** | **on** — lets somebody shopping anonymously attach their email later and **keep the addresses they already saved** instead of starting again on a fresh account |

## 4. Make the email carry a code, not a link — 1 min

[Authentication → Emails → Templates](https://supabase.com/dashboard/project/_/auth/templates)
→ **Magic Link**.

The body must contain **`{{ .Token }}`**. If it contains
`{{ .ConfirmationURL }}`, Supabase sends a *link* instead of a
six-digit code, and this app is built for the code.

A body of `Your code is {{ .Token }}` is enough.

## 5. Copy two values — 1 min

[Settings → API Keys](https://supabase.com/dashboard/project/_/settings/api-keys/)

- **Project URL** — `https://xxxxxxxx.supabase.co`
- **Publishable key** — begins `sb_publishable_…`
  (an older project may show a legacy **anon** key beginning `eyJ…`
  instead; either works)

Into `app/config.js`:

```js
export const SUPABASE = {
  url: 'https://xxxxxxxx.supabase.co',
  key: 'sb_publishable_...',
};
```

⚠️ **Never the secret key** (`sb_secret_…`, or the legacy
`service_role`). It carries `BYPASSRLS`, which means it ignores every
rule in `schema.sql` — it must never reach a browser, a repository, or
a chat window. Supabase's own guide says it "must never" go in
"a browser, a shipped application, or source control".

The publishable key, by contrast, **belongs** in client code. It
identifies the project and nothing else. What protects the data is the
rules in `schema.sql`, running on the server where nobody can edit
them. A key in a browser is only a secret if the server trusts it, and
this one is not trusted.

Leave `url` empty and the app falls straight back to one-browser mode,
which keeps `perl tools/serve.pl 8110 app` working with no project at
all.

## 6. Make Milan staff — 1 min, *after* the app is wired

He signs in once in the app with his email. Then
[Authentication → Users](https://supabase.com/dashboard/project/_/auth/users),
copy his UUID, and in the SQL editor:

```sql
insert into staff (user_id) values ('paste-his-uuid-here');
```

Until that row exists **the Store view shows nothing**, because the
rules hand out other people's orders to staff and to nobody else.

**This is the real lock.** The six-digit code in the app stops someone
tapping Store on a phone; it runs in a browser the customer owns and
can never be more than that. This row is the one the server enforces.
Both are worth having and they do different jobs.

---

## Email: you can skip this until real customers

⚠️ **Supabase's built-in sender only delivers to your own team** — the
addresses on the project — and is capped at a couple of messages an
hour. That is *enough to test with your own email* and useless for
customers, who would all report that the code never arrived.

When it is time, [Authentication → SMTP](https://supabase.com/dashboard/project/_/auth/smtp)
wants a host, port, user, password and a From address. Two free
options, and the choice turns on whether the shop has a domain:

| | |
|---|---|
| **Brevo** | 300 emails/day free. **No domain needed** — it verifies a single From address by emailing it a confirmation link, so a Gmail address works. Adds its own logo to free-plan mail. |
| **Resend** | ~3,000/month free, cleaner mail, but **requires a verified domain** (`smtp.resend.com`, port 587, username literally `resend`, password = your API key). |

Then raise the cap at
[Authentication → Rate Limits](https://supabase.com/dashboard/project/_/auth/rate-limits):
it starts at **30 new users per hour** even with your own SMTP.

## What it costs

Nothing on the free tier: two projects, 500 MB each, 50,000 users a
month. This shop will not approach any of it.

⚠️ **A free project pauses after 7 days with no activity** and must be
restored by hand from the dashboard. A shop taking orders daily never
hits that; a quiet fortnight of testing does. Pro is $25/month and
removes it — worth it once real customers depend on the app, not
before.

## What is still true afterwards

- **`paid` is a note, not an observation.** UPI sends no callback to a
  page. The shop's own UPI app stays the source of truth.
- **The UPI id is still the demo one** (`demo.not.real@example`), which
  cannot resolve, so money cannot move. See CLAUDE.md to go live.
- **Prices are illustrative** until somebody walks the shelves with
  `tools/pricelist.pl`.
- **Nobody who speaks Marathi or Hindi has read the strings.**
