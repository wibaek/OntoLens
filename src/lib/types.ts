export const DEFAULT_ENDPOINT = "https://rnd-fuseki.ninewatt.com/ds/query";

export type NodeKind = "class" | "instance" | "property" | "literal" | "external" | "unknown";

export type NamespaceGroup = "local" | "standard" | "external" | "unknown";

export type LoadState = "idle" | "loading" | "ready" | "error";

export type RdfTermType = "iri" | "blank" | "literal";

export type RdfTerm = {
  value: string;
  termType: RdfTermType;
  datatype?: string;
  language?: string;
};

export type RdfQuad = {
  subject: RdfTerm;
  predicate: RdfTerm;
  object: RdfTerm;
};

export type SparqlBindingValue = {
  type: string;
  value: string;
  datatype?: string;
  "xml:lang"?: string;
};

export type SparqlSelectResult = {
  variables: string[];
  rows: Record<string, SparqlBindingValue>[];
};

export type CountItem = {
  iri: string;
  label: string;
  count: number;
  namespace: string;
};

export type NamedGraph = {
  iri: string;
  label: string;
};

export type NamespaceCandidate = {
  namespace: string;
  label: string;
  group: NamespaceGroup;
  count: number;
};

export type EndpointSummary = {
  tripleCount: number | null;
  classes: CountItem[];
  predicates: CountItem[];
  namedGraphs: NamedGraph[];
  namespaces: NamespaceCandidate[];
};

export type GraphNode = {
  id: string;
  iri: string;
  label: string;
  kind: NodeKind;
  namespace: string;
  namespaceGroup: NamespaceGroup;
  types: string[];
  count?: number;
  literalPreview?: string;
  literalDatatype?: string;
  literalLanguage?: string;
  x?: number;
  y?: number;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  predicate: string;
  label: string;
  count: number;
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  localNamespaces: string[];
};

export type SearchResult = {
  iri: string;
  label: string;
  type?: string;
};

export type GraphLimits = {
  nodeLimit: number;
  edgeLimit: number;
};

export type ExplorerSettings = GraphLimits & {
  depth: number;
  showEdgeLabels: boolean;
  physicsEnabled: boolean;
};

export type NamespaceFilters = Record<NamespaceGroup, boolean>;

export type GraphFilters = {
  namespaces: NamespaceFilters;
  predicate: string;
};

export type LiteralProperty = {
  predicate: string;
  label: string;
  value: string;
  datatype?: string;
  language?: string;
  count: number;
};

export type NeighborLink = {
  subject: GraphNode;
  node: GraphNode;
  object: GraphNode;
  direction: "incoming" | "outgoing";
  predicate: string;
  label: string;
  count: number;
};

export type NodeDetails = {
  node: GraphNode;
  incoming: number;
  outgoing: number;
  neighborLinks: NeighborLink[];
  literalProperties: LiteralProperty[];
  predicates: string[];
};
