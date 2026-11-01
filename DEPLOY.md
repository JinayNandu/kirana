# Putting this on the web

The app is static files with no build step, so any static host serves
it as-is. These are the steps for GitHub Pages.

**Why bother:** the browser refuses to share a location with a page
shown inside somebody else's frame, which is what a preview is. On its
own web address the "Use my location" button starts working with no
change to the code. Settings says which of the two you are looking at.

## Once, to publish

```bash
# 1. Create an EMPTY repo on github.com called "kirana" -- no README,
#    no .gitignore, nothing, or the first push is rejected as diverged.

# 2. Point this folder at it and push. Replace the name if yours differs.
git remote add origin https://github.com/<your-username>/kirana.git
git push -u origin main
```

Then, in the repo on github.com: **Settings -> Pages ->
Source: Deploy from a branch -> Branch: `main`, folder: `/ (root)`**,
and Save. The first build takes a minute or two.

The address is `https://<your-username>.github.io/kirana/`. The root
`index.html` sends that straight on to `app/`, which is where the app
actually lives -- `tools/` and `parked/` are not things to publish.

## Afterwards, to update it

```bash
git add -A && git commit -m "what changed" && git push
```

Pages redeploys by itself within a minute.

## Two things to know

- **The repo is public**, because Pages on a free account requires it.
  The shop's name, address and phone are in `app/data/shop.json` and
  will be readable by anyone. For a shop's own delivery app that is
  the point, but it is worth deciding rather than discovering.
- **`.nojekyll` must stay.** Without it GitHub runs the files through
  Jekyll, which silently refuses to serve anything whose name starts
  with an underscore. Nothing here starts with one today; the file is
  there so that adding one later does not quietly 404.
