# Deployment & Production Guide

Cadence compiles to a purely static bundle in `dist/` with no server runtime or environment variables required.

---

## Deploying to Vercel

Cadence includes a production-ready [`vercel.json`](../vercel.json):

- **Framework Preset**: `vite`
- **Install Command**: `npm install`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Node.js Version**: `>= 20.0.0` (declared in `package.json` `engines`)

### Steps
1. Push the repository to GitHub, GitLab, or Bitbucket.
2. Import the repository in the Vercel dashboard.
3. Keep the detected defaults (no environment variables are needed) and click **Deploy**.

---

## Security & Browser Permission Headers

Because Cadence uses local webcam framing, microphone Voice Activity Detection, and fullscreen stage mode, `vercel.json` configures explicit headers for production hosting:

| Header | Value | Purpose |
| :--- | :--- | :--- |
| `Permissions-Policy` | `camera=(self), microphone=(self), fullscreen=(self)` | Explicitly enables camera, mic, and fullscreen on the app origin only |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `X-Frame-Options` | `SAMEORIGIN` | Prevents third-party clickjacking embeds |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Cache-Control` (`/assets/*`) | `public, max-age=31536000, immutable` | Long-lived caching for content-hashed Vite bundles |

> **HTTPS Note:** Browsers require a secure context (`https://` or `http://localhost`) to grant access to `navigator.mediaDevices.getUserMedia` (webcam and microphone). Standard Vercel preview and production URLs serve HTTPS automatically.

---

## Static Hosting Elsewhere (Netlify, Cloudflare Pages, GitHub Pages)

Any static host works out of the box:

```bash
npm install
npm run build
```

Deploy the resulting `dist/` directory and configure a single-page app fallback rewrite to `/index.html` while keeping static assets (`/assets/*`, favicons, `site.webmanifest`, `robots.txt`) served directly.

---

## Favicons, PWA Manifest & Social Cards

All production icons and metadata live in [`public/`](../public/) and are wired in [`index.html`](../index.html):

- `favicon.svg` (adaptive light/dark vector favicon)
- `favicon.ico` and `favicon-32x32.png`
- `apple-touch-icon.png` (180x180)
- `icon-192.png` and `icon-512.png` (referenced by `site.webmanifest`)
- `og-image.png` (1200x630 OpenGraph and Twitter social preview card)
- `robots.txt`
