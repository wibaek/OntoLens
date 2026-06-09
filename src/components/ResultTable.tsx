import { compactIri, isIri, truncateMiddle } from "../lib/namespaces";
import type { SparqlBindingValue, SparqlSelectResult } from "../lib/types";

type ResultTableProps = {
  result: SparqlSelectResult | null;
  localNamespaces: string[];
  onOpenIri: (iri: string) => void;
};

export function ResultTable({ result, localNamespaces, onOpenIri }: ResultTableProps) {
  if (!result) {
    return (
      <div className="grid h-full place-items-center bg-white text-center text-sm text-slate-500">
        <div>
          <p className="font-semibold text-slate-900">표시할 SELECT 결과가 없습니다</p>
          <p className="mt-2">SPARQL 패널에서 SELECT 쿼리를 실행하면 테이블이 표시됩니다.</p>
        </div>
      </div>
    );
  }

  if (!result.rows.length) {
    return (
      <div className="grid h-full place-items-center bg-white text-center text-sm text-slate-500">
        <div>
          <p className="font-semibold text-slate-900">빈 결과</p>
          <p className="mt-2">쿼리는 실행됐지만 반환된 row가 없습니다.</p>
        </div>
      </div>
    );
  }

  const tableRows = buildTableRows(result);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">SELECT 결과</h2>
          <p className="text-xs text-slate-500">
            {result.rows.length.toLocaleString("en-US")} rows /{" "}
            {result.variables.length.toLocaleString("en-US")} columns
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 w-14 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-right font-mono text-[11px] font-semibold text-slate-400">
                #
              </th>
              {result.variables.map((variable) => (
                <th
                  key={variable}
                  className="sticky top-0 z-10 min-w-44 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  ?{variable}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map(({ key, row }, index) => (
              <tr key={key}>
                <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-3 py-2 text-right font-mono text-[11px] text-slate-400">
                  {index + 1}
                </td>
                {result.variables.map((variable) => (
                  <td
                    key={variable}
                    className="max-w-80 border-b border-r border-slate-100 px-3 py-2 align-top"
                  >
                    <BindingValue
                      binding={row[variable]}
                      localNamespaces={localNamespaces}
                      onOpenIri={onOpenIri}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildTableRows(result: SparqlSelectResult) {
  const seen = new Map<string, number>();

  return result.rows.map((row) => {
    const baseKey =
      result.variables.map((variable) => row[variable]?.value ?? "unbound").join("|") || "empty";
    const count = seen.get(baseKey) ?? 0;
    seen.set(baseKey, count + 1);

    return {
      key: count ? `${baseKey}:${count}` : baseKey,
      row,
    };
  });
}

function BindingValue({
  binding,
  localNamespaces,
  onOpenIri,
}: {
  binding?: SparqlBindingValue;
  localNamespaces: string[];
  onOpenIri: (iri: string) => void;
}) {
  if (!binding) {
    return <span className="text-xs text-slate-300">unbound</span>;
  }

  if (binding.type === "uri" || isIri(binding.value)) {
    return (
      <button
        type="button"
        title={binding.value}
        onClick={() => onOpenIri(binding.value)}
        className="block max-w-full truncate text-left font-mono text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline"
      >
        {compactIri(binding.value, localNamespaces)}
      </button>
    );
  }

  if (binding.type === "bnode") {
    return <span className="font-mono text-xs text-slate-600">_:{binding.value}</span>;
  }

  return (
    <span title={binding.value} className="block max-w-full break-words text-sm text-slate-800">
      {truncateMiddle(binding.value, 160)}
      {binding["xml:lang"] ? (
        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
          @{binding["xml:lang"]}
        </span>
      ) : null}
      {binding.datatype ? (
        <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
          {compactIri(binding.datatype, localNamespaces)}
        </span>
      ) : null}
    </span>
  );
}
