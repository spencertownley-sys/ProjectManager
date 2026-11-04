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
