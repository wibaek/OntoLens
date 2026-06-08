import type { NamespaceCandidate, NamespaceGroup } from "./types";

export const STANDARD_NAMESPACES: Record<string, string> = {
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#": "rdf",
  "http://www.w3.org/2000/01/rdf-schema#": "rdfs",
  "http://www.w3.org/2002/07/owl#": "owl",
  "http://www.w3.org/2001/XMLSchema#": "xsd",
  "http://www.w3.org/2004/02/skos/core#": "skos",
  "http://www.w3.org/ns/shacl#": "sh",
  "https://schema.org/": "schema",
};

const iriPattern = /^https?:\/\/|^urn:/i;

export function isIri(value: string) {
  return iriPattern.test(value);
}

export function getNamespace(value: string) {
  if (!isIri(value)) {
    return "";
  }

  const hashIndex = value.lastIndexOf("#");
  if (hashIndex >= 0) {
    return value.slice(0, hashIndex + 1);
  }

  const slashIndex = value.lastIndexOf("/");
  if (slashIndex >= 0) {
    return value.slice(0, slashIndex + 1);
  }

  return value;
}

export function getLocalName(value: string) {
  if (!value) {
    return "unknown";
  }

  const trimmed = value.replace(/[>#/]+$/, "");
  const hashIndex = trimmed.lastIndexOf("#");
  const slashIndex = trimmed.lastIndexOf("/");
  const colonIndex = trimmed.lastIndexOf(":");
  const index = Math.max(hashIndex, slashIndex, colonIndex);

  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}

export function compactIri(value: string, namespaceHints: string[] = []) {
  if (!isIri(value)) {
    return value;
  }

  for (const [namespace, prefix] of Object.entries(STANDARD_NAMESPACES)) {
    if (value.startsWith(namespace)) {
      return `${prefix}:${value.slice(namespace.length)}`;
    }
  }

  const hintedNamespace = namespaceHints.find((namespace) => value.startsWith(namespace));
  if (hintedNamespace) {
    return `${compactNamespace(hintedNamespace)}:${
      value.slice(hintedNamespace.length) || getLocalName(value)
    }`;
  }

  return getLocalName(value);
}

export function truncateMiddle(value: string, maxLength = 72) {
  if (value.length <= maxLength) {
    return value;
  }

  const head = Math.ceil((maxLength - 1) / 2);
  const tail = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

export function truncateLiteral(value: string, maxLength = 140) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

export function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

export function detectNamespaceGroup(
  value: string,
  localNamespaces: string[] = [],
): NamespaceGroup {
  const namespace = getNamespace(value);

  if (!namespace) {
    return "unknown";
  }

  if (STANDARD_NAMESPACES[namespace]) {
    return "standard";
  }

  if (localNamespaces.some((localNamespace) => namespace === localNamespace)) {
    return "local";
  }

  return "external";
}

export function inferNamespaceCandidates(values: string[], classNamespaces: string[] = []) {
  const counts = new Map<string, number>();

  for (const value of values) {
    const namespace = getNamespace(value);
    if (!namespace) {
      continue;
    }
    counts.set(namespace, (counts.get(namespace) ?? 0) + 1);
  }

  const nonStandard = [...counts.entries()]
    .filter(([namespace]) => !STANDARD_NAMESPACES[namespace])
    .sort((a, b) => b[1] - a[1]);

  const explicitLocal = classNamespaces.filter(
    (namespace) => namespace && !STANDARD_NAMESPACES[namespace],
  );
  const localNamespaces = [
    ...new Set([...explicitLocal, ...nonStandard.slice(0, 2).map(([n]) => n)]),
  ];

  const candidates: NamespaceCandidate[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([namespace, count]) => ({
      namespace,
      label: STANDARD_NAMESPACES[namespace] ?? compactNamespace(namespace),
      group: detectNamespaceGroup(namespace, localNamespaces),
      count,
    }));

  return { candidates, localNamespaces };
}

export function compactNamespace(namespace: string) {
  if (STANDARD_NAMESPACES[namespace]) {
    return STANDARD_NAMESPACES[namespace];
  }

  if (!isIri(namespace)) {
    return "unknown";
  }

  try {
    const url = new URL(namespace);
    const lastPath = getLocalName(namespace);
    return toPrefixLabel(lastPath && lastPath !== url.hostname ? lastPath : url.hostname);
  } catch {
    return truncateMiddle(namespace, 32);
  }
}

function toPrefixLabel(value: string) {
  const normalized = value
    .trim()
    .replace(/^[^A-Za-z_]+/, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "ns";
}
