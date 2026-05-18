type RawResult = {
  title: string;
  content: string;
  meta: string;
};

type RawResultPanelProps = {
  result: RawResult | null;
};

export function RawResultPanel({ result }: RawResultPanelProps) {
  if (!result) {
    return (
      <div className="grid h-full place-items-center bg-white text-center text-sm text-slate-500">
        <div>
          <p className="font-semibold text-slate-900">표시할 raw 결과가 없습니다</p>
          <p className="mt-2">쿼리나 그래프 탐색을 실행하면 마지막 응답이 여기에 표시됩니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4">
        <div>
          <h2 className="text-sm font-semibold">{result.title}</h2>
          <p className="text-xs text-slate-400">{result.meta}</p>
        </div>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[11px] leading-5 text-slate-100">
        {result.content}
      </pre>
    </div>
  );
}
