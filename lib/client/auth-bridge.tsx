"use client";

import * as React from "react";
import { useClerk, useAuth } from "@clerk/nextjs";

/*
  Thin seam between the shell and the identity provider. The real app provides Clerk; the
  development preview provides no-ops so the shell renders without Clerk configured.
*/
export type AuthBridge = {
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void> | void;
  openProfile: () => void;
};

const Ctx = React.createContext<AuthBridge>({ getToken: async () => null, signOut: () => undefined, openProfile: () => undefined });

export function useAuthBridge(): AuthBridge {
  return React.useContext(Ctx);
}

export function StaticAuthBridge({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={{ getToken: async () => null, signOut: () => undefined, openProfile: () => undefined }}>{children}</Ctx.Provider>;
}

export function ClerkAuthBridge({ children }: { children: React.ReactNode }) {
  const { signOut, openUserProfile } = useClerk();
  const { getToken } = useAuth();
  const value = React.useMemo<AuthBridge>(
    () => ({ getToken: async () => (await getToken()) ?? null, signOut: () => signOut({ redirectUrl: "/" }), openProfile: () => openUserProfile() }),
    [getToken, signOut, openUserProfile],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
