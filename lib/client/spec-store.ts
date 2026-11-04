"use client";

import * as React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { viewSpec, defaultViewSpec, decodeViewSpec, encodeViewSpec, type ViewSpec } from "@/lib/validation/view-spec";

/**
 * The active ViewSpec for a project. Shared by every view of the project (docs/02 FR-VIEW-02).
 * Precedence: a `spec` query parameter (shareable links), then the saved view's spec,
 * then the user's last spec for the project (localStorage), then the default.
 */
export function useProjectSpec(projectId: string, base: ViewSpec | null) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const storageKey = `tp-spec-${projectId}`;
  const fromUrl = params.get("spec");

  const [spec, setSpecState] = React.useState<ViewSpec>(() => {
    if (fromUrl) return decodeViewSpec(fromUrl);
    if (base) return base;
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) return viewSpec.parse(JSON.parse(raw));
      } catch {
        // fall through
      }
    }
    return defaultViewSpec();
  });

  // A new `spec` parameter (shared link) replaces the current spec.
  const [seenUrlSpec, setSeenUrlSpec] = React.useState(fromUrl);
  if (fromUrl !== seenUrlSpec) {
    setSeenUrlSpec(fromUrl);
    if (fromUrl) setSpecState(decodeViewSpec(fromUrl));
  }

  const setSpec = React.useCallback(
    (updater: (prev: ViewSpec) => ViewSpec) => {
      setSpecState((prev) => {
        const next = updater(prev);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        if (fromUrl) router.replace(pathname);
        return next;
      });
    },
    [storageKey, fromUrl, router, pathname],
  );

  const reset = React.useCallback(() => setSpec(() => base ?? defaultViewSpec()), [setSpec, base]);
  const shareUrl = React.useCallback(() => `${window.location.origin}${pathname}?spec=${encodeViewSpec(spec)}`, [pathname, spec]);

  return { spec, setSpec, reset, shareUrl };
}
