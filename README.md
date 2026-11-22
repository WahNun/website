# Lucas Wahnon

A website for Lucas Wahnon’s web development and digital operations practice, plus a private admin area called Dive OS.

Public pages, in British English:

- Home — `/`
- Dive Centres — `/dive-centres`
- Local Services — `/local-services`

Dive OS lives at `/dive-os`. It is not linked from the public navigation, it is marked `noindex`, and it is disallowed in `robots.txt`.

## Stack

[Next.js](https://nextjs.org/) (App Router) on Node.js, with React. Dive OS is the Azores Diving admin (bookings, customers, schedule, boats, crew, tickets, finances and settings) and signs in with Supabase Auth. The public pages are mostly static. The contact route and Dive OS need a server, so the app is not a static export. Deploy it on Vercel. The Vercel project for this repository is **wahnon-website**.

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

The public site runs without any environment variables. `/dive-os` uses the Dive OS sandbox in Supabase. Sign-in needs an Auth user whose `profiles.role` is `admin`.

## Deploy

Push the repository. Vercel builds a Next.js app from the root (`npm run build`). Set the environment variables in **Vercel → wahnon-website → Settings → Environment Variables**, for Production and, if you want the admin on preview URLs, for Preview as well. Redeploy after changing them.

`NEXT_PUBLIC_SITE_URL` should be the canonical origin, for example `https://example.com`. If it is unset, metadata uses `VERCEL_PROJECT_PRODUCTION_URL` when Vercel provides it.

## Dive OS

`/dive-os` is the dive centre admin, restyled in the same dark type and palette as the public site. It is not in the public navigation, it is `noindex`, and `robots.txt` disallows it. Only a Supabase user with `profiles.role = admin` can pass the server check. Create that user in the Dive OS sandbox (Authentication) and a matching `profiles` row. The seed profiles have no login.

`/dive-os/book` is the customer booking page (plus check-in at `/dive-os/checkin` and request links at `/dive-os/request/...`). It is not branded to a particular centre. Name, logo URL, email, phone, address and intro are `site_settings` keys: `centre_name`, `centre_logo_url`, `centre_email`, `centre_phone`, `centre_address`, `centre_intro`. Admins edit them under Dive OS → Settings. Saving uses `SUPABASE_SERVICE_ROLE_KEY`. Until those keys are set, the page says “Dive centre”.

The admin reads and writes the sandbox database with the signed-in session. Routes that need the service role return a clear error until that key is set. They do not fall back to another project.

External services stay off until their variables are set:

- Email does not send without `RESEND_API_KEY` or `GMAIL_REFRESH_TOKEN`.
- Stripe refuses a live secret unless `STRIPE_ALLOW_LIVE` is `true`, and does nothing if no secret is set.
- Keyinvoice does not call its API unless `KEYINVOICE_ENABLED` is `true` and `KEYINVOICE_API_KEY` is set.
- Mistral chat returns “not configured” without `MISTRAL_API_KEY`. Classification does not call Mistral either.
- Gmail polling returns without calling Google when the Gmail variables are missing.
- There is no Vercel cron. The cron routes stay in the app and refuse requests that do not present `CRON_SECRET`.

### Environment variables

Names only. Set them on **wahnon-website**. Do not commit values.

| Name | When |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sandbox project URL. The app rejects any other host. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key for that project. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is accepted as an alias. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server routes (staff checks, invoices, mail logs). Set this in Vercel. Not required to open the admin UI. |
| `NEXT_PUBLIC_SITE_URL` | Optional canonical origin for metadata and links inside emails. |
| `CONTACT_WEBHOOK_URL` | Optional HTTPS endpoint for the public contact form. |
| `CONTACT_WEBHOOK_TOKEN` | Optional bearer token for that webhook. |
| `STRIPE_SECRET_KEY` | Optional. Use a test key. |
| `STRIPE_TEST_SECRET_KEY` | Optional test key for sandbox bookings. |
| `STRIPE_WEBHOOK_SECRET` | Optional. |
| `STRIPE_ALLOW_LIVE` | Optional. Must be `true` before a live secret is accepted. |
| `RESEND_API_KEY` | Optional email via Resend. |
| `RESEND_FROM` | Optional from-address. |
| `GMAIL_CLIENT_ID` | Optional. All three Gmail values are required before Gmail is used. |
| `GMAIL_CLIENT_SECRET` | Optional. |
| `GMAIL_REFRESH_TOKEN` | Optional. |
| `REPLY_TO_EMAIL` | Optional. |
| `KEYINVOICE_API_KEY` | Optional. |
| `KEYINVOICE_ENABLED` | Optional. Set to `true` together with the API key. |
| `KEYINVOICE_BASE_URL` | Optional. |
| `MISTRAL_API_KEY` | Optional. |
| `CRON_SECRET` | Optional. Cron routes reject calls without it. Do not add Vercel crons until the services above are intentionally configured. |
| `BANK_IBAN` | Optional text shown on payment instructions. |
| `BANK_ACCOUNT_NAME` | Optional. |
| `BANK_BIC` | Optional. |
| `REVOLUT_LINK` | Optional. |
| `ADMIN_ALERT_EMAIL` | Optional inbox for unpaid-booking notes. |
| `PAYOUT_ENC_KEY` | Optional. Refund payout details stay unreadable without it. |
| `NEXT_PUBLIC_GOOGLE_REVIEW_URL` | Optional link in follow-up mail. |

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
