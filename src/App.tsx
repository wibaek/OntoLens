import {
  Atom,
  Code2,
  Database,
  Eye,
  Filter,
  Layers,
  Link2,
  Loader2,
  Maximize2,
  Network,
  Play,
  RefreshCw,
  Search,
  Settings,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ErrorDiagnostic, ErrorDiagnosticPanel } from "./components/ErrorDiagnosticPanel";
import { GraphCanvas } from "./components/GraphCanvas";
import { GraphErrorBoundary } from "./components/GraphErrorBoundary";
import { RawResultPanel } from "./components/RawResultPanel";
import { ResultTable } from "./components/ResultTable";
import {
  buildClassMapGraph,
  emptyGraphData,
  enforceGraphLimits,
  getNamespaceCounts,
  getNodeDetails,
  isolateNode,
  mergeGraphData,
  quadsToGraphData,
} from "./lib/graph-data";
import { compactIri, formatCount, isIri, truncateMiddle } from "./lib/namespaces";
import {
  buildClassMapConstructQuery,
  buildFullGraphConstructQuery,
  buildNeighborhoodConstructQuery,
  detectSparqlOperation,
  executeConstruct,
  executeSelect,
  fetchEndpointSummary,
  getErrorMessage,
  SparqlClientError,
  searchEndpoint,
  toSelectResult,
} from "./lib/sparql";
import type {
  EndpointSummary,
  ExplorerSettings,
  GraphData,
  GraphFilters,
  LiteralProperty,
  LoadState,
  NamespaceFilters,
  SearchResult,
  SparqlSelectResult,
} from "./lib/types";
import { DEFAULT_ENDPOINT } from "./lib/types";

const defaultSettings: ExplorerSettings = {
  depth: 2,
  nodeLimit: 500,
  edgeLimit: 5000,
  showEdgeLabels: false,
  physicsEnabled: true,
};

const defaultNamespaceFilters: NamespaceFilters = {
  local: true,
  standard: true,
  external: true,
  unknown: true,
};

const namespaceLabels = {
  local: "local project namespace",
  standard: "rdf / rdfs / owl",
  external: "external namespace",
  unknown: "unknown / raw IRI",
};

type ResultView = "graph" | "table" | "raw";

type RawResult = {
  title: string;
  content: string;
  meta: string;
};

function App() {
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [selectedGraph, setSelectedGraph] = useState("auto");
  const [summary, setSummary] = useState<EndpointSummary | null>(null);
  const [graphData, setGraphData] = useState<GraphData>(emptyGraphData);
  const [selectResult, setSelectResult] = useState<SparqlSelectResult | null>(null);
  const [rawResult, setRawResult] = useState<RawResult | null>(null);
  const [activeView, setActiveView] = useState<ResultView>("graph");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [namespaceFilters, setNamespaceFilters] = useState(defaultNamespaceFilters);
  const [predicateFilter, setPredicateFilter] = useState("all");
  const [status, setStatus] = useState<LoadState>("idle");
  const [lastError, setLastError] = useState<ErrorDiagnostic | null>(null);
  const [message, setMessage] = useState("endpoint를 연결하면 class 지도가 여기에 표시됩니다.");
  const [sparqlDraft, setSparqlDraft] = useState(
    buildClassMapConstructQuery(defaultSettings.edgeLimit),
  );
  const [sparqlOpen, setSparqlOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchState, setSearchState] = useState<LoadState>("idle");
  const [focusToken, setFocusToken] = useState(0);
  const cacheRef = useRef(new Map<string, GraphData>());
  const autoConnectRef = useRef(false);
  const neighborhoodRequestRef = useRef(0);

  const selectedDetails = useMemo(
    () => getNodeDetails(graphData, selectedNodeId),
    [graphData, selectedNodeId],
  );
  const namespaceCounts = useMemo(() => getNamespaceCounts(graphData), [graphData]);
  const visibleCounts = useMemo(() => {
    const allowedNodes = new Set(
      graphData.nodes
        .filter((node) => node.kind !== "literal" && namespaceFilters[node.namespaceGroup])
        .map((node) => node.id),
    );
    const visibleEdges = graphData.edges.filter(
      (edge) =>
        allowedNodes.has(edge.source) &&
        allowedNodes.has(edge.target) &&
        (predicateFilter === "all" || edge.predicate === predicateFilter),
    );

    return {
      nodes: allowedNodes.size,
      edges: visibleEdges.length,
    };
  }, [graphData, namespaceFilters, predicateFilter]);

  const graphFilters: GraphFilters = useMemo(
    () => ({
      namespaces: namespaceFilters,
      predicate: predicateFilter,
    }),
    [namespaceFilters, predicateFilter],
  );

  const selectedGraphIri =
    selectedGraph === "auto" || selectedGraph === "default" ? null : selectedGraph;

  const reportDiagnostic = useCallback((diagnostic: ErrorDiagnostic) => {
    setLastError(diagnostic);
    setStatus("error");
    setMessage(diagnostic.message);
  }, []);

  const reportError = useCallback(
    (error: unknown, context: string) => {
      reportDiagnostic(createErrorDiagnostic(error, context));
    },
    [reportDiagnostic],
  );

  const connectEndpoint = useCallback(
    async (graphSelectionOverride?: string) => {
      const graphSelection = graphSelectionOverride ?? selectedGraph;
      let graphIri =
        graphSelection === "auto" || graphSelection === "default" ? null : graphSelection;

      setStatus("loading");
      setLastError(null);
      setMessage("endpoint 요약을 가져오는 중입니다.");
      setSelectedNodeId(null);
      setSelectResult(null);
      setActiveView("graph");
      setSearchResults([]);
      neighborhoodRequestRef.current += 1;

      try {
        let nextSummary = await fetchEndpointSummary(endpoint, graphIri);

        if (graphSelection === "auto" && nextSummary.namedGraphs.length > 0) {
          graphIri = nextSummary.namedGraphs[0].iri;
          setSelectedGraph(graphIri);
          nextSummary = await fetchEndpointSummary(endpoint, graphIri);
        }

        const classMapQuery = buildClassMapConstructQuery(settings.edgeLimit, graphIri);
        setSparqlDraft(classMapQuery);

        const namespaceValues = [
          ...nextSummary.classes.map((item) => item.iri),
          ...nextSummary.predicates.map((item) => item.iri),
          ...nextSummary.namespaces.map((item) => item.namespace),
        ];
        const classQuads = await executeConstruct(endpoint, classMapQuery).catch(() => []);
        const initialGraph = buildClassMapGraph(nextSummary.classes, classQuads, namespaceValues);
        const limited = enforceGraphLimits(initialGraph, settings);

        setSummary(nextSummary);
        setGraphData(limited.graph);
        setRawResult({
          title: "Class map CONSTRUCT",
          content: JSON.stringify(classQuads, null, 2),
          meta: `${formatCount(classQuads.length)} quads`,
        });
        cacheRef.current.clear();
        setStatus("ready");
        setMessage(
          limited.droppedNodes || limited.droppedEdges
            ? `limit 적용: node ${limited.droppedNodes}개, edge ${limited.droppedEdges}개를 제외했습니다.`
            : graphIri
              ? `${compactIri(graphIri)} class map ready`
              : "default class map ready",
        );
      } catch (error) {
        setSummary(null);
        setGraphData(emptyGraphData);
        reportError(error, "Endpoint 연결 및 요약 조회");
      }
    },
    [endpoint, reportError, selectedGraph, settings],
  );

  useEffect(() => {
    if (autoConnectRef.current) {
      return;
    }
    autoConnectRef.current = true;
    void connectEndpoint();
  }, [connectEndpoint]);

  async function loadNeighborhood(iri: string, depth = settings.depth, replace = true) {
    const requestId = neighborhoodRequestRef.current + 1;
    neighborhoodRequestRef.current = requestId;
    const safeDepth = Math.max(1, Math.min(3, depth));
    const cacheKey = `${endpoint}|${selectedGraphIri ?? "default"}|${iri}|${safeDepth}|${settings.edgeLimit}`;
    const cached = cacheRef.current.get(cacheKey);
    const query = buildNeighborhoodConstructQuery(
      iri,
      safeDepth,
      settings.edgeLimit,
      selectedGraphIri,
    );
    setSparqlDraft(query);
    setStatus("loading");
    setLastError(null);
    setActiveView("graph");
    setMessage(
      `${compactIri(iri, graphData.localNamespaces)} 주변 ${safeDepth} depth 탐색 중입니다.`,
    );

    try {
      let incomingGraph = cached;

      if (incomingGraph) {
        setRawResult({
          title: "Cached neighborhood graph",
          content: JSON.stringify(incomingGraph, null, 2),
          meta: `${formatCount(incomingGraph.nodes.length)} nodes / ${formatCount(incomingGraph.edges.length)} edges`,
        });
      } else {
        const quads = await executeConstruct(endpoint, query);
        incomingGraph = quadsToGraphData(quads, graphData.localNamespaces);
        setRawResult({
          title: "Neighborhood CONSTRUCT",
          content: JSON.stringify(quads, null, 2),
          meta: `${formatCount(quads.length)} quads`,
        });
      }

      if (!cached) {
        cacheRef.current.set(cacheKey, incomingGraph);
      }

      if (requestId !== neighborhoodRequestRef.current) {
        return;
      }

      const limited = replace
        ? enforceGraphLimits(incomingGraph, settings)
        : mergeGraphData(graphData, incomingGraph, settings);

      setGraphData(limited.graph);
      setSelectResult(null);
      setSelectedNodeId(iri);
      setFocusToken((value) => value + 1);
      setStatus("ready");
      setMessage(
        limited.droppedNodes || limited.droppedEdges
          ? `결과가 limit을 넘어 node ${limited.droppedNodes}개, edge ${limited.droppedEdges}개를 제외했습니다.`
          : "node neighborhood ready",
      );
    } catch (error) {
      if (requestId !== neighborhoodRequestRef.current) {
        return;
      }

      reportError(error, "선택 노드 주변 그래프 탐색");
    }
  }

  function selectGraphNode(nodeId: string) {
    const node = graphData.nodes.find((item) => item.id === nodeId);

    if (!node || !isIri(node.iri)) {
      setSelectedNodeId(nodeId);
      setFocusToken((value) => value + 1);
      return;
    }

    void loadNeighborhood(node.iri, settings.depth, true);
  }

  async function loadFullGraph() {
    if ((summary?.tripleCount ?? Number.POSITIVE_INFINITY) > settings.edgeLimit) {
      reportDiagnostic({
        title: "전체 그래프가 현재 limit보다 큽니다",
        message: "전체 그래프는 triple count가 edge limit보다 작을 때만 로드할 수 있습니다.",
        context: "전체 그래프 로드",
        kind: "too-large",
        suggestion: "Edge limit을 올리거나, class map 또는 노드 중심 탐색을 사용하세요.",
      });
      return;
    }

    const query = buildFullGraphConstructQuery(settings.edgeLimit, selectedGraphIri);
    setSparqlDraft(query);
    setStatus("loading");
    setLastError(null);
    setActiveView("graph");
    setMessage("작은 전체 그래프를 가져오는 중입니다.");
    neighborhoodRequestRef.current += 1;

    try {
      const quads = await executeConstruct(endpoint, query);
      const nextGraph = quadsToGraphData(quads, graphData.localNamespaces);
      const limited = enforceGraphLimits(nextGraph, settings);
      setGraphData(limited.graph);
      setRawResult({
        title: "Full graph CONSTRUCT",
        content: JSON.stringify(quads, null, 2),
        meta: `${formatCount(quads.length)} quads`,
      });
      setSelectResult(null);
      setSelectedNodeId(null);
      setStatus("ready");
      setMessage("full graph ready");
    } catch (error) {
      reportError(error, "전체 그래프 CONSTRUCT 실행");
    }
  }

  async function runCustomSparql() {
    const operation = detectSparqlOperation(sparqlDraft);

    if (operation === "select") {
      setStatus("loading");
      setLastError(null);
      setMessage("SELECT 결과를 가져오는 중입니다.");
      neighborhoodRequestRef.current += 1;

      try {
        const json = await executeSelect(endpoint, sparqlDraft);
        const result = toSelectResult(json);
        setSelectResult(result);
        setRawResult({
          title: "SELECT JSON",
          content: JSON.stringify(json, null, 2),
          meta: `${formatCount(result.rows.length)} rows`,
        });
        setActiveView("table");
        setStatus("ready");
        setMessage(`SELECT result ready: ${formatCount(result.rows.length)} rows`);
      } catch (error) {
        reportError(error, "SELECT 쿼리 실행");
      }
      return;
    }

    if (operation !== "construct" && operation !== "describe") {
      reportDiagnostic({
        title: "지원하지 않는 SPARQL 쿼리 형식입니다",
        message: "현재는 SELECT, CONSTRUCT, DESCRIBE 쿼리 실행을 지원합니다.",
        context: "SPARQL 실행",
        kind: "syntax",
        suggestion: "ASK는 이후 boolean 결과 뷰를 추가할 때 연결하는 편이 좋습니다.",
      });
      return;
    }

    setStatus("loading");
    setLastError(null);
    setActiveView("graph");
    setMessage("SPARQL 결과를 그래프로 변환하는 중입니다.");
    neighborhoodRequestRef.current += 1;

    try {
      const quads = await executeConstruct(endpoint, sparqlDraft);
      const nextGraph = quadsToGraphData(quads, graphData.localNamespaces);
      const limited = enforceGraphLimits(nextGraph, settings);
      setGraphData(limited.graph);
      setRawResult({
        title: `${operation.toUpperCase()} RDF`,
        content: JSON.stringify(quads, null, 2),
        meta: `${formatCount(quads.length)} quads`,
      });
      setSelectResult(null);
      setSelectedNodeId(null);
      setStatus("ready");
      setMessage("custom SPARQL graph ready");
    } catch (error) {
      reportError(error, "그래프 쿼리 실행");
    }
  }

  async function submitSearch() {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    if (isIri(trimmed)) {
      await loadNeighborhood(trimmed, settings.depth, true);
      return;
    }

    setSearchState("loading");
    setLastError(null);

    try {
      const results = await searchEndpoint(endpoint, trimmed, 24, selectedGraphIri);
      setSearchResults(results);
      setSearchState(results.length ? "ready" : "error");
      if (!results.length) {
        setMessage("검색 결과 없음");
      }
    } catch (error) {
      setSearchState("error");
      reportError(error, "검색 쿼리 실행");
    }
  }

  function updateNamespaceFilter(group: keyof NamespaceFilters) {
    setNamespaceFilters((current) => ({
      ...current,
      [group]: !current[group],
    }));
  }

  function updateSetting<Key extends keyof ExplorerSettings>(
    key: Key,
    value: ExplorerSettings[Key],
  ) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateDepth(depth: number) {
    const nextDepth = Math.max(1, Math.min(3, depth));
    setSettings((current) => ({
      ...current,
      depth: nextDepth,
    }));

    const selectedNode = selectedNodeId
      ? graphData.nodes.find((node) => node.id === selectedNodeId)
      : null;

    if (selectedNode && isIri(selectedNode.iri)) {
      void loadNeighborhood(selectedNode.iri, nextDepth, true);
    }
  }

  return (
    <div className="flex h-screen min-h-[720px] flex-col bg-[#f8fafc] text-slate-950">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-2 pr-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-slate-950 text-white">
            <Network className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-normal">OntoLens</h1>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
              ontology viewer
            </p>
          </div>
        </div>

        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <Link2 className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <span className="sr-only">Endpoint</span>
          <input
            value={endpoint}
            onChange={(event) => {
              setEndpoint(event.target.value);
              setSelectedGraph("auto");
            }}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-slate-700 outline-none"
          />
        </label>

        <div className="relative w-[min(32vw,420px)]">
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
            <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="sr-only">Search</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void submitSearch();
                }
              }}
              placeholder="IRI, label, class, predicate"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          {searchResults.length > 0 ? (
            <div className="absolute right-0 top-11 z-30 max-h-80 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-xl">
              {searchResults.map((result) => (
                <button
                  key={`${result.iri}-${result.type ?? "type"}`}
                  type="button"
                  onClick={() => {
                    setSearchResults([]);
                    setSearchTerm(result.label);
                    void loadNeighborhood(result.iri, settings.depth, true);
                  }}
                  className="flex w-full flex-col gap-1 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
                >
                  <span className="text-sm font-medium text-slate-900">{result.label}</span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {truncateMiddle(result.iri, 72)}
                  </span>
                </button>
              ))}
            </div>
          ) : searchState === "error" && searchTerm.trim() ? (
            <div className="absolute right-0 top-11 z-30 w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500 shadow-xl">
              검색 결과 없음
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setSparqlOpen((value) => !value)}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium shadow-sm hover:bg-slate-50"
        >
          <Code2 className="h-4 w-4" aria-hidden="true" />
          SPARQL 보기
        </button>
        <button
          type="button"
          onClick={() => void connectEndpoint()}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {status === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          탐색 시작
        </button>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white">
          <section className="border-b border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Namespace</h2>
              <Filter className="h-4 w-4 text-slate-500" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              {Object.entries(namespaceLabels).map(([group, label]) => (
                <label
                  key={group}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-1 py-1 text-sm hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={namespaceFilters[group as keyof NamespaceFilters]}
                      onChange={() => updateNamespaceFilter(group as keyof NamespaceFilters)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    <span className="text-slate-700">{label}</span>
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {namespaceCounts[group as keyof NamespaceFilters]}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="border-b border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">탐색 범위</h2>
              <Layers className="h-4 w-4 text-slate-500" aria-hidden="true" />
            </div>
            <label className="mb-3 block">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Depth</span>
                <span>{settings.depth}</span>
              </div>
              <input
                type="range"
                min="1"
                max="3"
                value={settings.depth}
                onChange={(event) => updateDepth(Number(event.target.value))}
                className="w-full accent-blue-600"
              />
            </label>
            <label className="mb-3 block">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Node limit</span>
                <span>{settings.nodeLimit}</span>
              </div>
              <input
                type="number"
                min="50"
                max="2000"
                step="50"
                value={settings.nodeLimit}
                onChange={(event) => updateSetting("nodeLimit", Number(event.target.value))}
                className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Edge limit</span>
                <span>{settings.edgeLimit}</span>
              </div>
              <input
                type="number"
                min="100"
                max="20000"
                step="100"
                value={settings.edgeLimit}
                onChange={(event) => updateSetting("edgeLimit", Number(event.target.value))}
                className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-500"
              />
            </label>
          </section>

          <section className="min-h-0 flex-1 overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">빠른 시작</h2>
              <button
                type="button"
                onClick={() => void loadFullGraph()}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                title="작은 전체 그래프"
              >
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
                전체 그래프
              </button>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
              <Metric label="Triples" value={formatCount(summary?.tripleCount)} />
              <Metric label="Classes" value={formatCount(summary?.classes.length)} />
              <Metric label="Predicates" value={formatCount(summary?.predicates.length)} />
              <Metric label="Graphs" value={formatCount(summary?.namedGraphs.length)} />
            </div>

            <label className="mb-3 block text-xs font-medium text-slate-500">
              Graph
              <select
                value={selectedGraph}
                onChange={(event) => {
                  const nextGraph = event.target.value;
                  setSelectedGraph(nextGraph);
                  void connectEndpoint(nextGraph);
                }}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="auto">auto: first named graph</option>
                <option value="default">default graph</option>
                {summary?.namedGraphs.map((graph) => (
                  <option key={graph.iri} value={graph.iri}>
                    {graph.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="mb-3 block text-xs font-medium text-slate-500">
              Predicate filter
              <select
                value={predicateFilter}
                onChange={(event) => setPredicateFilter(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="all">all predicates</option>
                {summary?.predicates.slice(0, 40).map((predicate) => (
                  <option key={predicate.iri} value={predicate.iri}>
                    {predicate.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-4">
              <SummaryList
                title="Class map"
                items={summary?.classes ?? []}
                onPick={(iri) => void loadNeighborhood(iri, settings.depth, true)}
              />
              <SummaryList title="Predicate frequency" items={summary?.predicates ?? []} />
              <NamedGraphList items={summary?.namedGraphs ?? []} />
            </div>
          </section>
        </aside>

        <section className="relative min-w-0 overflow-hidden bg-white">
          <div className="absolute inset-0 graph-grid" />
          <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-md border border-slate-200 bg-white/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
            <Database className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span className="font-medium text-slate-700">
              {activeView === "raw" && rawResult
                ? `${rawResult.meta} / raw`
                : activeView === "table" && selectResult
                  ? `${formatCount(selectResult.rows.length)} rows / ${formatCount(selectResult.variables.length)} columns`
                  : `${formatCount(visibleCounts.nodes)} nodes / ${formatCount(visibleCounts.edges)} edges`}
            </span>
          </div>
          <div className="absolute left-4 top-16 z-10 inline-flex overflow-hidden rounded-md border border-slate-200 bg-white/90 p-1 text-xs font-semibold shadow-sm backdrop-blur">
            <button
              type="button"
              onClick={() => setActiveView("graph")}
              className={`rounded px-3 py-1.5 ${
                activeView === "graph" ? "bg-slate-950 text-white" : "text-slate-600"
              }`}
            >
              Graph
            </button>
            <button
              type="button"
              onClick={() => setActiveView("table")}
              className={`rounded px-3 py-1.5 ${
                activeView === "table" ? "bg-slate-950 text-white" : "text-slate-600"
              }`}
            >
              Table
            </button>
            <button
              type="button"
              onClick={() => setActiveView("raw")}
              className={`rounded px-3 py-1.5 ${
                activeView === "raw" ? "bg-slate-950 text-white" : "text-slate-600"
              }`}
            >
              Raw
            </button>
          </div>
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            {activeView === "graph" ? (
              <>
                <button
                  type="button"
                  onClick={() => updateSetting("physicsEnabled", !settings.physicsEnabled)}
                  className={`rounded-md border px-3 py-2 text-xs font-semibold shadow-sm ${
                    settings.physicsEnabled
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <Atom className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  Physics
                </button>
                <button
                  type="button"
                  onClick={() => updateSetting("showEdgeLabels", !settings.showEdgeLabels)}
                  className={`rounded-md border px-3 py-2 text-xs font-semibold shadow-sm ${
                    settings.showEdgeLabels
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <Eye className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  Edge label
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => setSettingsOpen((value) => !value)}
              className="rounded-md border border-slate-200 bg-white p-2 text-slate-700 shadow-sm hover:bg-slate-50"
              title="설정"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {activeView === "graph" ? (
            <GraphErrorBoundary
              resetKey={`${graphData.nodes.length}:${graphData.edges.length}:${selectedNodeId ?? "none"}`}
            >
              <GraphCanvas
                graphData={graphData}
                filters={graphFilters}
                selectedNodeId={selectedNodeId}
                showEdgeLabels={settings.showEdgeLabels}
                physicsEnabled={settings.physicsEnabled}
                focusToken={focusToken}
                onNodeSelect={selectGraphNode}
                onStageClick={() => setSearchResults([])}
              />
            </GraphErrorBoundary>
          ) : activeView === "table" ? (
            <ResultTable
              result={selectResult}
              localNamespaces={graphData.localNamespaces}
              onOpenIri={(iri) => void loadNeighborhood(iri, settings.depth, true)}
            />
          ) : (
            <RawResultPanel result={rawResult} />
          )}

          {activeView === "graph" && graphData.nodes.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
              <div className="w-[420px] rounded-lg border border-dashed border-slate-300 bg-white/90 p-6 text-center shadow-sm backdrop-blur">
                <Network className="mx-auto mb-3 h-9 w-9 text-slate-400" aria-hidden="true" />
                <p className="text-sm font-semibold text-slate-900">그래프가 비어 있습니다</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
              </div>
            </div>
          ) : null}

          {status === "error" ? (
            <ErrorDiagnosticPanel
              diagnostic={lastError ?? createErrorDiagnostic(new Error(message), "알 수 없는 작업")}
              hasRawResult={!!rawResult}
              onOpenRaw={() => setActiveView("raw")}
            />
          ) : null}

          {status === "loading" ? (
            <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {message}
            </div>
          ) : null}

          {settingsOpen ? (
            <div className="absolute right-4 top-16 z-30 w-72 rounded-md border border-slate-200 bg-white p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Graph settings</h2>
                <button type="button" onClick={() => setSettingsOpen(false)} className="p-1">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <SettingRow label="Depth" value={`${settings.depth} / MVP max 3`} />
                <SettingRow label="Node limit" value={String(settings.nodeLimit)} />
                <SettingRow label="Edge limit" value={String(settings.edgeLimit)} />
                <SettingRow label="Physics" value={settings.physicsEnabled ? "on" : "off"} />
                <SettingRow label="Cache entries" value={String(cacheRef.current.size)} />
              </div>
            </div>
          ) : null}
        </section>

        <aside className="flex min-h-0 flex-col border-l border-slate-200 bg-white">
          <section className="border-b border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">선택 노드</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedDetails ? selectedDetails.node.label : "선택 없음"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => selectedNodeId && setFocusToken((value) => value + 1)}
                disabled={!selectedNodeId}
                className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                title="이 노드 중심으로 재배치"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </section>

          <section className="min-h-0 flex-1 overflow-auto p-4">
            {selectedDetails ? (
              <div className="space-y-5">
                <div className="space-y-3">
                  <Detail label="IRI" value={truncateMiddle(selectedDetails.node.iri, 120)} mono />
                  <Detail label="Kind" value={selectedDetails.node.kind} />
                  <Detail
                    label="Namespace"
                    value={selectedDetails.node.namespace || selectedDetails.node.namespaceGroup}
                    mono
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Metric label="Incoming" value={String(selectedDetails.incoming)} />
                    <Metric label="Outgoing" value={String(selectedDetails.outgoing)} />
                  </div>
                  {selectedDetails.node.literalPreview ? (
                    <Detail label="Literal" value={selectedDetails.node.literalPreview} />
                  ) : null}
                </div>

                <LiteralProperties properties={selectedDetails.literalProperties} />

                <div className="grid grid-cols-2 gap-2">
                  <ActionButton
                    icon={<Layers className="h-4 w-4" aria-hidden="true" />}
                    label="1 depth 더"
                    onClick={() =>
                      void loadNeighborhood(
                        selectedDetails.node.iri,
                        Math.min(3, settings.depth + 1),
                        true,
                      )
                    }
                  />
                  <ActionButton
                    icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
                    label="중심 재배치"
                    onClick={() => setFocusToken((value) => value + 1)}
                  />
                  <ActionButton
                    icon={<Maximize2 className="h-4 w-4" aria-hidden="true" />}
                    label="선택만"
                    onClick={() => setGraphData(isolateNode(graphData, selectedDetails.node.id))}
                  />
                  <ActionButton
                    icon={<Code2 className="h-4 w-4" aria-hidden="true" />}
                    label="SPARQL"
                    onClick={() => {
                      setSparqlDraft(
                        buildNeighborhoodConstructQuery(
                          selectedDetails.node.iri,
                          settings.depth,
                          settings.edgeLimit,
                          selectedGraphIri,
                        ),
                      );
                      setSparqlOpen(true);
                    }}
                  />
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    이웃 노드
                  </h3>
                  <div className="max-h-56 overflow-auto border-y border-slate-200">
                    {selectedDetails.neighbors.length ? (
                      selectedDetails.neighbors.slice(0, 60).map((neighbor) => (
                        <button
                          key={neighbor.id}
                          type="button"
                          onClick={() => selectGraphNode(neighbor.id)}
                          className="flex w-full items-center justify-between gap-3 border-b border-slate-100 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
                        >
                          <span className="truncate text-slate-800">{neighbor.label}</span>
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                            {neighbor.kind}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="py-4 text-sm text-slate-500">이웃 노드 없음</p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Predicate
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedDetails.predicates.slice(0, 18).map((predicate) => (
                      <span
                        key={predicate}
                        className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800"
                      >
                        {predicate}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid h-full place-items-center text-center text-sm text-slate-500">
                <div>
                  <Network className="mx-auto mb-3 h-8 w-8 text-slate-300" aria-hidden="true" />
                  <p>노드를 선택하세요.</p>
                </div>
              </div>
            )}
          </section>

          <section className="border-t border-slate-200 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">생성된 SPARQL</h2>
              <button
                type="button"
                onClick={() => setSparqlOpen(true)}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900"
              >
                열기
              </button>
            </div>
            <pre className="max-h-32 overflow-auto rounded-md bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-100">
              {sparqlDraft}
            </pre>
          </section>
        </aside>
      </main>

      {sparqlOpen ? (
        <div className="absolute inset-y-16 left-0 z-40 flex w-[520px] flex-col border-r border-slate-200 bg-white shadow-2xl">
          <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-slate-600" aria-hidden="true" />
              <h2 className="text-sm font-semibold">SPARQL</h2>
            </div>
            <button
              type="button"
              onClick={() => setSparqlOpen(false)}
              className="rounded-md p-2 text-slate-600 hover:bg-slate-50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <textarea
            value={sparqlDraft}
            onChange={(event) => setSparqlDraft(event.target.value)}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 outline-none"
          />
          <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3">
            <span className="text-xs text-slate-500">
              {searchState === "loading" ? "검색 중" : message}
            </span>
            <button
              type="button"
              onClick={() => void runCustomSparql()}
              className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              실행
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function createErrorDiagnostic(error: unknown, context: string): ErrorDiagnostic {
  const message = getErrorMessage(error);
  const rawMessage = error instanceof Error ? error.message : String(error);

  if (error instanceof SparqlClientError) {
    return {
      title: getErrorTitle(error.kind),
      message,
      context,
      kind: error.kind,
      status: error.status,
      suggestion: getErrorSuggestion(error.kind),
      rawMessage,
    };
  }

  return {
    title: "요청을 처리하지 못했습니다",
    message,
    context,
    suggestion: "Endpoint URL, 네트워크 연결, 실행한 SPARQL을 순서대로 확인하세요.",
    rawMessage,
  };
}

function getErrorTitle(kind: string) {
  const titles: Record<string, string> = {
    network: "네트워크 요청 실패",
    cors: "브라우저 CORS 차단",
    auth: "Endpoint 인증 실패",
    syntax: "SPARQL 문법 오류",
    "too-large": "결과가 너무 큼",
    empty: "결과 없음",
    endpoint: "Endpoint 오류",
  };

  return titles[kind] ?? "SPARQL 요청 실패";
}

function getErrorSuggestion(kind: string) {
  const suggestions: Record<string, string> = {
    network: "Endpoint URL, VPN, TLS 인증서, 사내망 접근 가능 여부를 확인하세요.",
    cors: "브라우저 직접 요청이 막힌 상태입니다. Endpoint CORS 허용이나 프록시 구성이 필요합니다.",
    auth: "인증이 필요한 endpoint입니다. 인증 헤더나 접근 권한 설정을 확인하세요.",
    syntax: "SPARQL 패널에서 생성된 쿼리를 열고 endpoint가 반환한 문법 오류 위치를 확인하세요.",
    "too-large": "Depth, node limit, edge limit을 낮추거나 더 좁은 노드 중심 탐색을 사용하세요.",
    empty: "선택한 named graph, namespace, 검색어가 실제 데이터와 맞는지 확인하세요.",
    endpoint: "Endpoint가 오류 응답을 반환했습니다. raw message와 서버 로그를 함께 확인하세요.",
  };

  return suggestions[kind] ?? "Endpoint 응답과 실행한 SPARQL을 함께 확인하세요.";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function SummaryList({
  title,
  items,
  onPick,
}: {
  title: string;
  items: { iri: string; label: string; count: number }[];
  onPick?: (iri: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </h3>
      <div className="max-h-56 overflow-auto border-y border-slate-200">
        {items.length ? (
          items.slice(0, 40).map((item) => {
            const content = (
              <>
                <span className="truncate text-slate-800">{item.label}</span>
                <span className="shrink-0 font-mono text-[11px] text-slate-400">
                  {formatCount(item.count)}
                </span>
              </>
            );

            return onPick ? (
              <button
                key={item.iri}
                type="button"
                onClick={() => onPick(item.iri)}
                className="flex w-full items-center justify-between gap-3 border-b border-slate-100 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
              >
                {content}
              </button>
            ) : (
              <div
                key={item.iri}
                className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0"
              >
                {content}
              </div>
            );
          })
        ) : (
          <p className="py-4 text-sm text-slate-500">표시할 항목 없음</p>
        )}
      </div>
    </div>
  );
}

function NamedGraphList({ items }: { items: { iri: string; label: string }[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        Named graph
      </h3>
      <div className="max-h-36 overflow-auto border-y border-slate-200">
        {items.slice(0, 20).map((item) => (
          <div key={item.iri} className="border-b border-slate-100 py-2 text-sm last:border-0">
            <div className="truncate font-medium text-slate-800">{item.label}</div>
            <div className="truncate font-mono text-[11px] text-slate-400">{item.iri}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div
        className={`break-words text-sm leading-6 text-slate-800 ${
          mono ? "font-mono text-xs" : "font-medium"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function LiteralProperties({ properties }: { properties: LiteralProperty[] }) {
  if (!properties.length) {
    return null;
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        속성
      </h3>
      <div className="max-h-64 overflow-auto border-y border-slate-200">
        {properties.slice(0, 80).map((property) => (
          <div
            key={`${property.predicate}|${property.value}|${property.datatype ?? ""}|${property.language ?? ""}`}
            className="border-b border-slate-100 py-2 last:border-0"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-xs font-semibold text-amber-700">
                {property.label}
              </span>
              {property.count > 1 ? (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                  x{property.count}
                </span>
              ) : null}
            </div>
            <div className="mt-1 break-words text-sm leading-6 text-slate-800">
              {property.value}
            </div>
            {property.datatype || property.language ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {property.datatype ? (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-700">
                    {compactIri(property.datatype)}
                  </span>
                ) : null}
                {property.language ? (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500">
                    @{property.language}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
    >
      {icon}
      {label}
    </button>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-xs font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export default App;
