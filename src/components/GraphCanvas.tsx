import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import { graphNodeVisuals } from "../lib/graph-legend";
import { formatIriPath } from "../lib/namespaces";
import type { GraphData, GraphEdge, GraphFilters, GraphNode, NamespaceFilters } from "../lib/types";

const width = 1440;
const height = 900;
const defaultViewBox = { x: 0, y: 0, width, height };
const minViewBoxWidth = width / 4.5;
const maxViewBoxWidth = width * 2.6;
const layoutFrameIntervalMs = 1000 / 30;
const viewBoxIdleDelayMs = 90;
const panSurfaceExtent = 1_000_000;

const rdfTypePredicate = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

type ViewBox = typeof defaultViewBox;

function formatViewBox(box: ViewBox) {
  return `${box.x} ${box.y} ${box.width} ${box.height}`;
}

type SimNode = GraphNode &
  SimulationNodeDatum & {
    degree: number;
    labelRank: number;
  };

type SimEdge = Omit<GraphEdge, "source" | "target"> &
  SimulationLinkDatum<SimNode> & {
    source: string | SimNode;
    target: string | SimNode;
    sourceId: string;
    targetId: string;
  };

type VisibleGraph = {
  nodes: SimNode[];
  edges: SimEdge[];
  labelIds: Set<string>;
};

type GraphCanvasProps = {
  graphData: GraphData;
  filters: GraphFilters;
  selectedNodeId: string | null;
  showEdgeLabels: boolean;
  compactRdfType: boolean;
  physicsEnabled: boolean;
  layoutSpacing: number;
  focusToken: number;
  onNodeSelect: (nodeId: string) => void;
  onStageClick: () => void;
};

export function GraphCanvas({
  graphData,
  filters,
  selectedNodeId,
  showEdgeLabels,
  compactRdfType,
  physicsEnabled,
  layoutSpacing,
  focusToken,
  onNodeSelect,
  onStageClick,
}: GraphCanvasProps) {
  const visibleGraph = useMemo(() => buildVisibleGraph(graphData, filters), [filters, graphData]);
  const [layout, setLayout] = useState<VisibleGraph>(visibleGraph);
  const [viewBox, setViewBox] = useState<ViewBox>(defaultViewBox);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewBoxRef = useRef<ViewBox>(defaultViewBox);
  const viewBoxIdleTimerRef = useRef<number | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<SimEdge[]>([]);
  const simulationRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastLayoutSyncRef = useRef(0);
  const physicsEnabledRef = useRef(physicsEnabled);
  const layoutSpacingRef = useRef(layoutSpacing);
  const dragRef = useRef<{
    nodeId: string;
    offsetX: number;
    offsetY: number;
    pointerId: number;
  } | null>(null);
  const panRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    viewBox: ViewBox;
  } | null>(null);

  const applyViewBox = useCallback((nextViewBox: ViewBox, commitState = false) => {
    viewBoxRef.current = nextViewBox;
    svgRef.current?.setAttribute("viewBox", formatViewBox(nextViewBox));

    if (commitState) {
      setViewBox(nextViewBox);
    }
  }, []);

  const stopViewBoxNavigation = useCallback(() => {
    svgRef.current?.classList.remove("is-navigating");
  }, []);

  const startViewBoxNavigation = useCallback(() => {
    svgRef.current?.classList.add("is-navigating");
  }, []);

  const scheduleViewBoxCommit = useCallback(() => {
    if (viewBoxIdleTimerRef.current !== null) {
      window.clearTimeout(viewBoxIdleTimerRef.current);
    }

    viewBoxIdleTimerRef.current = window.setTimeout(() => {
      viewBoxIdleTimerRef.current = null;
      setViewBox(viewBoxRef.current);
      stopViewBoxNavigation();
    }, viewBoxIdleDelayMs);
  }, [stopViewBoxNavigation]);

  const syncLayout = useCallback(
    (force = false) => {
      if (frameRef.current !== null) {
        if (!force) {
          return;
        }

        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      frameRef.current = window.requestAnimationFrame((timestamp) => {
        frameRef.current = null;
        if (!force && timestamp - lastLayoutSyncRef.current < layoutFrameIntervalMs) {
          return;
        }

        lastLayoutSyncRef.current = timestamp;
        setLayout({
          nodes: nodesRef.current.map((node) => ({ ...node })),
          edges: edgesRef.current.map((edge) => ({ ...edge })),
          labelIds: visibleGraph.labelIds,
        });
      });
    },
    [visibleGraph.labelIds],
  );

  useEffect(() => {
    return () => {
      if (viewBoxIdleTimerRef.current !== null) {
        window.clearTimeout(viewBoxIdleTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    physicsEnabledRef.current = physicsEnabled;

    if (!physicsEnabled) {
      simulationRef.current?.stop();
      simulationRef.current = null;
      return;
    }

    if (nodesRef.current.length && !simulationRef.current) {
      simulationRef.current = createSimulation(
        nodesRef.current,
        edgesRef.current,
        syncLayout,
        layoutSpacingRef.current,
      );
    }
  }, [physicsEnabled, syncLayout]);

  useEffect(() => {
    layoutSpacingRef.current = layoutSpacing;
  }, [layoutSpacing]);

  useEffect(() => {
    if (!visibleGraph.nodes.length) {
      nodesRef.current = [];
      edgesRef.current = [];
      setLayout(visibleGraph);
      return;
    }

    const nodes = visibleGraph.nodes.map((node, index) => {
      const angle = seededAngle(node.id, index);
      const radius = initialRadius(node, layoutSpacing);
      return {
        ...node,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
      };
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = visibleGraph.edges.filter(
      (edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId),
    );

    nodesRef.current = nodes;
    edgesRef.current = edges;
    lastLayoutSyncRef.current = 0;
    setLayout({ nodes, edges, labelIds: visibleGraph.labelIds });
    applyViewBox(defaultViewBox, true);

    if (!physicsEnabledRef.current) {
      simulationRef.current = null;
      return;
    }

    const simulation = createSimulation(nodes, edges, syncLayout, layoutSpacing);

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
      if (simulationRef.current === simulation) {
        simulationRef.current = null;
      }
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [applyViewBox, layoutSpacing, syncLayout, visibleGraph]);

  useEffect(() => {
    if (!selectedNodeId || focusToken < 0) {
      return;
    }

    const node = nodesRef.current.find((item) => item.id === selectedNodeId);
    if (!node?.x || !node.y) {
      return;
    }

    const nextWidth = width / 1.25;
    const nextHeight = nextWidth * (height / width);
    applyViewBox(
      {
        x: node.x - nextWidth / 2,
        y: node.y - nextHeight / 2,
        width: nextWidth,
        height: nextHeight,
      },
      true,
    );
  }, [applyViewBox, focusToken, selectedNodeId]);

  const nodeById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes],
  );
  const selectedNeighborIds = useMemo(() => {
    if (!selectedNodeId) {
      return new Set<string>();
    }

    const ids = new Set<string>();
    for (const edge of layout.edges) {
      if (edge.sourceId === selectedNodeId) {
        ids.add(edge.targetId);
      }
      if (edge.targetId === selectedNodeId) {
        ids.add(edge.sourceId);
      }
    }
    return ids;
  }, [layout.edges, selectedNodeId]);
  const zoomPercent = Math.round((width / viewBox.width) * 100);

  const zoomAt = useCallback(
    (scale: number, point?: { clientX: number; clientY: number }, commitState = true) => {
      const current = viewBoxRef.current;
      const nextWidth = Math.max(minViewBoxWidth, Math.min(maxViewBoxWidth, current.width * scale));
      const nextHeight = nextWidth * (height / width);
      const focus =
        point && svgRef.current
          ? pointInViewBox(point, svgRef.current, current)
          : { x: current.x + current.width / 2, y: current.y + current.height / 2 };
      const widthRatio = nextWidth / current.width;
      const heightRatio = nextHeight / current.height;

      const nextViewBox = {
        x: focus.x - (focus.x - current.x) * widthRatio,
        y: focus.y - (focus.y - current.y) * heightRatio,
        width: nextWidth,
        height: nextHeight,
      };

      applyViewBox(nextViewBox, commitState);

      if (!commitState) {
        startViewBoxNavigation();
        scheduleViewBoxCommit();
      }
    },
    [applyViewBox, scheduleViewBoxCommit, startViewBoxNavigation],
  );

  function resetView() {
    stopViewBoxNavigation();
    applyViewBox(defaultViewBox, true);
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    zoomAt(event.deltaY > 0 ? 1.12 : 0.88, event, false);
  }

  function handlePanPointerDown(event: ReactPointerEvent<SVGRectElement>) {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    startViewBoxNavigation();
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      viewBox: viewBoxRef.current,
    };
  }

  function handlePanPointerMove(event: ReactPointerEvent<SVGRectElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId || !svgRef.current) {
      return;
    }

    const rect = svgRef.current.getBoundingClientRect();
    const dx = ((event.clientX - pan.clientX) / rect.width) * pan.viewBox.width;
    const dy = ((event.clientY - pan.clientY) / rect.height) * pan.viewBox.height;
    applyViewBox({
      ...pan.viewBox,
      x: pan.viewBox.x - dx,
      y: pan.viewBox.y - dy,
    });
  }

  function handlePanPointerEnd(event: ReactPointerEvent<SVGRectElement>) {
    if (panRef.current?.pointerId !== event.pointerId) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    panRef.current = null;
    applyViewBox(viewBoxRef.current, true);
    stopViewBoxNavigation();
  }

  function handleNodePointerDown(event: ReactPointerEvent<SVGGElement>, node: SimNode) {
    if (event.button !== 0 || !svgRef.current) {
      return;
    }

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointInViewBox(event, svgRef.current, viewBoxRef.current);
    const liveNode = nodesRef.current.find((item) => item.id === node.id);
    if (!liveNode) {
      return;
    }

    const offsetX = (liveNode.x ?? point.x) - point.x;
    const offsetY = (liveNode.y ?? point.y) - point.y;
    liveNode.fx = point.x + offsetX;
    liveNode.fy = point.y + offsetY;
    dragRef.current = { nodeId: node.id, offsetX, offsetY, pointerId: event.pointerId };
    setDraggedNodeId(node.id);
    simulationRef.current?.alphaTarget(0.24).restart();
    startViewBoxNavigation();
    syncLayout();
  }

  function handleNodePointerMove(event: ReactPointerEvent<SVGGElement>, node: SimNode) {
    const drag = dragRef.current;
    if (!drag || drag.nodeId !== node.id || drag.pointerId !== event.pointerId || !svgRef.current) {
      return;
    }

    event.stopPropagation();
    const point = pointInViewBox(event, svgRef.current, viewBoxRef.current);
    const liveNode = nodesRef.current.find((item) => item.id === node.id);
    if (!liveNode) {
      return;
    }

    liveNode.fx = point.x + drag.offsetX;
    liveNode.fy = point.y + drag.offsetY;
    liveNode.x = point.x + drag.offsetX;
    liveNode.y = point.y + drag.offsetY;
    syncLayout();
  }

  function handleNodePointerEnd(event: ReactPointerEvent<SVGGElement>, node: SimNode) {
    const drag = dragRef.current;
    if (!drag || drag.nodeId !== node.id || drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setDraggedNodeId(null);
    simulationRef.current?.alphaTarget(0);
    stopViewBoxNavigation();
  }

  function handleKeyboardSelect<T extends SVGElement>(event: KeyboardEvent<T>, action: () => void) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    action();
  }

  if (!layout.nodes.length) {
    return <div className="ontolens-graph-empty">표시할 그래프 데이터가 없습니다.</div>;
  }

  return (
    <div className="ontolens-graph-stage">
      <div className="ontolens-graph-controls" aria-label="Graph controls" role="toolbar">
        <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => zoomAt(1.18)}>
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <span>{zoomPercent}%</span>
        <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => zoomAt(0.82)}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button type="button" title="Reset view" aria-label="Reset view" onClick={resetView}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button type="button" title="Fit graph" aria-label="Fit graph" onClick={resetView}>
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <svg
        aria-label="Ontology graph"
        className="ontolens-graph-svg"
        ref={svgRef}
        role="img"
        viewBox={formatViewBox(viewBox)}
        onWheel={handleWheel}
      >
        <defs>
          <marker
            id="ontolens-arrow"
            markerHeight="8"
            markerWidth="9"
            orient="auto"
            refX="19"
            refY="4"
          >
            <path d="M0,0 L9,4 L0,8 Z" />
          </marker>
        </defs>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG pan surface uses pointer dragging; zoom/reset keyboard controls are exposed separately. */}
        <rect
          className="ontolens-pan-surface"
          height={panSurfaceExtent * 2}
          width={panSurfaceExtent * 2}
          x={-panSurfaceExtent}
          y={-panSurfaceExtent}
          onClick={onStageClick}
          onPointerCancel={handlePanPointerEnd}
          onPointerDown={handlePanPointerDown}
          onPointerMove={handlePanPointerMove}
          onPointerUp={handlePanPointerEnd}
        />

        <g className="ontolens-graph-edges">
          {layout.edges.map((edge, index) => {
            const source = nodeById.get(endpointId(edge.source));
            const target = nodeById.get(endpointId(edge.target));
            if (!source || !target) {
              return null;
            }

            const active =
              selectedNodeId === edge.sourceId ||
              selectedNodeId === edge.targetId ||
              hoveredNodeId === edge.sourceId ||
              hoveredNodeId === edge.targetId;
            const showLabel =
              showEdgeLabels &&
              (active || index < 80) &&
              Math.abs((source.x ?? 0) - (target.x ?? 0)) +
                Math.abs((source.y ?? 0) - (target.y ?? 0)) >
                62;
            const mid = midpoint(source, target, edge);
            const edgeLabel =
              compactRdfType && edge.predicate === rdfTypePredicate
                ? "a"
                : graphIriPathLabel(edge.predicate, edge.label);

            return (
              <g key={edge.id} className={active ? "is-active" : undefined}>
                <title>{edge.predicate}</title>
                {/* biome-ignore lint/a11y/useSemanticElements: SVG graph edges cannot be native buttons. */}
                <path
                  aria-label={`${edgeLabel} edge`}
                  className="ontolens-graph-edge"
                  d={edgePath(source, target, edge)}
                  markerEnd="url(#ontolens-arrow)"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) =>
                    handleKeyboardSelect(event, () => onNodeSelect(edge.sourceId))
                  }
                />
                {showLabel ? (
                  <text className="ontolens-edge-label" x={mid.x} y={mid.y}>
                    {edgeLabel}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>

        <g className="ontolens-graph-nodes">
          {layout.nodes.map((node) => {
            const active = selectedNodeId === node.id;
            const hovered = hoveredNodeId === node.id;
            const related = selectedNeighborIds.has(node.id);
            const muted = !!selectedNodeId && !active && !related;
            const labelVisible = shouldShowLabel(node, layout.labelIds, active, hovered, related);

            return (
              // biome-ignore lint/a11y/useSemanticElements: SVG graph nodes cannot be native buttons.
              <g
                aria-label={`${node.label} node`}
                className={[
                  "ontolens-graph-node",
                  `is-${node.kind}`,
                  active ? "is-active" : "",
                  hovered ? "is-hovered" : "",
                  related ? "is-related" : "",
                  muted ? "is-muted" : "",
                  draggedNodeId === node.id ? "is-dragging" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={node.id}
                role="button"
                style={{ "--node-color": graphNodeVisuals[node.kind].color } as CSSProperties}
                tabIndex={0}
                transform={`translate(${node.x ?? width / 2} ${node.y ?? height / 2})`}
                onClick={(event) => {
                  event.stopPropagation();
                  onNodeSelect(node.id);
                }}
                onKeyDown={(event) => handleKeyboardSelect(event, () => onNodeSelect(node.id))}
                onPointerCancel={(event) => handleNodePointerEnd(event, node)}
                onPointerDown={(event) => handleNodePointerDown(event, node)}
                onPointerMove={(event) => handleNodePointerMove(event, node)}
                onPointerUp={(event) => handleNodePointerEnd(event, node)}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
              >
                <title>{node.iri}</title>
                <NodeShape node={node} />
                {labelVisible ? <NodeLabel node={node} /> : null}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function buildVisibleGraph(graphData: GraphData, filters: GraphFilters): VisibleGraph {
  const includedNodes = graphData.nodes.filter(
    (node) => node.kind !== "literal" && isNamespaceEnabled(node.namespace, filters.namespaces),
  );
  const includedNodeIds = new Set(includedNodes.map((node) => node.id));
  const degree = new Map<string, number>();
  const edges = graphData.edges
    .filter(
      (edge) =>
        includedNodeIds.has(edge.source) &&
        includedNodeIds.has(edge.target) &&
        (filters.predicate === "all" || edge.predicate === filters.predicate),
    )
    .map((edge) => {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
      return {
        ...edge,
        source: edge.source,
        target: edge.target,
        sourceId: edge.source,
        targetId: edge.target,
      };
    });
  const rankedIds = new Set(
    [...includedNodes]
      .filter((node) => node.kind !== "literal")
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
      .slice(0, 32)
      .map((node) => node.id),
  );

  return {
    nodes: includedNodes.map((node) => ({
      ...node,
      degree: degree.get(node.id) ?? 0,
      labelRank: rankedIds.has(node.id) ? 1 : 0,
    })),
    edges,
    labelIds: rankedIds,
  };
}

function isNamespaceEnabled(namespace: string, filters: NamespaceFilters) {
  return !namespace || (filters[namespace] ?? true);
}

function createSimulation(
  nodes: SimNode[],
  edges: SimEdge[],
  onTick: (force?: boolean) => void,
  layoutSpacing: number,
): Simulation<SimNode, undefined> {
  const density = Math.min(1, edges.length / Math.max(1, nodes.length * 7));

  return forceSimulation<SimNode>(nodes)
    .force(
      "link",
      forceLink<SimNode, SimEdge>(edges)
        .id((node) => node.id)
        .distance((edge) => linkDistance(edge) * layoutSpacing)
        .strength(0.16 - density * 0.08),
    )
    .force(
      "charge",
      forceManyBody<SimNode>().strength((node) => chargeStrength(node, density) * layoutSpacing),
    )
    .force("center", forceCenter(width / 2, height / 2).strength(0.08))
    .force(
      "radial",
      forceRadial<SimNode>(
        (node) => radialDistance(node) * layoutSpacing,
        width / 2,
        height / 2,
      ).strength((node) => (node.kind === "literal" ? 0.2 : 0.08)),
    )
    .force(
      "collide",
      forceCollide<SimNode>()
        .radius((node) => nodeRadius(node) + labelPadding(node) * layoutSpacing)
        .iterations(2),
    )
    .alpha(0.96)
    .alphaDecay(0.035)
    .on("tick", () => onTick())
    .on("end", () => onTick(true));
}

function NodeLabel({ node }: { node: SimNode }) {
  const x = nodeRadius(node) + 8;
  const y = node.kind === "literal" ? 4 : 5;
  const primaryLabel = graphNodePrimaryLabel(node);
  const secondaryLabel = graphNodeSecondaryLabel(node);

  return (
    <>
      <text className="ontolens-node-label" x={x} y={y}>
        {primaryLabel}
      </text>
      {secondaryLabel ? (
        <text className="ontolens-node-secondary-label" x={x} y={y + 13}>
          {secondaryLabel}
        </text>
      ) : null}
    </>
  );
}

function graphNodePrimaryLabel(node: SimNode) {
  if (node.kind === "literal" || node.labelSource === "rdfs") {
    return node.label;
  }

  return graphIriPathLabel(node.iri, node.label);
}

function graphNodeSecondaryLabel(node: SimNode) {
  if (node.kind === "literal") {
    return undefined;
  }

  if (node.labelSource === "rdfs") {
    return graphIriPathLabel(node.iri, node.secondaryLabel ?? node.label);
  }

  return undefined;
}

function graphIriPathLabel(iri: string, fallback: string) {
  const label = formatIriPath(iri);
  return label || fallback;
}

function NodeShape({ node }: { node: SimNode }) {
  const radius = nodeRadius(node);

  if (node.kind === "property") {
    return (
      <rect
        className="ontolens-node-shape"
        height={radius * 1.5}
        rx="4"
        transform="rotate(45)"
        width={radius * 1.5}
        x={-radius * 0.75}
        y={-radius * 0.75}
      />
    );
  }

  if (node.kind === "literal") {
    return (
      <rect
        className="ontolens-node-shape"
        height={radius * 1.35}
        rx="5"
        width={radius * 2.25}
        x={-radius * 1.125}
        y={-radius * 0.675}
      />
    );
  }

  return <circle className="ontolens-node-shape" r={radius} />;
}

function endpointId(endpoint: string | SimNode) {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

function nodeRadius(node: SimNode | GraphNode) {
  if (node.kind === "class") {
    return 17;
  }
  if (node.kind === "property") {
    return 13;
  }
  if (node.kind === "literal") {
    return 7.5;
  }
  if (node.kind === "external") {
    return 12;
  }
  return 11.5 + Math.min(5, Math.log2(((node as SimNode).degree ?? 1) + 1) * 0.8);
}

function labelPadding(node: SimNode) {
  if (node.kind === "literal") {
    return 8;
  }
  if (node.labelRank || node.kind === "class" || node.kind === "property") {
    return node.secondaryLabel ? 28 : 18;
  }
  return 8;
}

function linkDistance(edge: SimEdge) {
  const sourceKind = typeof edge.source === "string" ? "" : edge.source.kind;
  const targetKind = typeof edge.target === "string" ? "" : edge.target.kind;

  if (sourceKind === "literal" || targetKind === "literal") {
    return 52;
  }
  if (sourceKind === "class" || targetKind === "class") {
    return 112;
  }
  return 74;
}

function chargeStrength(node: SimNode, density: number) {
  if (node.kind === "literal") {
    return -36 - density * 16;
  }
  if (node.kind === "class") {
    return -340;
  }
  if (node.kind === "property") {
    return -180;
  }
  return -128 - Math.min(70, node.degree * 1.1);
}

function radialDistance(node: SimNode) {
  if (node.kind === "literal") {
    return 390;
  }
  if (node.kind === "class") {
    return 118;
  }
  if (node.kind === "property") {
    return 180;
  }
  if (node.kind === "external") {
    return 360;
  }
  return 275;
}

function initialRadius(node: SimNode, layoutSpacing: number) {
  return radialDistance(node) * layoutSpacing * (0.76 + (hashNumber(node.id) % 19) / 60);
}

function seededAngle(value: string, index: number) {
  return ((hashNumber(value) + index * 47) % 360) * (Math.PI / 180);
}

function hashNumber(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function shouldShowLabel(
  node: SimNode,
  labelIds: Set<string>,
  active: boolean,
  hovered: boolean,
  related: boolean,
) {
  if (active || hovered || related) {
    return true;
  }
  if (node.kind === "literal") {
    return false;
  }
  return node.kind === "class" || node.kind === "property" || labelIds.has(node.id);
}

function pointInViewBox(
  point: { clientX: number; clientY: number },
  svg: SVGSVGElement,
  box: ViewBox,
) {
  const rect = svg.getBoundingClientRect();
  return {
    x: box.x + ((point.clientX - rect.left) / rect.width) * box.width,
    y: box.y + ((point.clientY - rect.top) / rect.height) * box.height,
  };
}

function edgePath(source: SimNode, target: SimNode, edge: SimEdge) {
  const sx = source.x ?? width / 2;
  const sy = source.y ?? height / 2;
  const tx = target.x ?? width / 2;
  const ty = target.y ?? height / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const curve = (((hashNumber(edge.id) % 9) - 4) / 4) * Math.min(28, distance * 0.12);
  const mx = sx + dx / 2 + normalX * curve;
  const my = sy + dy / 2 + normalY * curve;

  return `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`;
}

function midpoint(source: SimNode, target: SimNode, edge: SimEdge) {
  const sx = source.x ?? width / 2;
  const sy = source.y ?? height / 2;
  const tx = target.x ?? width / 2;
  const ty = target.y ?? height / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const curve = (((hashNumber(edge.id) % 9) - 4) / 4) * Math.min(28, distance * 0.12);

  return {
    x: sx + dx / 2 + normalX * curve,
    y: sy + dy / 2 + normalY * curve,
  };
}
