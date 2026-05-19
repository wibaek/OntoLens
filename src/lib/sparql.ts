import { Parser } from "n3";
import { compactIri, getNamespace, inferNamespaceCandidates } from "./namespaces";
import type {
  CountItem,
  EndpointSummary,
  NamedGraph,
  RdfQuad,
  RdfTerm,
  SearchResult,
  SparqlBindingValue,
  SparqlSelectResult,
} from "./types";

const PREFIXES = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX schema: <https://schema.org/>
`;

type SparqlJson = {
  head?: {
    vars?: string[];
  };
  results: {
    bindings: Record<string, SparqlBindingValue>[];
  };
};

export type SparqlOperation = "select" | "construct" | "describe" | "ask" | "unknown";

export type SparqlErrorKind =
  | "network"
  | "cors"
  | "auth"
  | "syntax"
  | "too-large"
  | "empty"
  | "endpoint";

export class SparqlClientError extends Error {
  kind: SparqlErrorKind;
  status?: number;

  constructor(kind: SparqlErrorKind, message: string, status?: number) {
    super(message);
    this.name = "SparqlClientError";
    this.kind = kind;
    this.status = status;
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof SparqlClientError) {
    if (error.kind === "cors") {
      return "브라우저에서 endpoint에 접근하지 못했습니다. CORS 설정이나 네트워크를 확인하세요.";
    }
    if (error.kind === "auth") {
      return "endpoint 인증이 필요하거나 접근 권한이 없습니다.";
    }
    if (error.kind === "syntax") {
      return "SPARQL 문법 오류가 반환되었습니다.";
    }
    if (error.kind === "too-large") {
      return "결과가 너무 큽니다. depth 또는 limit을 낮춰주세요.";
    }
    if (error.kind === "empty") {
      return "endpoint에서 결과를 찾지 못했습니다.";
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "알 수 없는 오류가 발생했습니다.";
}

async function requestSparql(endpoint: string, query: string, accept: string) {
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: accept,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: new URLSearchParams({ query }).toString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";
    const kind = /failed to fetch|networkerror|cors/i.test(message) ? "cors" : "network";
    throw new SparqlClientError(kind, message);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const message = body || `${response.status} ${response.statusText}`;

    if (response.status === 401 || response.status === 403) {
      throw new SparqlClientError("auth", message, response.status);
    }
    if (response.status === 400 || response.status === 422) {
      throw new SparqlClientError("syntax", message, response.status);
    }
    if (response.status === 413 || response.status === 429) {
      throw new SparqlClientError("too-large", message, response.status);
    }

    throw new SparqlClientError("endpoint", message, response.status);
  }

  return response;
}

export async function executeSelect(endpoint: string, query: string) {
  const response = await requestSparql(endpoint, query, "application/sparql-results+json");
  return (await response.json()) as SparqlJson;
}

export function toSelectResult(json: SparqlJson): SparqlSelectResult {
  const inferredVariables = [
    ...new Set(json.results.bindings.flatMap((binding) => Object.keys(binding))),
  ];

  return {
    variables: json.head?.vars?.length ? json.head.vars : inferredVariables,
    rows: json.results.bindings,
  };
}

export function detectSparqlOperation(query: string): SparqlOperation {
  let body = query.replace(/#[^\n\r]*/g, " ").trim();

  while (body) {
    const prefixMatch = body.match(/^(PREFIX\s+[A-Za-z][\w-]*:\s*<[^>]*>|BASE\s*<[^>]*>)\s*/i);
    if (!prefixMatch) {
      break;
    }
    body = body.slice(prefixMatch[0].length).trimStart();
  }

  const operation = body.match(/^(SELECT|CONSTRUCT|DESCRIBE|ASK)\b/i)?.[1]?.toLowerCase();

  if (
    operation === "select" ||
    operation === "construct" ||
    operation === "describe" ||
    operation === "ask"
  ) {
    return operation;
  }

  return "unknown";
}

export async function executeConstruct(endpoint: string, query: string): Promise<RdfQuad[]> {
  const response = await requestSparql(
    endpoint,
    query,
    "text/turtle, application/n-triples;q=0.9, application/rdf+xml;q=0.8, */*;q=0.1",
  );
  const text = await response.text();

  if (!text.trim()) {
    return [];
  }

  try {
    const parser = new Parser({ format: "text/turtle" });
    return parser.parse(text).map((quad) => ({
      subject: toRdfTerm(quad.subject),
      predicate: toRdfTerm(quad.predicate),
      object: toRdfTerm(quad.object),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse RDF response";
    throw new SparqlClientError("syntax", message);
  }
}

function toRdfTerm(term: {
  termType: string;
  value: string;
  datatype?: { value: string };
  language?: string;
}) {
  const termType: RdfTerm["termType"] =
    term.termType === "Literal" ? "literal" : term.termType === "BlankNode" ? "blank" : "iri";

  return {
    value: term.value,
    termType,
    datatype: term.datatype?.value,
    language: term.language,
  };
}

function countFromBinding(binding?: SparqlBindingValue) {
  if (!binding) {
    return 0;
  }

  const count = Number.parseInt(binding.value, 10);
  return Number.isNaN(count) ? 0 : count;
}

function bindingValue(binding?: SparqlBindingValue) {
  return binding?.value ?? "";
}

function graphPattern(body: string, graphIri: string | null = null) {
  if (!graphIri) {
    return body;
  }

  return `GRAPH <${graphIri}> {
${indent(body)}
  }`;
}

function indent(value: string) {
  return value
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

export async function fetchEndpointSummary(
  endpoint: string,
  graphIri: string | null = null,
): Promise<EndpointSummary> {
  const [tripleCountJson, classJson, predicateJson, iriJson, graphResult] = await Promise.all([
    executeSelect(endpoint, buildTripleCountQuery(graphIri)),
    executeSelect(endpoint, buildClassListQuery(100, graphIri)),
    executeSelect(endpoint, buildPredicateListQuery(100, graphIri)),
    executeSelect(endpoint, buildIriSampleQuery(250, graphIri)),
    executeSelect(endpoint, buildNamedGraphQuery(100)).catch(() => null),
  ]);

  const tripleCount = countFromBinding(tripleCountJson.results.bindings[0]?.count);

  const classes = classJson.results.bindings.map((binding) => toCountItem(binding, "class"));
  const predicates = predicateJson.results.bindings.map((binding) => toCountItem(binding, "p"));
  const namedGraphs: NamedGraph[] =
    graphResult?.results.bindings.map((binding) => {
      const iri = bindingValue(binding.g);
      return { iri, label: compactIri(iri) };
    }) ?? [];

  const namespaceValues = [
    ...classes.map((item) => item.iri),
    ...predicates.map((item) => item.iri),
    ...iriJson.results.bindings.map((binding) => bindingValue(binding.iri)),
  ].filter(Boolean);
  const classNamespaces = classes.map((item) => getNamespace(item.iri)).filter(Boolean);
  const { candidates } = inferNamespaceCandidates(namespaceValues, classNamespaces);

  return {
    tripleCount,
    classes,
    predicates,
    namedGraphs,
    namespaces: candidates,
  };
}

function toCountItem(binding: Record<string, SparqlBindingValue>, variable: string): CountItem {
  const iri = bindingValue(binding[variable]);
  return {
    iri,
    label: compactIri(iri),
    count: countFromBinding(binding.count),
    namespace: getNamespace(iri),
  };
}

export function buildTripleCountQuery(graphIri: string | null = null) {
  return `${PREFIXES}
SELECT (COUNT(*) AS ?count) WHERE {
  ${graphPattern("?s ?p ?o .", graphIri)}
}`;
}

export function buildClassListQuery(limit: number, graphIri: string | null = null) {
  return `${PREFIXES}
SELECT ?class (COUNT(*) AS ?count) WHERE {
  ${graphPattern(
    `?s a ?class .
FILTER(isIRI(?class))`,
    graphIri,
  )}
}
GROUP BY ?class
ORDER BY DESC(?count)
LIMIT ${limit}`;
}

export function buildPredicateListQuery(limit: number, graphIri: string | null = null) {
  return `${PREFIXES}
SELECT ?p (COUNT(*) AS ?count) WHERE {
  ${graphPattern(
    `?s ?p ?o .
FILTER(isIRI(?p))`,
    graphIri,
  )}
}
GROUP BY ?p
ORDER BY DESC(?count)
LIMIT ${limit}`;
}

export function buildNamedGraphQuery(limit: number) {
  return `${PREFIXES}
SELECT DISTINCT ?g WHERE {
  GRAPH ?g {
    ?s ?p ?o .
  }
}
LIMIT ${limit}`;
}

export function buildIriSampleQuery(limit: number, graphIri: string | null = null) {
  return `${PREFIXES}
SELECT DISTINCT ?iri WHERE {
  ${graphPattern(
    `{
    ?iri ?p ?o .
    FILTER(isIRI(?iri))
  }
  UNION {
    ?s ?iri ?o .
    FILTER(isIRI(?iri))
  }
  UNION {
    ?s ?p ?iri .
    FILTER(isIRI(?iri))
  }`,
    graphIri,
  )}
}
LIMIT ${limit}`;
}

export function buildClassMapConstructQuery(limit: number, graphIri: string | null = null) {
  return `${PREFIXES}
CONSTRUCT {
  ?class a owl:Class .
  ?class rdfs:subClassOf ?parent .
}
WHERE {
  ${graphPattern(
    `{
    SELECT DISTINCT ?class WHERE {
      {
        ?s a ?class .
        FILTER(isIRI(?class))
      }
      UNION {
        ?class a owl:Class .
        FILTER(isIRI(?class))
      }
      UNION {
        ?class a rdfs:Class .
        FILTER(isIRI(?class))
      }
    }
    LIMIT 250
  }
  OPTIONAL {
    ?class rdfs:subClassOf ?parent .
    FILTER(isIRI(?parent))
  }`,
    graphIri,
  )}
}
LIMIT ${limit}`;
}

export function buildFullGraphConstructQuery(limit: number, graphIri: string | null = null) {
  return `${PREFIXES}
CONSTRUCT {
  ?s ?p ?o .
}
WHERE {
  ${graphPattern(
    `?s ?p ?o .
FILTER(!isLiteral(?o) || STRLEN(STR(?o)) < 280)
FILTER(?p NOT IN (rdfs:subClassOf, rdfs:domain, rdfs:range, rdfs:label))
FILTER(
  ?p != rdf:type ||
  ?o NOT IN (owl:Class, rdfs:Class, rdf:Property, owl:ObjectProperty, owl:DatatypeProperty, owl:Ontology)
)`,
    graphIri,
  )}
}
LIMIT ${limit}`;
}

export function buildNeighborhoodConstructQuery(
  iri: string,
  depth: number,
  limit: number,
  graphIri: string | null = null,
) {
  const safeDepth = Math.max(1, Math.min(depth, 3));
  const levels: string[] = [
    `{
    VALUES ?root { <${iri}> }
    ?root ?p1 ?o1 .
    FILTER(!isLiteral(?o1) || STRLEN(STR(?o1)) < 280)
  }
  UNION {
    VALUES ?root { <${iri}> }
    ?i1 ?ip1 ?root .
    FILTER(isIRI(?i1) || isBlank(?i1))
  }`,
  ];

  if (safeDepth >= 2) {
    levels.push(`{
    VALUES ?root { <${iri}> }
    ?root ?p1 ?o1 .
    FILTER(isIRI(?o1) || isBlank(?o1))
    ?o1 ?p2 ?o2 .
    FILTER(!isLiteral(?o2) || STRLEN(STR(?o2)) < 280)
  }
  UNION {
    VALUES ?root { <${iri}> }
    ?i1 ?ip1 ?root .
    FILTER(isIRI(?i1) || isBlank(?i1))
    ?i2 ?ip2 ?i1 .
    FILTER(isIRI(?i2) || isBlank(?i2))
  }`);
  }

  if (safeDepth >= 3) {
    levels.push(`{
    VALUES ?root { <${iri}> }
    ?root ?p1 ?o1 .
    FILTER(isIRI(?o1) || isBlank(?o1))
    ?o1 ?p2 ?o2 .
    FILTER(isIRI(?o2) || isBlank(?o2))
    ?o2 ?p3 ?o3 .
    FILTER(!isLiteral(?o3) || STRLEN(STR(?o3)) < 280)
  }
  UNION {
    VALUES ?root { <${iri}> }
    ?i1 ?ip1 ?root .
    FILTER(isIRI(?i1) || isBlank(?i1))
    ?i2 ?ip2 ?i1 .
    FILTER(isIRI(?i2) || isBlank(?i2))
    ?i3 ?ip3 ?i2 .
    FILTER(isIRI(?i3) || isBlank(?i3))
  }`);
  }

  return `${PREFIXES}
CONSTRUCT {
  ?root ?p1 ?o1 .
  ?i1 ?ip1 ?root .
  ?o1 ?p2 ?o2 .
  ?i2 ?ip2 ?i1 .
  ?o2 ?p3 ?o3 .
  ?i3 ?ip3 ?i2 .
}
WHERE {
  ${graphPattern(levels.join("\n  UNION\n  "), graphIri)}
}
LIMIT ${limit}`;
}

export function buildSearchQuery(
  searchTerm: string,
  limit: number,
  graphIri: string | null = null,
) {
  const escaped = escapeSparqlString(searchTerm.trim());

  return `${PREFIXES}
SELECT DISTINCT ?iri ?label ?type WHERE {
  ${graphPattern(
    `{
    ?iri ?p ?o .
    FILTER(isIRI(?iri))
  }
  UNION {
    ?s ?iri ?o .
    FILTER(isIRI(?iri))
  }
  UNION {
    ?s ?p ?iri .
    FILTER(isIRI(?iri))
  }
  OPTIONAL { ?iri (rdfs:label|skos:prefLabel|schema:name) ?label . }
  OPTIONAL { ?iri a ?type . }
  FILTER(
    CONTAINS(LCASE(STR(?iri)), LCASE("${escaped}")) ||
    (BOUND(?label) && CONTAINS(LCASE(STR(?label)), LCASE("${escaped}")))
  )`,
    graphIri,
  )}
}
LIMIT ${limit}`;
}

export async function searchEndpoint(
  endpoint: string,
  searchTerm: string,
  limit: number,
  graphIri: string | null = null,
): Promise<SearchResult[]> {
  const json = await executeSelect(endpoint, buildSearchQuery(searchTerm, limit, graphIri));

  return json.results.bindings.map((binding) => {
    const iri = bindingValue(binding.iri);
    return {
      iri,
      label: bindingValue(binding.label) || compactIri(iri),
      type: bindingValue(binding.type) || undefined,
    };
  });
}

function escapeSparqlString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
