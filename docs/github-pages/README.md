# GitHub Pages for Cashenza custom-bundle

This folder contains a simple static site for the public legal pages:

- `index.html`
- `privacy.html`
- `terms.html`
- `styles.css`

## Fastest publish flow

1. Create a public GitHub repository if needed
2. Push this project to GitHub
3. In GitHub, open `Settings -> Pages`
4. Under `Build and deployment`, choose:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - `Folder`: `/docs/github-pages`
5. Save

GitHub Pages will publish these files on a URL similar to:

`https://YOUR_USERNAME.github.io/YOUR_REPO/`

Then your final legal URLs will be:

- `https://YOUR_USERNAME.github.io/YOUR_REPO/privacy.html`
- `https://YOUR_USERNAME.github.io/YOUR_REPO/terms.html`

## What to paste into Shopify

Once published, use:

- Privacy Policy URL: your `privacy.html` URL
- Terms of Service URL: your `terms.html` URL

