import { useEffect, useRef } from "react";

interface Props {
  markdown: string;
  docFilename: string;
  onClose: () => void;
}

// Minimal markdown → HTML renderer (handles ##, **, *, bullet lists)
function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // headings
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // bullet list items — collect into <ul> blocks below
    .replace(/^[-•] (.+)$/gm, "<li>$1</li>")
    // wrap consecutive <li> in <ul>
    .replace(/(<li>[\s\S]*?<\/li>)(?=\s*<li>|$)/g, (match) => match)
    // paragraphs: blank line → paragraph break
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>")
    // fix: don't wrap block elements in <p>
    .replace(/<p>(<h[123]>)/g, "$1")
    .replace(/(<\/h[123]>)<\/p>/g, "$1")
    .replace(/<p>(<li>)/g, "<ul><li>")
    .replace(/(<\/li>)<\/p>/g, "$1</ul>")
    .replace(/<p><\/p>/g, "")
    .replace(/<p><br\/><\/p>/g, "");
}

export default function NotesModal({ markdown, docFilename, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function handlePrint() {
    window.print();
  }

  const html = renderMarkdown(markdown);
  const title = docFilename ? `Notes — ${docFilename}` : "Session Notes";

  return (
    <>
      {/* Print-only styles injected into head */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #notes-print-root { display: block !important; }
          #notes-print-root .no-print { display: none !important; }
        }
        #notes-print-root { display: none; }
      `}</style>

      {/* Hidden print-only element */}
      <div id="notes-print-root">
        <h1 style={{ fontFamily: "serif", marginBottom: "1rem" }}>{title}</h1>
        <div dangerouslySetInnerHTML={{ __html: html }} style={{ fontFamily: "serif", lineHeight: 1.6 }} />
      </div>

      {/* Modal overlay */}
      <div
        ref={overlayRef}
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      >
        <div className="bg-background border-2 border-foreground shadow-[6px_6px_0px_hsl(0_0%_5%)] w-full max-w-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="border-b-2 border-foreground px-5 py-3 flex items-center justify-between shrink-0">
            <span className="font-pixel text-[9px] tracking-wide">SESSION NOTES</span>
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrint}
                className="pixel-btn bg-foreground text-primary-foreground font-pixel text-[9px] px-4 py-2"
              >
                Download PDF
              </button>
              <button
                onClick={onClose}
                className="font-pixel text-[9px] text-muted-foreground hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto px-6 py-5 flex-1">
            <p className="font-body text-xs text-muted-foreground mb-4">{docFilename}</p>
            <div
              className="notes-body font-body text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
      </div>

      {/* Inline styles for notes-body markdown elements */}
      <style>{`
        .notes-body h1 { font-size: 1.25rem; font-weight: 700; margin: 1.25rem 0 0.5rem; }
        .notes-body h2 { font-size: 1.05rem; font-weight: 700; margin: 1.1rem 0 0.4rem; border-bottom: 1px solid hsl(0 0% 85%); padding-bottom: 2px; }
        .notes-body h3 { font-size: 0.95rem; font-weight: 600; margin: 0.9rem 0 0.3rem; }
        .notes-body ul { list-style: disc; padding-left: 1.25rem; margin: 0.4rem 0; }
        .notes-body li { margin-bottom: 0.2rem; }
        .notes-body p { margin-bottom: 0.5rem; }
        .notes-body strong { font-weight: 600; }
      `}</style>
    </>
  );
}
