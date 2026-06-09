import type { NodeKind } from "./types";

export type GraphNodeShape = "circle" | "diamond" | "pill";

export type GraphNodeVisual = {
  label: string;
  color: string;
  shape: GraphNodeShape;
  description: string;
};

export const graphNodeVisuals: Record<NodeKind, GraphNodeVisual> = {
  class: {
    label: "Class",
    color: "#8b5cf6",
    shape: "circle",
    description: "온톨로지의 개념, 타입, 분류 단위입니다.",
  },
  instance: {
    label: "Instance",
    color: "#12b981",
    shape: "circle",
    description: "실제 개체나 데이터 리소스입니다.",
  },
  property: {
    label: "Property",
    color: "#f59e0b",
    shape: "diamond",
    description: "subject와 object를 잇는 관계나 속성입니다.",
  },
  literal: {
    label: "Literal",
    color: "#fbbf24",
    shape: "pill",
    description: "문자열, 숫자, 날짜 같은 값입니다. 보통 상세 패널에 표시됩니다.",
  },
  external: {
    label: "External",
    color: "#ef4444",
    shape: "circle",
    description: "현재 namespace 바깥의 외부 IRI 리소스입니다.",
  },
  unknown: {
    label: "Unknown",
    color: "#64748b",
    shape: "circle",
    description: "타입을 아직 확정하지 못한 IRI 리소스입니다.",
  },
};
