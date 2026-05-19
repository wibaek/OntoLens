import {
  compactIri,
  detectNamespaceGroup,
  getNamespace,
  inferNamespaceCandidates,
  truncateLiteral,
} from "./namespaces";
import type {
  CountItem,
  GraphData,
  GraphEdge,
  GraphLimits,
  GraphNode,
  NamespaceGroup,
  NodeDetails,
  NodeKind,
  RdfQuad,
  RdfTerm,
} from "./types";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_CLASS = "http://www.w3.org/2000/01/rdf-schema#Class";
const RDFS_SUBCLASS = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
const OWL_CLASS = "http://www.w3.org/2002/07/owl#Class";
const RDF_PROPERTY = "http://www.w3.org/1999/02/22-rdf-syntax-ns#Property";
const OWL_OBJECT_PROPERTY = "http://www.w3.org/2002/07/owl#ObjectProperty";
const OWL_DATATYPE_PROPERTY = "http://www.w3.org/2002/07/owl#DatatypeProperty";

export const emptyGraphData: GraphData = {
  nodes: [],
  edges: [],
  localNamespaces: [],
};

export function buildClassMapGraph(
  classes: CountItem[],
  quads: RdfQuad[],
  namespaceValues: string[],
) {
  const { localNamespaces } = inferNamespaceCandidates(
    [...namespaceValues, ...classes.map((item) => item.iri)],
    classes.map((item) => item.namespace),
  );
  const graphData = quadsToGraphData(quads, localNamespaces);
  const nodes = new Map(graphData.nodes.map((node) => [node.id, node]));

  for (const item of classes) {
    const existing = nodes.get(item.iri);
    const namespace = getNamespace(item.iri);
    nodes.set(item.iri, {
      id: item.iri,
      iri: item.iri,
      label: compactIri(item.iri, localNamespaces),
      kind: "class",
      namespace,
      namespaceGroup: detectNamespaceGroup(item.iri, localNamespaces),
      types: existing?.types ?? [OWL_CLASS],
      count: item.count,
      x: existing?.x,
      y: existing?.y,
    });
  }

  return enforceGraphLimits(
    {
      ...graphData,
      nodes: [...nodes.values()],
      localNamespaces,
    },
    { nodeLimit: 500, edgeLimit: 5000 },
  ).graph;
}

export function quadsToGraphData(quads: RdfQuad[], localNamespaces: string[]): GraphData {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  for (const quad of quads) {
    const subject = ensureNode(nodes, quad.subject, localNamespaces);
    const object = ensureNode(nodes, quad.object, localNamespaces);
    applySemanticHints(subject, object, quad.predicate.value);

    const edgeId = `${subject.id}|${quad.predicate.value}|${object.id}`;
    const edgeLabel = compactIri(quad.predicate.value, localNamespaces);
    const existingEdge = edges.get(edgeId);

    if (existingEdge) {
      existingEdge.count += 1;
    } else {
      edges.set(edgeId, {
        id: edgeId,
        source: subject.id,
        target: object.id,
        predicate: quad.predicate.value,
        label: edgeLabel,
        count: 1,
      });
    }
  }

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    localNamespaces,
  };
}

export function mergeGraphData(base: GraphData, incoming: GraphData, limits: GraphLimits) {
  const nodes = new Map(base.nodes.map((node) => [node.id, node]));
  const edges = new Map(base.edges.map((edge) => [edge.id, edge]));

  for (const node of incoming.nodes) {
    const existing = nodes.get(node.id);
    nodes.set(node.id, existing ? mergeNode(existing, node) : node);
  }

  for (const edge of incoming.edges) {
    const existing = edges.get(edge.id);
    if (existing) {
      existing.count += edge.count;
    } else {
      edges.set(edge.id, edge);
    }
  }

  return enforceGraphLimits(
    {
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      localNamespaces: [...new Set([...base.localNamespaces, ...incoming.localNamespaces])],
    },
    limits,
  );
}

export function enforceGraphLimits(graph: GraphData, limits: GraphLimits) {
  const nodes = graph.nodes.slice(0, limits.nodeLimit);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .slice(0, limits.edgeLimit);

  return {
    graph: {
      ...graph,
      nodes,
      edges,
    },
    droppedNodes: Math.max(0, graph.nodes.length - nodes.length),
    droppedEdges: Math.max(0, graph.edges.length - edges.length),
  };
}

export function getNodeDetails(graph: GraphData, nodeId: string | null): NodeDetails | null {
  if (!nodeId) {
    return null;
  }

  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) {
    return null;
  }

  const nodeMap = new Map(graph.nodes.map((item) => [item.id, item]));
  const incomingEdges = graph.edges.filter((edge) => edge.target === nodeId);
  const outgoingEdges = graph.edges.filter((edge) => edge.source === nodeId);
  const literalProperties = outgoingEdges
    .map((edge) => {
      const target = nodeMap.get(edge.target);
      if (!target || target.kind !== "literal") {
        return null;
      }

      return {
        predicate: edge.predicate,
        label: edge.label,
        value: target.iri,
        datatype: target.literalDatatype,
        language: target.literalLanguage,
        count: edge.count,
      };
    })
    .filter((item): item is NonNullable<typeof item> => !!item);
  const neighborLinks = [
    ...incomingEdges.map((edge) => ({
      edge,
      direction: "incoming" as const,
      neighborId: edge.source,
    })),
    ...outgoingEdges.map((edge) => ({
      edge,
      direction: "outgoing" as const,
      neighborId: edge.target,
    })),
  ]
    .map(({ edge, direction, neighborId }) => {
      const neighbor = nodeMap.get(neighborId);
      const subject = nodeMap.get(edge.source);
      const object = nodeMap.get(edge.target);
      if (!neighbor || !subject || !object || neighbor.kind === "literal") {
        return null;
      }

      return {
        subject,
        node: neighbor,
        object,
        direction,
        predicate: edge.predicate,
        label: edge.label,
        count: edge.count,
      };
    })
    .filter((item): item is NonNullable<typeof item> => !!item);

  return {
    node,
    incoming: incomingEdges.length,
    outgoing: outgoingEdges.length,
    neighborLinks,
    literalProperties,
    predicates: [...new Set([...incomingEdges, ...outgoingEdges].map((edge) => edge.label))],
  };
}

export function isolateNode(graph: GraphData, nodeId: string): GraphData {
  const node = graph.nodes.find((item) => item.id === nodeId);

  return {
    ...graph,
    nodes: node ? [node] : [],
    edges: [],
  };
}

export function getNamespaceCounts(graph: GraphData) {
  const counts: Record<NamespaceGroup, number> = {
    local: 0,
    standard: 0,
    external: 0,
    unknown: 0,
  };

  for (const node of graph.nodes) {
    counts[node.namespaceGroup] += 1;
  }

  return counts;
}

function ensureNode(
  nodes: Map<string, GraphNode>,
  term: RdfTerm,
  localNamespaces: string[],
): GraphNode {
  const id = getTermId(term);
  const existing = nodes.get(id);

  if (existing) {
    return existing;
  }

  const namespace = term.termType === "iri" ? getNamespace(term.value) : "";
  const namespaceGroup =
    term.termType === "iri" ? detectNamespaceGroup(term.value, localNamespaces) : "unknown";
  const isLiteral = term.termType === "literal";
  const node: GraphNode = {
    id,
    iri: term.value,
    label: isLiteral ? truncateLiteral(term.value, 48) : compactIri(term.value, localNamespaces),
    kind: isLiteral ? "literal" : namespaceGroup === "external" ? "external" : "unknown",
    namespace,
    namespaceGroup,
    types: [],
    literalPreview: isLiteral ? truncateLiteral(term.value) : undefined,
    literalDatatype: isLiteral ? term.datatype : undefined,
    literalLanguage: isLiteral ? term.language : undefined,
  };

  nodes.set(id, node);
  return node;
}

function getTermId(term: RdfTerm) {
  if (term.termType === "literal") {
    return `literal:${hashString(`${term.value}|${term.datatype ?? ""}|${term.language ?? ""}`)}`;
  }

  if (term.termType === "blank") {
    return `blank:${term.value}`;
  }

  return term.value;
}

function applySemanticHints(subject: GraphNode, object: GraphNode, predicate: string) {
  if (predicate === RDFS_SUBCLASS) {
    upgradeKind(subject, "class");
    upgradeKind(object, "class");
    return;
  }

  if (predicate !== RDF_TYPE) {
    if (subject.kind === "unknown") {
      upgradeKind(subject, "instance");
    }
    return;
  }

  if (!subject.types.includes(object.iri)) {
    subject.types.push(object.iri);
  }

  if (object.iri === OWL_CLASS || object.iri === RDFS_CLASS) {
    upgradeKind(subject, "class");
    upgradeKind(object, "class");
    return;
  }

  if ([RDF_PROPERTY, OWL_OBJECT_PROPERTY, OWL_DATATYPE_PROPERTY].includes(object.iri)) {
    upgradeKind(subject, "property");
    upgradeKind(object, "class");
    return;
  }

  upgradeKind(subject, "instance");
}

function upgradeKind(node: GraphNode, kind: NodeKind) {
  if (node.namespaceGroup === "external" && kind !== "class") {
    node.kind = "external";
    return;
  }

  if (kind === "class" || node.kind === "unknown" || node.kind === "literal") {
    node.kind = kind;
  }
}

function mergeNode(base: GraphNode, incoming: GraphNode): GraphNode {
  return {
    ...base,
    kind: rankKind(incoming.kind) > rankKind(base.kind) ? incoming.kind : base.kind,
    types: [...new Set([...base.types, ...incoming.types])],
    count: base.count ?? incoming.count,
    literalPreview: base.literalPreview ?? incoming.literalPreview,
    literalDatatype: base.literalDatatype ?? incoming.literalDatatype,
    literalLanguage: base.literalLanguage ?? incoming.literalLanguage,
  };
}

function rankKind(kind: NodeKind) {
  const ranks: Record<NodeKind, number> = {
    unknown: 0,
    external: 1,
    literal: 2,
    property: 3,
    instance: 4,
    class: 5,
  };
  return ranks[kind];
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
