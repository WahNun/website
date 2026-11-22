"use client";

import { useState } from "react";

type Errors = Record<string, string>;

const notes: Record<string, string> = {
  walkthrough: "This message is about a dive centre walkthrough.",
  website: "This message is about a website for a local service business.",
};

export function ContactForm({
  intent = "",
  sent = "",
}: {
  intent?: string;
  sent?: string;
}) {
  const [errors, setErrors] = useState<Errors>({});
  const [state, setState] = useState<"idle" | "sending" | "sent" | "demo" | "error">(
    sent === "1" ? "sent" : sent === "demo" ? "demo" : "idle",
  );
  const safeIntent = intent === "walkthrough" || intent === "website" ? intent : "";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setState("sending");
    setErrors({});
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(data),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        delivered?: boolean;
        errors?: Errors;
      } | null;
      if (!response.ok || !body?.ok) {
        setErrors(body?.errors ?? { form: "The message could not be sent." });
        setState("error");
        return;
      }
      setState(body.delivered ? "sent" : "demo");
      form.reset();
    } catch {
      setErrors({ form: "The message could not be sent. Please try again." });
      setState("error");
    }
  }

  return (
    <form className="fields" action="/api/contact" method="post" onSubmit={onSubmit} noValidate>
      {safeIntent ? <input type="hidden" name="intent" value={safeIntent} /> : null}
      {safeIntent ? <p className="form-note">{notes[safeIntent]}</p> : null}
      <label>
        <span>Name</span>
        <input name="name" autoComplete="name" required aria-invalid={Boolean(errors.name)} />
        {errors.name ? <span className="field-error">{errors.name}</span> : null}
      </label>
      <label>
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(errors.email)}
        />
        {errors.email ? <span className="field-error">{errors.email}</span> : null}
      </label>
      <label>
        <span>Business</span>
        <input name="business" autoComplete="organization" required aria-invalid={Boolean(errors.business)} />
        {errors.business ? <span className="field-error">{errors.business}</span> : null}
      </label>
      <label>
        <span>Existing website (optional)</span>
        <input
          name="website"
          inputMode="url"
          autoComplete="url"
          aria-invalid={Boolean(errors.website)}
        />
        {errors.website ? <span className="field-error">{errors.website}</span> : null}
      </label>
      <label>
        <span>What do you want to improve?</span>
        <textarea name="message" required aria-invalid={Boolean(errors.message)} />
        {errors.message ? <span className="field-error">{errors.message}</span> : null}
      </label>
      <div className="honeypot" aria-hidden="true">
        <label>
          Fax
          <input name="company_fax" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {errors.form ? (
        <p className="field-error" role="alert">
          {errors.form}
        </p>
      ) : null}
      {state === "sent" ? (
        <p className="form-note form-note--ok" role="status">
          Message sent. I’ll reply by email.
        </p>
      ) : null}
      {state === "demo" ? (
        <p className="form-note" role="status">
          Message checked on this server. Nothing was sent on, because no form service
          is connected yet. The README explains how to connect one.
        </p>
      ) : null}
      {sent === "error" && state === "idle" ? (
        <p className="field-error" role="alert">
          The message could not be sent. Please try again.
        </p>
      ) : null}
      <button className="button" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending" : "Send message"}
      </button>
    </form>
  );
}
