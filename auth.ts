import NextAuth from "next-auth";
import type { Provider } from "@auth/core/providers";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { migrateGlobalDataToUser } from "@/lib/migrate";

const providers: Provider[] = [
  Google({
    authorization: { params: { prompt: "select_account" } },
  }),
];

// Dev-only credentials provider for preview/testing environments
if (process.env.NODE_ENV === "development") {
  providers.push(
    Credentials({
      name: "Dev Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const devEmail = process.env.DEV_LOGIN_EMAIL;
        const devPassword = process.env.DEV_LOGIN_PASSWORD;
        const devUserId = process.env.DEV_LOGIN_USER_ID;
        if (!devEmail || !devPassword || !devUserId) return null;
        if (
          String(credentials?.email) === devEmail &&
          String(credentials?.password) === devPassword
        ) {
          return { id: devUserId, email: devEmail, name: "Dev User" };
        }
        return null;
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account && account.provider === "google" && profile) {
        token.userId = profile.sub;

        // Auto-migrate legacy data for the first user to sign in
        if (profile.sub) {
          try {
            await migrateGlobalDataToUser(profile.sub);
          } catch {
            // Migration already done or no legacy data — ignore
          }
        }
      } else if (account && account.provider === "credentials" && user) {
        // Dev credentials — user.id is the DEV_LOGIN_USER_ID
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
