import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { migrateGlobalDataToUser } from "@/lib/migrate";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.userId = profile.sub;

        // Auto-migrate legacy data for the first user to sign in
        if (profile.sub) {
          try {
            await migrateGlobalDataToUser(profile.sub);
          } catch {
            // Migration already done or no legacy data — ignore
          }
        }
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
