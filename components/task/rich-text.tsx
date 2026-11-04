"use client";

import * as React from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { cn } from "@/lib/utils";

type Props = {
  value: JSONContent | null | undefined;
  onSave: (doc: JSONContent, text: string) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
  /** Save on blur (descriptions) or expose a submit handler (comments). */
  mode?: "blur" | "submit";
  onSubmit?: (doc: JSONContent, text: string) => void;
  autoFocus?: boolean;
};

export function RichTextEditor({ value, onSave, placeholder = "Add details", className, editable = true, mode = "blur", onSubmit, autoFocus }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    autofocus: autoFocus ? "end" : false,
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } }), Placeholder.configure({ placeholder })],
    content: value ?? { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: {
        class: cn(
          "prose-tp min-h-16 rounded-sm border border-transparent px-2 py-1.5 type-body-1 text-fg outline-none focus:border-brand focus:bg-surface",
          editable && "hover:border-border",
        ),
      },
      handleKeyDown: (_view, event) => {
        if (mode === "submit" && (event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          const doc = editorRef.current?.getJSON();
          if (doc && onSubmit) onSubmit(doc, editorRef.current?.getText() ?? "");
          return true;
        }
        return false;
      },
    },
    onBlur: ({ editor: e }) => {
      if (mode !== "blur") return;
      onSave(e.getJSON(), e.getText());
    },
  });
  const editorRef = React.useRef(editor);
  React.useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Sync external changes (realtime, other users) when the editor is not focused.
  React.useEffect(() => {
    if (!editor || editor.isFocused) return;
    const incoming = JSON.stringify(value ?? { type: "doc", content: [{ type: "paragraph" }] });
    if (incoming !== JSON.stringify(editor.getJSON())) editor.commands.setContent(value ?? { type: "doc", content: [{ type: "paragraph" }] }, { emitUpdate: false });
  }, [value, editor]);

  return (
    <div className={className}>
      <EditorContent editor={editor} />
      {mode === "submit" ? <span className="sr-only">Press Ctrl and Enter to submit</span> : null}
    </div>
  );
}

export function clearEditorFor(editor: ReturnType<typeof useEditor>) {
  editor?.commands.clearContent(true);
}
