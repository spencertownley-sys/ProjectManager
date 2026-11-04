"use client";

import * as React from "react";
import { useViewState, useShellState } from "@/lib/client/view-state";
import { TaskPane } from "./task-pane";
import { NewTaskPane } from "./new-task-pane";
import { Sheet } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function useIsNarrow() {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

/** Renders the details pane beside the main content, or as a sheet on narrow viewports. */
export function TaskPaneHost() {
  const openTaskId = useViewState((s) => s.openTaskId);
  const openTask = useViewState((s) => s.openTask);
  const { paneWidth, setPaneWidth } = useShellState();
  const narrow = useIsNarrow();
  const dragging = React.useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setPaneWidth(window.innerWidth - e.clientX);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };

  if (!openTaskId) return null;
  const content = openTaskId === "new" ? <NewTaskPane onClose={() => openTask(null)} /> : <TaskPane taskId={openTaskId} onClose={() => openTask(null)} />;

  if (narrow) {
    return (
      <Sheet open onOpenChange={(o) => !o && openTask(null)} title="Task details">
        {content}
      </Sheet>
    );
  }

  return (
    <aside className={cn("relative flex h-full shrink-0 flex-col border-l border-border bg-surface-raised")} style={{ width: paneWidth }} aria-label="Task details">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize details pane"
        tabIndex={0}
        className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-brand/30"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPaneWidth(paneWidth + 16);
          if (e.key === "ArrowRight") setPaneWidth(paneWidth - 16);
        }}
      />
      {content}
    </aside>
  );
}
