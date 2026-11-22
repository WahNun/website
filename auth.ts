import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { compare } from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { adminPasswordHash, adminStatus, githubAllowlist } from "@/lib/admin";
import {
  clearLoginFailures,
  loginBlocked,
  recordLoginFailure,
} from "@/lib/login-guard";

function sameText(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

const status = adminStatus();

const providers = [];

if (status.github) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  );
}

if (status.credentials) {
  providers.push(
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
        const hash = adminPasswordHash();
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "local";

        if (!email || !password || password.length > 200 || !adminEmail || !hash) {
          return null;
        }
        if (loginBlocked(ip)) {
          try {
            await compare(password, hash);
          } catch {
            /* keep the response time close to a normal check */
          }
          return null;
        }

        const emailOk = sameText(email, adminEmail);
        let passwordOk = false;
        try {
          passwordOk = await compare(password, hash);
        } catch {
          passwordOk = false;
        }

        if (!emailOk || !passwordOk) {
          recordLoginFailure(ip);
          return null;
        }

        clearLoginFailures(ip);
        return {
          id: "admin",
          name: "Admin",
          email: adminEmail,
        };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: {
    signIn: "/dive-os/login",
    error: "/dive-os/login",
  },
  providers,
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "credentials") return true;
      if (account?.provider === "github") {
        const login =
          profile && "login" in profile && typeof profile.login === "string"
            ? profile.login.toLowerCase()
            : "";
        return githubAllowlist().includes(login);
      }
      return false;
    },
    async jwt({ token, user }) {
      if (user) token.role = "admin";
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role === "admin" ? "admin" : undefined;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      const fallback = `${baseUrl}/dive-os`;
      try {
        const target = new URL(url, baseUrl);
        if (target.origin !== new URL(baseUrl).origin) return fallback;
        if (!target.pathname.startsWith("/dive-os")) return fallback;
        if (target.pathname.startsWith("/dive-os/login")) return fallback;
        return target.toString();
      } catch {
        return fallback;
      }
    },
    authorized({ auth: session, request }) {
      if (request.nextUrl.pathname === "/dive-os/login") return true;
      return session?.user?.role === "admin";
    },
  },
});
