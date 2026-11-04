"use client";

import * as React from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "@/components/ui/button";
import { KeyCap } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function CommentComposer({ onSubmit, submitting, placeholder = "Write a comment. Use @ to mention someone.", className }: { onSubmit: (doc: JSONContent, text: string) => Promise<void> | void; submitting?: boolean; placeholder?: string; className?: string }) {
  const [empty, setEmpty] = React.useState(true);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ heading: false }), Placeholder.configure({ placeholder })],
    content: { type: "doc", content: [{ type: "paragraph" }] },
    onUpdate: ({ editor: e }) => setEmpty(e.isEmpty),
    editorProps: {
      attributes: { class: "prose-tp min-h-10 px-2 py-1.5 type-body-1 text-fg outline-none" },
      handleKeyDown: (_v, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          submit();
          return true;
        }
        return false;
      },
    },
  });

  const submit = async () => {
    if (!editor || editor.isEmpty) return;
    const doc = editor.getJSON();
    const text = editor.getText();
    await onSubmit(doc, text);
    editor.commands.clearContent(true);
    setEmpty(true);
  };

  return (
    <div className={cn("rounded-sm border border-border-strong bg-surface focus-within:border-brand", className)}>
      <EditorContent editor={editor} />
      <div className="flex items-center justify-end gap-2 border-t border-border px-2 py-1.5">
        <span className="type-caption-1 text-fg-tertiary">
          <KeyCap>Ctrl</KeyCap> <KeyCap>Enter</KeyCap> to post
        </span>
        <Button variant="primary" size="sm" disabled={empty} loading={submitting} onClick={submit}>
          Comment
        </Button>
      </div>
    </div>
  );
}
