"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUpload20Regular, Checkmark16Regular, Warning16Regular } from "@fluentui/react-icons";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import type { ProjectInfo } from "@/components/views/types";
import { useWorkspace } from "@/lib/client/workspace-context";
import { call } from "@/lib/client/actions";
import { createImportAction, getImportAction } from "@/lib/actions/imports";
import type { ImportRecord } from "@/lib/services/imports";
import { importTargets, type ImportMapping } from "@/lib/validation/import";
import { parseCsv, guessMapping, coerceRow, summarize, targetLabels, type ParsedCsv, type ImportContext } from "@/lib/client/csv";
import { cn } from "@/lib/utils";

type Step = "upload" | "map" | "preview" | "running";
const MAX_ROWS = 5000;

/** CSV import (docs/16 step 1.17): upload, map columns, preview, then commit as a background job with progress. */
export function ImportDialog({ open, onOpenChange, project }: { open: boolean; onOpenChange: (open: boolean) => void; project: ProjectInfo }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <ImportFlow project={project} onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function ImportFlow({ project, onClose }: { project: ProjectInfo; onClose: () => void }) {
  const { slug, workspace } = useWorkspace();
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = React.useState<Step>("upload");
  const [fileName, setFileName] = React.useState("");
  const [text, setText] = React.useState("");
  const [hasHeader, setHasHeader] = React.useState(true);
  const [dayFirst, setDayFirst] = React.useState(workspace.weekStartsOn !== 0);
  const [parsed, setParsed] = React.useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = React.useState<ImportMapping>([]);
  const [record, setRecord] = React.useState<ImportRecord | null>(null);
  const [pending, setPending] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const ctx: ImportContext = React.useMemo(
    () => ({ statuses: project.statuses, sections: project.sections, members: project.members, fields: project.fields.map((f) => ({ id: f.id, name: f.name, type: f.type, config: f.config })), dayFirst }),
    [project, dayFirst],
  );

  const load = (name: string, content: string) => {
    setFileName(name);
    setText(content);
    const p = parseCsv(content, { hasHeader });
    setParsed(p);
    setMapping(guessMapping(p.headers, ctx.fields));
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    load(file.name, await file.text());
  };
  const toggleHeader = (v: boolean) => {
    setHasHeader(v);
    if (text) {
      const p = parseCsv(text, { hasHeader: v });
      setParsed(p);
      setMapping(guessMapping(p.headers, ctx.fields));
    }
  };

  const rows = React.useMemo(() => parsed?.rows ?? [], [parsed]);
  const tooMany = rows.length > MAX_ROWS;
  const titleMapped = mapping.some((m) => m.target === "title");
  const summary = React.useMemo(() => (parsed && titleMapped ? summarize(rows, mapping, ctx) : null), [parsed, rows, mapping, ctx, titleMapped]);
  const previewRows = React.useMemo(() => (titleMapped ? rows.slice(0, 20).map((r) => coerceRow(r, mapping, ctx)) : []), [rows, mapping, ctx, titleMapped]);

  const start = async () => {
    if (!parsed) return;
    setPending(true);
    const res = await call(createImportAction(slug, { projectId: project.id, fileName: fileName || "pasted.csv", mapping, rows }));
    setPending(false);
    if (!res.ok) {
      toast({ title: "Could not start the import", description: res.error.details?.[0]?.message ?? res.error.message, kind: "danger" });
      return;
    }
    setRecord(res.data);
    setStep("running");
  };

  // Poll progress while the job runs.
  const recordId = record?.id ?? null;
  const running = step === "running" && record !== null && record.status !== "completed" && record.status !== "failed";
  React.useEffect(() => {
    if (!running || !recordId) return;
    let cancelled = false;
    const tick = async () => {
      const res = await call(getImportAction(slug, recordId));
      if (cancelled) return;
      if (res.ok) {
        setRecord(res.data);
        if (res.data.status === "completed") {
          toast({ title: `${res.data.createdCount} ${res.data.createdCount === 1 ? "task" : "tasks"} imported`, description: res.data.errorCount ? `${res.data.errorCount} rows were skipped.` : undefined, kind: res.data.errorCount ? "warning" : "success" });
          router.refresh();
        }
      }
    };
    const id = window.setInterval(tick, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [running, recordId, slug, router, toast]);

  const stepIndex = { upload: 0, map: 1, preview: 2, running: 3 }[step];
  const steps = ["Upload", "Map columns", "Preview", "Import"];

  return (
    <DialogContent
      title="Import tasks from CSV"
      description={`Into ${project.name}. Sections and tags that do not exist yet are created; rows with problems are skipped.`}
      size="lg"
      footer={
        <>
          {step !== "running" ? (
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          ) : null}
          {step === "map" ? (
            <Button variant="subtle" onClick={() => setStep("upload")}>
              Back
            </Button>
          ) : null}
          {step === "preview" ? (
            <Button variant="subtle" onClick={() => setStep("map")}>
              Back
            </Button>
          ) : null}
          {step === "upload" ? (
            <Button variant="primary" disabled={!parsed || rows.length === 0 || tooMany} onClick={() => setStep("map")}>
              Map columns
            </Button>
          ) : null}
          {step === "map" ? (
            <Button variant="primary" disabled={!titleMapped} onClick={() => setStep("preview")}>
              Preview
            </Button>
          ) : null}
          {step === "preview" ? (
            <Button variant="primary" loading={pending} disabled={!summary || summary.ready === 0} onClick={start}>
              Import {summary?.ready ?? 0} {summary?.ready === 1 ? "task" : "tasks"}
            </Button>
          ) : null}
          {step === "running" ? (
            <Button variant="primary" onClick={onClose} disabled={running}>
              Done
            </Button>
          ) : null}
        </>
      }
    >
      <ol className="mb-4 flex items-center gap-2 type-caption-1 text-fg-tertiary" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2", i === stepIndex && "type-caption-1-strong text-fg")} aria-current={i === stepIndex ? "step" : undefined}>
            <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full border border-border", i < stepIndex && "border-brand bg-brand text-fg-on-brand", i === stepIndex && "border-brand text-brand")}>{i < stepIndex ? <Checkmark16Regular /> : i + 1}</span>
            {s}
            {i < steps.length - 1 ? <span className="mx-1 h-px w-6 bg-border" aria-hidden /> : null}
          </li>
        ))}
      </ol>

      {step === "upload" ? (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files?.[0]);
            }}
            className="flex h-28 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong bg-subtle type-body-1 text-fg-secondary hover:bg-hover"
          >
            <ArrowUpload20Regular className="text-fg-tertiary" />
            {fileName ? <span className="type-body-1-strong text-fg">{fileName}</span> : <span>Drop a CSV here or choose a file</span>}
            <span className="type-caption-1">Up to {MAX_ROWS.toLocaleString()} rows. Exports from Asana, Trello, and Jira work as CSV.</span>
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv,.tsv,text/tab-separated-values,.txt" className="sr-only" aria-label="Choose a CSV file" onChange={(e) => onFile(e.target.files?.[0])} />
          <label className="flex flex-col gap-1">
            <span className="type-caption-1-strong text-fg-secondary">Or paste CSV text</span>
            <Textarea value={text} onChange={(e) => load(fileName || "pasted.csv", e.target.value)} rows={5} placeholder={"Title,Section,Assignee,Due date\nWrite the brief,Planning,Jenny Park,2026-11-12"} className="font-mono" />
          </label>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 type-body-1">
              <Switch checked={hasHeader} onCheckedChange={toggleHeader} aria-label="First row is a header" /> First row is a header
            </label>
            <label className="flex items-center gap-2 type-body-1">
              <Switch checked={dayFirst} onCheckedChange={setDayFirst} aria-label="Dates are day first" /> Dates are day first (31/12/2026)
            </label>
            {parsed ? (
              <span className="ml-auto type-caption-1 text-fg-secondary" aria-live="polite">
                {rows.length.toLocaleString()} {rows.length === 1 ? "row" : "rows"}, {parsed.headers.length} columns
              </span>
            ) : null}
          </div>
          {tooMany ? <p className="type-body-1 text-danger">Split the file. Imports take up to {MAX_ROWS.toLocaleString()} rows at a time.</p> : null}
        </div>
      ) : null}

      {step === "map" && parsed ? (
        <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
          <table className="w-full border-collapse type-body-1">
            <thead className="sticky top-0 bg-subtle">
              <tr className="text-left type-caption-1-strong text-fg-secondary">
                <th className="border-b border-border px-3 py-2">CSV column</th>
                <th className="border-b border-border px-3 py-2">Example values</th>
                <th className="w-56 border-b border-border px-3 py-2">Imports as</th>
              </tr>
            </thead>
            <tbody>
              {parsed.headers.map((h, column) => {
                const current = mapping.find((m) => m.column === column)?.target ?? "skip";
                const samples = rows.slice(0, 3).map((r) => r[column]).filter(Boolean);
                return (
                  <tr key={column} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5 type-body-1-strong">{h}</td>
                    <td className="px-3 py-1.5 text-fg-secondary">
                      <span className="line-clamp-1">{samples.join(", ") || "(empty)"}</span>
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        aria-label={`Import ${h} as`}
                        value={current}
                        onChange={(e) => setMapping((m) => m.filter((x) => x.column !== column).concat(e.target.value === "skip" ? [] : [{ column, target: e.target.value }]).concat(e.target.value === "skip" ? [{ column, target: "skip" }] : []))}
                        className={cn("h-8 w-full rounded-sm border border-border-strong bg-surface px-2 type-body-1", current !== "skip" && "font-semibold")}
                      >
                        {importTargets.map((t) => (
                          <option key={t} value={t} disabled={t !== "skip" && t !== current && mapping.some((m) => m.target === t)}>
                            {targetLabels[t]}
                          </option>
                        ))}
                        {ctx.fields.length ? (
                          <optgroup label="Custom fields">
                            {ctx.fields.map((f) => (
                              <option key={f.id} value={`field:${f.id}`} disabled={`field:${f.id}` !== current && mapping.some((m) => m.target === `field:${f.id}`)}>
                                {f.name}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!titleMapped ? (
            <p className="flex items-center gap-1 border-t border-border bg-subtle px-3 py-2 type-caption-1 text-fg-secondary">
              <Warning16Regular className="text-warning" /> Map one column to Title to continue.
            </p>
          ) : null}
        </div>
      ) : null}

      {step === "preview" && summary ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 type-body-1">
            <Badge color="green" dot>
              {summary.ready} ready
            </Badge>
            {summary.withProblems ? (
              <Badge color="orange" dot>
                {summary.withProblems} with problems
              </Badge>
            ) : null}
            {summary.newSections.length ? <span className="type-caption-1 text-fg-secondary">New sections: {summary.newSections.join(", ")}</span> : null}
            {summary.newTags.length ? <span className="type-caption-1 text-fg-secondary">New tags: {summary.newTags.join(", ")}</span> : null}
          </div>
          <div className="max-h-[46vh] overflow-auto rounded-md border border-border">
            <table className="w-full border-collapse type-body-1" aria-label="Preview">
              <thead className="sticky top-0 bg-subtle">
                <tr className="text-left type-caption-1-strong text-fg-secondary">
                  <th className="border-b border-border px-3 py-2">Title</th>
                  <th className="border-b border-border px-3 py-2">Section</th>
                  <th className="border-b border-border px-3 py-2">Status</th>
                  <th className="border-b border-border px-3 py-2">Assignee</th>
                  <th className="border-b border-border px-3 py-2">Dates</th>
                  <th className="border-b border-border px-3 py-2">Problems</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className={cn("border-b border-border last:border-b-0", r.errors.length && "bg-warning-tint")}>
                    <td className="px-3 py-1.5">
                      <span className={cn("block truncate type-body-1-strong", !r.title && "text-fg-tertiary")}>{r.title || "(no title)"}</span>
                      {r.parentTitle ? <span className="block type-caption-1 text-fg-secondary">Subtask of {r.parentTitle}</span> : null}
                    </td>
                    <td className="px-3 py-1.5 text-fg-secondary">{r.sectionId ? ctx.sections.find((s) => s.id === r.sectionId)?.name : r.newSection ? `${r.newSection} (new)` : ""}</td>
                    <td className="px-3 py-1.5 text-fg-secondary">{r.statusId ? ctx.statuses.find((s) => s.id === r.statusId)?.name : ""}</td>
                    <td className="px-3 py-1.5 text-fg-secondary">{r.assigneeId ? ctx.members.find((m) => m.id === r.assigneeId)?.displayName : ""}</td>
                    <td className="px-3 py-1.5 text-fg-secondary">{[r.startDate, r.dueDate].filter(Boolean).join(" to ")}</td>
                    <td className="px-3 py-1.5 type-caption-1 text-fg-secondary">{r.errors.map((e) => e.message).join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 20 ? <p className="border-t border-border bg-subtle px-3 py-1.5 type-caption-1 text-fg-secondary">Showing the first 20 of {rows.length.toLocaleString()} rows.</p> : null}
          </div>
        </div>
      ) : null}

      {step === "running" && record ? (
        <div className="flex flex-col gap-3" aria-live="polite">
          <p className="type-body-1">
            {record.status === "completed" ? `Imported ${record.createdCount} of ${record.totalRows} rows.` : record.status === "failed" ? "The import stopped." : `Importing ${record.processedRows} of ${record.totalRows} rows. You can close this and keep working.`}
          </p>
          <ProgressBar value={record.processedRows} max={record.totalRows} color={record.status === "failed" ? "red" : record.status === "completed" ? "green" : undefined} />
          {record.errors.length ? (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border">
              <ul className="divide-y divide-border type-caption-1">
                {record.errors.map((e, i) => (
                  <li key={i} className="flex gap-3 px-3 py-1.5">
                    <span className="w-14 shrink-0 text-fg-tertiary">{e.row ? `Row ${e.row}` : ""}</span>
                    <span className="text-fg-secondary">{e.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </DialogContent>
  );
}
