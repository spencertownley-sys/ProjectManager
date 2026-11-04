"use client";

import type { ViewProps } from "@/components/views/types";
import { EmptyState } from "@/components/ui/misc";

/** Placeholder until the GanttView implementation lands (docs/11). */
export function GanttView(props: ViewProps & { quickAddSignal?: number }) {
  return <EmptyState title="This view is being built" description={`${props.rows.length} tasks are ready to show here.`} />;
}
