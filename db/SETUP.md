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
  the board ticking and the board lagging. The region **cannot be
  changed afterwards**.
- Save the database password somewhere. The app never uses it and it
  cannot be recovered.

Three checkboxes under **Security**, and the middle one is the one
that bites:

| | | |
|---|---|---|
| **Enable Data API** | **on** | What `supabase-js` talks to. Off, the app connects and then nothing works. |
| **Automatically expose new tables** | **off** | Supabase's own advice. `schema.sql` grants each table explicitly instead, so nothing is ever reachable because somebody forgot it was. |
| **Enable automatic RLS** | **on** | A belt to the schema's braces. Every table here enables RLS by hand; this makes a table added *later* fail shut rather than open. |

⚠️ **Off and without the grants at the foot of `schema.sql`, nothing
works** — because a grant and a policy are different things. The grant
decides whether a role may reach a table at all; the policy decides
which rows. Perfect policies with no grant answer every query with
*permission denied for table*, and only the policy half is visible in
the table editor.

**Advanced configuration** needs nothing. Take whatever Postgres
version it offers.

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

## 4. Email — and this is NOT optional — 10 min

⚠️ **Supabase will not let you edit an email template until custom
SMTP is set up.** Free projects were locked out of template editing
around June 2026, and the page says so in as many words: *"Set up
custom SMTP to edit templates."*

That matters here because an unedited template sends a **sign-in
link**, and this app is built for a **six-digit code**. Which of the
two Supabase sends is decided entirely by the template body:
`{{ .ConfirmationURL }}` gets a link, `{{ .Token }}` gets a code.
No SMTP, no code.

A code is the right answer for a shop on phones, which is why this is
worth ten minutes rather than a change of plan. A magic link opens in
whatever browser the email app hands it to — often an in-app browser
that is not where the basket is — and signs the customer in somewhere
they are not standing.

### Brevo — free, 300 emails a day, no domain required

1. [brevo.com](https://www.brevo.com) → sign up.
2. **Senders** → add the address the codes should come from. Brevo
   emails it a confirmation link; click it. A plain Gmail address
   works — customers will see the code coming from it, which for a
   kirana is normal. A domain (~₹800/year) looks tidier and delivers
   better, later.
3. [app.brevo.com/settings/keys/smtp](https://app.brevo.com/settings/keys/smtp)
   → copy the **SMTP login** shown there and **generate an SMTP key**.

   ⚠️ An **SMTP key**, not an API key — they look alike and the wrong
   one fails with *535 Authentication failed*. The key is shown
   **once**, so paste it somewhere before leaving the page.

4. [Supabase → Authentication → SMTP](https://supabase.com/dashboard/project/_/auth/smtp):

   | | |
   |---|---|
   | Host | `smtp-relay.brevo.com` |
   | Port | `587` |
   | Username | the SMTP login from step 3 — your account email, or something like `9a1b2c@smtp-brevo.com`. **Copy what the page shows**; it differs by when the account was made. |
   | Password | the SMTP key |
   | Sender email | the address verified in step 2 |
   | Sender name | Milan's Super Shoppe |

5. [Authentication → Rate Limits](https://supabase.com/dashboard/project/_/auth/rate-limits)
   → raise the email cap. It sits at **30 new users per hour** even
   with your own SMTP.

If Brevo insists on a verified **domain** rather than an address,
Gmail's own SMTP works as a fallback — `smtp.gmail.com`, port 587,
your address, and an **app password** (needs 2-step verification on
the Google account). About 500 a day, which this shop will not reach.

## 5. Make the email carry a code, not a link — 2 min

Now that SMTP is set, the templates unlock.

⚠️ **There are TWO of them to edit, and editing one is why no code
arrives.** Which template Supabase sends is decided by which call the
app made, and this app makes both:

| what the customer is doing | the call | the template |
|---|---|---|
| signing in for the first time, on the phone they have been browsing on | `updateUser({ email })` | **Change Email Address** |
| signing in again on a second phone, or after signing out | `signInWithOtp()` | **Magic Link / OTP** |

The first one is the common case and the surprising one. Every
visitor to this app already has a session, anonymously, from their
first tap — that is what lets them save an address and order without
signing in. Signing in therefore does not *create* a user, it attaches
an email to the one they already are, so that the addresses they have
already saved stay theirs. Supabase calls that an email change, and
sends the **Change Email Address** template.

So edit **both**, at
[Authentication → Emails](https://supabase.com/dashboard/project/_/auth/templates),
each one's **Source** tab, with the same body:

```html
<h2>Your sign-in code</h2>
<p><strong>{{ .Token }}</strong></p>
<p>It expires in an hour. If you did not ask for it, ignore this.</p>
```

Subject: `Your sign-in code`.

⚠️ **`{{ .ConfirmationURL }}` must not be left in either body.** That
one variable is what decides whether the mail carries a link or a
code, and a body holding both sends the link. A link is the wrong
answer on a phone: it opens in whatever browser the mail app hands it
to, often an in-app one that is not where the basket is, and signs the
customer in somewhere they are not standing.

⚠️ **Turn OFF "Secure email change"** at
[Authentication → Sign In / Providers → Email](https://supabase.com/dashboard/project/_/auth/providers).
With it on, an email change generates **two** codes — one to the old
address and one to the new — and expects both. Nobody signing into
this app has an old address, so the second code is never needed; off
is one less thing that can half-happen.

**The body deliberately does not name the shop.** One Supabase project
has one sender and one set of templates, so the moment there are two
shops this mail cannot speak for either. It is a code for the
platform. See `db/MULTISTORE.md`.

## 6. Copy two values — 1 min

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

## 7. Make Milan staff — 1 min, *after* the app is wired

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

## Changing the order prefix — for a project that already exists

Order codes are `M-0007`. The letter lives in **two** places and they
have to agree:

- `orderPrefix` in `app/data/shop.json`
- the generated column in `db/schema.sql`

It is written twice because Postgres mints the code in a `generated
always as` column, and a generated column cannot read a JSON file.
`tools/data.pl` fails if the two drift, which is the only thing
stopping the app numbering orders one way and the database another.

A project created from the current `schema.sql` already has the right
letter. One created earlier has `K-`, and `create table if not
exists` will not change it. To move it:

```sql
alter table orders drop column code;
alter table orders add column code text
  generated always as ('M-' || lpad(seq::text, 4, '0')) stored;
```

⚠️ **Only do this while the table is EMPTY.** The column is
`generated always`, so recreating it recomputes **every** row — an
order the customer knows as K-0005 would silently become M-0005, and
the code they are reading down the phone would no longer be in the
system. With real orders in the table, leave the old ones alone and
change the letter only for a new shop.

To start the numbering over as well, on an empty table:

```sql
alter sequence order_seq restart with 1;
```

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
