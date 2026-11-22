# Lucas Wahnon

A website for Lucas Wahnon’s web development and digital operations practice, plus a private admin area called Dive OS.

Public pages, in British English:

- Home — `/`
- Dive Centres — `/dive-centres`
- Local Services — `/local-services`

Dive OS lives at `/dive-os`. It is not linked from the public navigation, it is marked `noindex`, and it is disallowed in `robots.txt`.

## Stack

[Next.js](https://nextjs.org/) (App Router) on Node.js, with React and Auth.js (`next-auth` v5). The public pages are mostly static. The contact route and Dive OS need a server, so the app is **not** a static export (`output: "export"` is not set). Deploy it on Vercel. The Vercel project for this repository is **wahnon-website**.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint
npm run build
npm start
```

The public site runs without any environment variables. `/dive-os` stays closed until the variables below are set. There is no default password.

## Deploy

Push the repository. Vercel builds a Next.js app from the root (`npm run build`). Set the environment variables in **Vercel → wahnon-website → Settings → Environment Variables**, for Production and, if you want the admin on preview URLs, for Preview as well. Redeploy after changing them.

`NEXT_PUBLIC_SITE_URL` should be the canonical origin, for example `https://example.com`. If it is unset, metadata uses `VERCEL_PROJECT_PRODUCTION_URL` when Vercel provides it.

## Dive OS environment variables

Set these on the Vercel project. Do not commit real values. `.env.example` lists the same keys.

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUTH_SECRET` | Yes, before anyone can sign in | Signs the session cookie. Generate with `openssl rand -base64 32`. |
| `ADMIN_EMAIL` | For password sign-in | The only email that can sign in with a password. |
| `ADMIN_PASSWORD_HASH` | For password sign-in | bcrypt hash of the password. Not the password itself. |
| `AUTH_GITHUB_ID` | For GitHub sign-in | GitHub OAuth app client ID. |
| `AUTH_GITHUB_SECRET` | For GitHub sign-in | GitHub OAuth app client secret. |
| `ADMIN_GITHUB_LOGINS` | For GitHub sign-in | Comma-separated GitHub usernames. Anyone else is rejected. |
| `AUTH_URL` | No | Fixed site URL if Auth.js should not trust the request host. Trusting the host is already enabled. |
| `NEXT_PUBLIC_SITE_URL` | No | Canonical URL for titles, Open Graph and the sitemap. |

Password sign-in is enabled only when **both** `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` are set. GitHub sign-in is enabled only when **all three** GitHub variables are set. You can use either method, or both. If neither is set, the login page explains that and no one can enter.

Create the password hash from the project directory. This reads the password from stdin so it is less likely to land in shell history:

```bash
node --input-type=module -e "import { hash } from 'bcryptjs'; let s=''; process.stdin.setEncoding('utf8'); process.stdin.on('data', d => s += d); process.stdin.on('end', async () => console.log(await hash(s.replace(/\n$/,''), 12)))"
```

Type the password, press Enter, then Ctrl-D. Paste the printed hash into `ADMIN_PASSWORD_HASH`.

In a `.env` file, escape every `$` with a backslash. Next.js expands dollar signs, and quotes do not stop that:

```bash
ADMIN_PASSWORD_HASH=\$2b\$12\$...
```

In the Vercel dashboard, paste the hash on its own, with the dollar signs and without backslashes or quotes. Vercel stores the characters as typed. If sign-in says the hash is not a bcrypt hash, the dollar signs were lost.

For GitHub, create an OAuth app and set the callback URL to:

```text
https://<your-domain>/api/auth/callback/github
```

For local development use `http://localhost:3000/api/auth/callback/github`.

Sessions last 12 hours, are stored in an httpOnly cookie, and repeated failures from one address are slowed on that server instance. Use a long password anyway. That limit does not replace it.

Dive OS sections — Overview, Releases, Customers and Settings — are placeholders. They do not read or write centre data.

## Contact form

The form on the homepage posts to `POST /api/contact`. It checks the name, email, business, optional website, and what the business wants to improve.

If `CONTACT_WEBHOOK_URL` is unset, the server validates the message and tells the visitor that nothing was sent on. It does not store the message or send email.

To deliver messages, set:

| Variable | Purpose |
| --- | --- |
| `CONTACT_WEBHOOK_URL` | An `https://` endpoint. Formspree, a Zapier or Make catch hook, or your own API. |
| `CONTACT_WEBHOOK_TOKEN` | Optional. Sent as `Authorization: Bearer <token>` when set. |

The JSON body is:

```json
{
  "name": "",
  "email": "",
  "business": "",
  "website": "",
  "message": "",
  "intent": "",
  "source": "lucas-wahnon-website"
}
```

`intent` is `walkthrough`, `website`, or an empty string, depending on which button the visitor used. `website` in the body is the business’s existing site, not that intent.

A hidden honeypot field named `company_fax` is ignored when it is filled in.

## Replace photographs

Photography is in `public/images`. Swap the file and keep the name, or change the path in `lib/photos.ts` and the credit in the same file. The footer lists the current credits.

| File | Used for |
| --- | --- |
| `public/images/hero-sea.jpg` | Homepage hero, and the closing band on Dive Centres |
| `public/images/dive-harbour.jpg` | Homepage dive section |
| `public/images/dive-deck.jpg` | Dive Centres hero |
| `public/images/local-workshop.jpg` | Homepage local section, and the Local Services hero |
| `public/images/local-home.jpg` | FabriCare sample photo, and the Local Services closing band |
| `public/images/sample-sofa.jpg` | FabriCare sample photo |

Current sources, all free to use with the credit already shown on the site:

- Guillaume Baviere, Azores seascape, CC BY 2.0, via Wikimedia Commons
- Jules Verne Times Two, boat deck off São Miguel, CC BY-SA 4.0, via Wikimedia Commons
- Luca Nebuloni, harbour boat in the Azores, CC BY 2.0, via Wikimedia Commons
- Maina Pat Mbae, tailor at her workshop, CC BY-SA 4.0, via Wikimedia Commons
- Two Unsplash photographs (sofa and living room), Unsplash Licence

## Replace demo screens

The dashboards, booking screens, check-in, rota, Low Season Mode and FabriCare flow are built as readable placeholder views. They use demo data only. They are labelled “Demo view”.

To drop in a real screenshot, add a file under `public/screenshots` using one of the names below. `webp`, `jpg`, `jpeg`, `png` and `avif` are all picked up. The page then shows the file instead of the placeholder. Remove the file to go back to the demo view.

| File name (without extension) | Section |
| --- | --- |
| `screenshots/dashboard-today` | Dive Centres hero dashboard |
| `screenshots/today` | See what’s happening today |
| `screenshots/check-in` | Guest check-in |
| `screenshots/staff-planning` | Staff and courses |
| `screenshots/bookings` | Online and front desk booking |
| `screenshots/low-season` | Low Season Mode |
| `screenshots/walkthrough` | Walkthrough |
| `screenshots/service-page` | Local service page |
| `screenshots/appointments` | Appointment booking |
| `screenshots/quote-request` | Quote request |
| `screenshots/local-seo` | Local SEO |
| `screenshots/ai-visibility` | AI search visibility |
| `screenshots/fabricare` | FabriCare proposal demo |

Each figure has a `data-replace` attribute with the same path, if you are inspecting the page. The public pages are built ahead of time, so add the file and redeploy (or restart `npm run dev`) before it appears.
