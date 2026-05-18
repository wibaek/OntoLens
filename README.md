# OntoLens

OntoLens is a browser-based ontology viewer for RDF, OWL, and SPARQL endpoints. It focuses on visual graph exploration instead of making users write SPARQL first.

The default development endpoint is:

```text
https://rnd-fuseki.ninewatt.com/ds/query
```

## Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- Sigma / Graphology
- pnpm

## Run

```bash
pnpm install
pnpm dev
```

Dev server:

```text
http://localhost:3089
```

## Build

```bash
pnpm build
```

## Notes

- MVP calls the SPARQL endpoint directly from the browser.
- If an endpoint blocks browser requests with CORS, the UI reports the failure and keeps the graph canvas in an empty state.
- Node expansion uses generated `CONSTRUCT` queries and caps traversal depth at 3 for the MVP.
- Default safety limits are 500 nodes, 5000 edges, and depth 2.
