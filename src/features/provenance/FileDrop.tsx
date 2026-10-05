import { FileKey2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

interface FileDropProps {
  accept: string;
  file: File | null;
  label: string;
  hint: string;
  onFile: (file: File) => void;
}

export function FileDrop({ accept, file, label, hint, onFile }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`group flex min-h-44 flex-col items-center justify-center border border-dashed px-6 py-7 text-center transition-colors ${dragging ? "border-primary bg-secondary" : "border-border bg-card"}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const nextFile = event.dataTransfer.files.item(0);
        if (nextFile) onFile(nextFile);
      }}
    >
      <div className="mb-4 flex size-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
        {file ? <FileKey2 aria-hidden="true" /> : <Upload aria-hidden="true" />}
      </div>
      <p className="text-sm font-semibold text-foreground">{file ? file.name : label}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{file ? `${(file.size / 1024).toFixed(1)} KB · ready for local processing` : hint}</p>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={accept}
        onChange={(event) => {
          const nextFile = event.target.files?.item(0);
          if (nextFile) onFile(nextFile);
        }}
      />
      <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => inputRef.current?.click()}>
        {file ? "Replace file" : "Choose file"}
      </Button>
    </div>
  );
}
