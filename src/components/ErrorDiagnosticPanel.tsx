import { AlertTriangle } from "lucide-react";

export type ErrorDiagnostic = {
  title: string;
  message: string;
  context: string;
  suggestion: string;
  kind?: string;
  status?: number;
  rawMessage?: string;
};

type ErrorDiagnosticPanelProps = {
  diagnostic: ErrorDiagnostic;
  hasRawResult: boolean;
  onOpenRaw: () => void;
};

export function ErrorDiagnosticPanel({
  diagnostic,
  hasRawResult,
  onOpenRaw,
}: ErrorDiagnosticPanelProps) {
  return (
    <div className="absolute bottom-4 left-4 right-4 z-20 rounded-md border border-red-200 bg-red-50 shadow-lg">
      <div className="flex items-start gap-3 p-4 text-sm text-red-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{diagnostic.title}</h2>
            {diagnostic.status ? <ErrorBadge label={`HTTP ${diagnostic.status}`} /> : null}
            {diagnostic.kind ? <ErrorBadge label={diagnostic.kind} /> : null}
          </div>
          <p className="mt-1 leading-6">{diagnostic.message}</p>
          <div className="mt-3 grid gap-2 text-xs text-red-800 md:grid-cols-[160px_minmax(0,1fr)]">
            <span className="font-semibold uppercase tracking-[0.12em] text-red-500">Request</span>
            <span>{diagnostic.context}</span>
            <span className="font-semibold uppercase tracking-[0.12em] text-red-500">Next</span>
            <span>{diagnostic.suggestion}</span>
          </div>
          {diagnostic.rawMessage ? (
            <pre className="mt-3 max-h-28 overflow-auto rounded border border-red-200 bg-white/70 p-3 font-mono text-[11px] leading-5 text-red-900">
              {diagnostic.rawMessage}
            </pre>
          ) : null}
        </div>
        {hasRawResult ? (
          <button
            type="button"
            onClick={onOpenRaw}
            className="shrink-0 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Raw 보기
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ErrorBadge({ label }: { label: string }) {
  return (
    <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-red-700">
      {label}
    </span>
  );
}
