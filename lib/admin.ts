export function githubAllowlist() {
  return (process.env.ADMIN_GITHUB_LOGINS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function adminPasswordHash() {
  let hash = (process.env.ADMIN_PASSWORD_HASH ?? "").trim();
  if (
    (hash.startsWith("'") && hash.endsWith("'")) ||
    (hash.startsWith('"') && hash.endsWith('"'))
  ) {
    hash = hash.slice(1, -1);
  }
  return hash;
}

export function passwordHashLooksValid(hash: string | undefined) {
  return /^\$2[aby]\$\d{2}\$/.test((hash ?? "").trim()) && (hash ?? "").trim().length >= 59;
}

export function adminStatus() {
  const allowlist = githubAllowlist();
  const hash = adminPasswordHash();
  const email = Boolean(process.env.ADMIN_EMAIL?.trim());
  const credentials = email && passwordHashLooksValid(hash);
  const hashBroken = Boolean(hash) && !passwordHashLooksValid(hash);
  const github = Boolean(
    process.env.AUTH_GITHUB_ID?.trim() &&
      process.env.AUTH_GITHUB_SECRET?.trim() &&
      allowlist.length > 0,
  );
  return {
    secret: Boolean(process.env.AUTH_SECRET?.trim()),
    credentials,
    hashBroken,
    github,
    githubAllowlistCount: allowlist.length,
    anyProvider: credentials || github,
  };
}
