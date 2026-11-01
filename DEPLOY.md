# Where this is published

**Live at <https://jinaynandu.github.io/kirana/>**, from the `main`
branch of <https://github.com/JinayNandu/kirana>.

GitHub Pages serves the repository root, so the root `index.html` is a
redirect and the app itself is in `app/` -- `tools/` and `parked/` are
not things to publish.

## To update it

```bash
git add -A && git commit -m "what changed" && git push
```

Pages rebuilds by itself, usually within a minute. There is no build
step on either side: the repository holds exactly the files a browser
is served.

## Why it is hosted at all

Not for the URL. **The browser refuses to share a location with a page
shown inside somebody else's frame**, which is what a preview or an
embedded viewer is, so the "Use my location" button could never work
there however it was written. On its own web address the same code
works with nothing changed.

The app says which of the two it is in, rather than leaving anyone to
guess: **Settings -> Location** reads *available on this device* here
and *not available here (preview)* in an embedded copy.

## Three things that are load-bearing

- **`.nojekyll`** -- without it GitHub runs the files through Jekyll,
  which silently refuses to serve anything whose name begins with an
  underscore. Nothing here does today; the file is there so that
  adding one later does not quietly 404.
- **`.gitattributes` pinning `eol=lf`** -- Git on Windows otherwise
  rewrites checked-out files to CRLF, and a shebang line ending in CR
  breaks the Perl scripts in `tools/` the moment one runs anywhere but
  the machine it was written on.
- **Every path in the app is relative** (`./data/...`, `./img/...`),
  which is what lets it work at `/kirana/app/` as well as at a bare
  domain. Do not make them absolute.

## The repository is public

Pages on a free account requires it. The shop's name, address and
phone sit in `app/data/shop.json` and are readable by anyone -- which
for a shop's own delivery app is the point, but it is worth knowing
rather than discovering.

Nothing secret is committed. `app/secrets.js` is gitignored for the
day the Supabase swap happens, and the UPI id in `shop.json` is the
deliberate demo one (`@example` is not a real payment handle, so no
app can resolve it and money cannot move).

## Moving it to a real domain later

Buy the domain, add a `CNAME` file at the repository root holding just
the hostname, and point a DNS `ALIAS`/`ANAME` at
`jinaynandu.github.io`. Pages picks it up and issues the certificate.
Nothing in the app changes.
