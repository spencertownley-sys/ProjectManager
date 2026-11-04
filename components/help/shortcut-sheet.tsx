"use client";

import * as React from "react";
import Link from "next/link";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useHelpStore } from "@/lib/client/help-store";
import { isShortcutSheetKey } from "@/lib/client/shortcuts";
import { useWorkspace } from "@/lib/client/workspace-context";
import { ShortcutList } from "./shortcut-list";

/** The keyboard shortcut sheet (docs/11 section 1): opens on ? anywhere in the app and from the account menu. */
export function ShortcutSheet() {
  const open = useHelpStore((s) => s.sheetOpen);
  const setOpen = useHelpStore((s) => s.setSheetOpen);
  const { slug } = useWorkspace();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isShortcutSheetKey(e)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open ? (
        <DialogContent
          title="Keyboard shortcuts"
          description="Press ? anywhere to open this sheet. Shortcuts are off while you type in a field."
          size="lg"
          footer={
            <>
              <Button asChild variant="subtle">
                <Link href={`/w/${slug}/help`} onClick={() => setOpen(false)}>
                  Open help
                </Link>
              </Button>
              <Button variant="primary" onClick={() => setOpen(false)}>
                Done
              </Button>
            </>
          }
        >
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <ShortcutList columns={3} />
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
