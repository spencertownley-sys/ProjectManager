import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/auth/clerk-appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TaskParty", template: "%s | TaskParty" },
  description: "Plan, track, and deliver work. In one place, in every view.",
};

const themeScript = `(function(){try{var t=localStorage.getItem("tp-theme");if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t;return}if(window.matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.dataset.theme="dark"}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="en" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        </head>
        <body className="min-h-full">{children}</body>
      </html>
    </ClerkProvider>
  );
}
