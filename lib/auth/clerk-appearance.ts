/* Maps Clerk's hosted components onto the TaskParty design tokens (docs/09). */
export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--color-brand)",
    colorBackground: "var(--color-surface)",
    colorText: "var(--color-fg)",
    colorTextSecondary: "var(--color-fg-secondary)",
    colorInputBackground: "var(--color-surface)",
    colorInputText: "var(--color-fg)",
    colorDanger: "var(--color-danger)",
    colorSuccess: "var(--color-success)",
    colorWarning: "var(--color-warning)",
    borderRadius: "4px",
    fontFamily: "var(--font-sans)",
    fontSize: "14px",
  },
  elements: {
    card: { boxShadow: "none", border: "1px solid var(--color-border)", borderRadius: "8px" },
    formButtonPrimary: { fontWeight: 600, textTransform: "none" as const, fontSize: "14px" },
    headerTitle: { fontWeight: 600 },
    footerActionLink: { color: "var(--color-brand)" },
  },
};

/*
  Text overrides for Clerk's components. The Clerk application was created by the Vercel integration and is named
  after the Vercel project, so the default titles read "Sign in to project-manager"; these keep the product name.
*/
export const clerkLocalization = {
  signIn: {
    start: { title: "Sign in to TaskParty", subtitle: "Welcome back. Sign in to continue." },
  },
  signUp: {
    start: { title: "Create your TaskParty account", subtitle: "Plan, track, and deliver work with your team." },
  },
};
