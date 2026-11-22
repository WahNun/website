import { NextResponse } from "next/server";

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 5;
const hits = new Map<string, { count: number; reset: number }>();

type Fields = {
  name: string;
  email: string;
  business: string;
  website: string;
  message: string;
  intent: string;
  company_fax: string;
};

const intents = new Set(["walkthrough", "website"]);

function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  );
}

function limited(ip: string) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.reset < now) {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

function clean(value: unknown, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function validEmail(value: string) {
  return value.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normaliseWebsite(value: string) {
  if (!value) return "";
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function readFields(request: Request): Promise<Fields | null> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      return {
        name: clean(body.name, 120),
        email: clean(body.email, 200),
        business: clean(body.business, 160),
        website: clean(body.website, 300),
        message: String(body.message ?? "").trim().slice(0, 5000),
        intent: clean(body.intent, 40),
        company_fax: clean(body.company_fax, 200),
      };
    }
    const form = await request.formData();
    return {
      name: clean(form.get("name"), 120),
      email: clean(form.get("email"), 200),
      business: clean(form.get("business"), 160),
      website: clean(form.get("website"), 300),
      message: String(form.get("message") ?? "").trim().slice(0, 5000),
      intent: clean(form.get("intent"), 40),
      company_fax: clean(form.get("company_fax"), 200),
    };
  } catch {
    return null;
  }
}

function wantsJson(request: Request) {
  const accept = request.headers.get("accept") ?? "";
  const type = request.headers.get("content-type") ?? "";
  return type.includes("application/json") || accept.includes("application/json");
}

function respond(
  request: Request,
  status: number,
  body: Record<string, unknown>,
  sent?: "1" | "demo" | "error",
) {
  if (!wantsJson(request) && sent) {
    return new Response(null, {
      status: 303,
      headers: { Location: `/?sent=${sent}#contact` },
    });
  }
  if (!wantsJson(request) && status >= 400) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/?sent=error#contact" },
    });
  }
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  if (limited(clientIp(request))) {
    return respond(request, 429, {
      ok: false,
      errors: {
        form: "Please wait a few minutes before sending another message.",
      },
    });
  }

  const fields = await readFields(request);
  if (!fields) {
    return respond(
      request,
      400,
      { ok: false, errors: { form: "The message could not be read." } },
      "error",
    );
  }

  if (fields.company_fax) {
    return respond(request, 200, { ok: true, delivered: false }, "demo");
  }

  const errors: Record<string, string> = {};
  if (!fields.name) errors.name = "Enter your name.";
  if (!validEmail(fields.email)) errors.email = "Enter a valid email address.";
  if (!fields.business) errors.business = "Enter the business name.";
  if (!fields.message) errors.message = "Tell me what you want to improve.";
  const website = normaliseWebsite(fields.website);
  if (website === null) {
    errors.website = "Enter a website address, or leave this blank.";
  }
  if (Object.keys(errors).length) {
    return respond(request, 400, { ok: false, errors });
  }

  const payload = {
    name: fields.name,
    email: fields.email,
    business: fields.business,
    website: website ?? "",
    message: fields.message,
    intent: intents.has(fields.intent) ? fields.intent : "",
    source: "lucas-wahnon-website",
  };

  const webhook = process.env.CONTACT_WEBHOOK_URL?.trim();
  if (!webhook) {
    return respond(request, 200, { ok: true, delivered: false }, "demo");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(webhook);
  } catch {
    return respond(request, 500, {
      ok: false,
      errors: { form: "The form service address is not valid." },
    });
  }
  if (endpoint.protocol !== "https:") {
    return respond(request, 500, {
      ok: false,
      errors: { form: "The form service address must use HTTPS." },
    });
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const token = process.env.CONTACT_WEBHOOK_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      return respond(request, 502, {
        ok: false,
        errors: {
          form: "The message could not be sent. Please try again in a moment.",
        },
      });
    }
  } catch {
    return respond(request, 502, {
      ok: false,
      errors: {
        form: "The message could not be sent. Please try again in a moment.",
      },
    });
  }

  return respond(request, 200, { ok: true, delivered: true }, "1");
}
