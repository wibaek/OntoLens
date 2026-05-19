# Apache Jena Fuseki 용어 정리

이 문서는 OntoLens가 바라보는 SPARQL endpoint와 Apache Jena Fuseki 개념을 이해하기 위한 정리다. Fuseki 운영 매뉴얼 전체가 아니라, "프론트에서 어떤 URL을 때리고, 어떤 데이터 구조가 돌아오는가"를 이해하는 데 초점을 둔다.

## Fuseki 한 문장 설명

Apache Jena Fuseki는 RDF dataset을 HTTP로 노출하는 SPARQL 서버다. SPARQL Query, SPARQL Update, SPARQL Graph Store Protocol을 제공하고, TDB/TDB2와 연결해 persistent RDF 저장소로 쓸 수 있다.

OntoLens는 Fuseki의 query endpoint에 SPARQL을 보내고, `SELECT` 결과는 table로, `CONSTRUCT`/`DESCRIBE` 결과는 graph로 보여준다.

## 큰 구조

```text
Browser / OntoLens
  -> HTTP POST query
  -> Fuseki dataset endpoint
  -> RDF dataset
       - default graph
       - named graph A
       - named graph B
       - ...
```

Fuseki에서 중요한 단위는 server, data service, dataset, endpoint다.

| 용어 | 뜻 | 예시 |
| --- | --- | --- |
| Fuseki server | HTTP로 SPARQL 서비스를 제공하는 서버 프로세스 | `http://localhost:3030` |
| Data service | 하나의 dataset을 URL 공간에 publish한 서비스 | `/ds`, `/building`, `/ontology` |
| Dataset | RDF graph들의 묶음. default graph + named graph들 | `/ds`에 연결된 RDF dataset |
| Endpoint | 특정 operation을 받는 URL | `/ds/sparql`, `/ds/query`, `/ds/update`, `/ds/data` |
| Operation | endpoint가 수행하는 일 | query, update, graph store protocol, upload |
| TDB2 | Jena의 persistent RDF 저장소 | `--tdb2 --loc DB2 /ds` |
| In-memory dataset | 서버 재시작 시 사라지는 임시 dataset | `--mem /ds` |
| Graph Store Protocol | graph를 HTTP로 읽고 쓰는 프로토콜 | `/ds/data` |

## URL과 endpoint

Fuseki 설정에 따라 이름은 달라질 수 있지만 흔한 형태는 아래와 같다.

| URL | 역할 |
| --- | --- |
| `http://host:3030/ds/sparql` | SPARQL Query endpoint |
| `http://host:3030/ds/query` | SPARQL Query endpoint의 다른 이름 |
| `http://host:3030/ds/update` | SPARQL Update endpoint |
| `http://host:3030/ds/data` | Graph Store Protocol endpoint |
| `http://host:3030/#/dataset/ds/query` | Fuseki UI query 화면 |
| `http://host:3030/$/ping` | 서버 liveness 확인 |
| `http://host:3030/$/stats` | dataset/service별 요청 통계 |
| `http://host:3030/$/metrics` | Prometheus metrics |

OntoLens의 기본 endpoint는 현재 아래 query endpoint다.

```text
https://rnd-fuseki.ninewatt.com/ds/query
```

`/ds/query`가 query endpoint로 열려 있으면 OntoLens가 `SELECT`, `CONSTRUCT`, `DESCRIBE`를 보낼 수 있다.

## Query endpoint와 Update endpoint

### Query endpoint

읽기용이다. `SELECT`, `CONSTRUCT`, `ASK`, `DESCRIBE`를 보낸다.

```http
POST /ds/query
Content-Type: application/x-www-form-urlencoded
Accept: application/sparql-results+json

query=SELECT ...
```

OntoLens는 `SELECT`일 때 `application/sparql-results+json`을 기대한다.

```http
Accept: application/sparql-results+json
```

`CONSTRUCT`/`DESCRIBE`일 때는 RDF graph가 필요하므로 Turtle/N-Triples/RDF XML 등을 받을 수 있게 요청한다.

```http
Accept: text/turtle, application/n-triples;q=0.9, application/rdf+xml;q=0.8
```

### Update endpoint

쓰기용이다. `INSERT DATA`, `DELETE DATA`, `DELETE/INSERT WHERE` 같은 SPARQL Update를 보낸다. OntoLens는 현재 update endpoint를 쓰지 않는다.

운영상 update endpoint는 인증/권한을 별도로 강하게 걸어야 한다.

## Dataset, default graph, named graph

Fuseki의 dataset은 RDF dataset이다. RDF dataset은 default graph 하나와 named graph 여러 개를 가질 수 있다.

```text
Dataset /ds
  default graph
  named graph <https://example.com/graph/building>
  named graph <https://example.com/graph/sensor>
```

SPARQL에서 named graph를 보려면 보통 `GRAPH ?g { ... }`를 쓴다.

```sparql
SELECT DISTINCT ?g WHERE {
  GRAPH ?g {
    ?s ?p ?o .
  }
}
LIMIT 100
```

OntoLens는 endpoint 연결 시 named graph 목록을 조회하고, `auto` 모드에서는 첫 named graph를 선택해 class map을 만든다.

## Graph Store Protocol

Graph Store Protocol은 SPARQL query와 다르게 graph 자체를 HTTP로 읽고 쓰는 방식이다.

예를 들어 default graph를 가져오는 식의 요청이 가능하다.

```text
GET /ds/data?default
```

named graph를 대상으로 할 수도 있다.

```text
GET /ds/data?graph=https://example.com/graph/building
```

OntoLens는 현재 Graph Store Protocol을 직접 쓰지 않고 query endpoint만 사용한다. 추후 "전체 graph 다운로드"나 "graph upload" 기능이 필요하면 `/data` 계열 endpoint를 검토하면 된다.

## Fuseki 실행 방식

대표적인 실행 방식은 세 가지다.

### RDF 파일을 read-only endpoint로 publish

```bash
fuseki-server --file=MyData.ttl /name
```

SPARQL endpoint는 보통 아래처럼 열린다.

```text
http://localhost:3030/name/sparql
```

### In-memory dataset

```bash
fuseki-server --mem /name
```

재시작하면 데이터가 사라진다. 개발 테스트에 좋다.

### TDB2 persistent dataset

```bash
fuseki-server --loc=DATABASE /name
```

`DATABASE` 디렉터리에 TDB/TDB2 저장소를 두고 persistent하게 쓴다.

## Fuseki 설정 파일

Fuseki 설정은 Turtle RDF graph로 쓸 수 있다. data service 설정에는 보통 다음이 들어간다.

- service name
- endpoint operation과 endpoint name
- dataset 설명

개념적으로는 아래와 같다.

```turtle
<#service1> rdf:type fuseki:Service ;
  fuseki:name "ds" ;
  fuseki:endpoint [
    fuseki:operation fuseki:query ;
    fuseki:name "query"
  ] ;
  fuseki:endpoint [
    fuseki:operation fuseki:update ;
    fuseki:name "update"
  ] ;
  fuseki:dataset <#dataset> .
```

이 설정이면 query endpoint는 대략 아래처럼 된다.

```text
http://host:port/ds/query
```

## OntoLens가 Fuseki에 기대하는 것

OntoLens가 안정적으로 동작하려면 endpoint가 아래를 만족하는 것이 좋다.

1. Query endpoint가 브라우저에서 접근 가능해야 한다.
2. CORS가 허용되어야 한다. 브라우저 앱이라서 서버 간 요청과 다르다.
3. `SELECT` 결과는 SPARQL JSON으로 받을 수 있어야 한다.
4. `CONSTRUCT`/`DESCRIBE` 결과는 Turtle 또는 N-Triples 등 RDF syntax로 받을 수 있어야 한다.
5. 너무 큰 결과를 피하기 위해 `LIMIT`, depth, node/edge limit을 둬야 한다.
6. named graph를 쓰는 dataset이면 `GRAPH <iri> { ... }` 패턴이 필요하다.
7. 인증이 필요한 경우 브라우저에서 안전하게 header/token을 붙이는 정책이 필요하다.

## OntoLens의 주요 쿼리 흐름

### Endpoint summary

처음 연결할 때 triple count, class list, predicate list, named graph list를 조회한다.

### Class map

class와 subclass 관계를 `CONSTRUCT`해서 캔버스에 그린다.

```sparql
CONSTRUCT {
  ?class a owl:Class .
  ?class rdfs:subClassOf ?parent .
}
WHERE {
  ...
}
```

### Neighborhood

노드를 클릭하면 해당 IRI 주변의 outgoing/incoming triple을 depth 제한 안에서 가져온다.

### SELECT result

`SELECT` 쿼리는 table로 표시한다. 이때 결과는 `head.vars`와 `results.bindings` 구조의 JSON이다.

### Raw result

디버깅을 위해 마지막 SELECT JSON 또는 CONSTRUCT 결과 quads를 raw 탭에 남긴다.

## 흔한 문제와 해석

| 증상 | 가능 원인 | 확인할 것 |
| --- | --- | --- |
| CORS 에러 | Fuseki가 브라우저 origin을 허용하지 않음 | 서버 CORS 설정, 프록시 필요 여부 |
| 401/403 | 인증 필요 또는 권한 부족 | token/header, query 권한 |
| 400/422 | SPARQL 문법 오류 | raw error body, 생성된 SPARQL |
| 413/429 | 결과가 너무 큼 또는 rate limit | limit, depth, endpoint 정책 |
| 결과 0개 | default/named graph 선택 문제 | `GRAPH ?g` 조회, selected graph |
| class map이 비어 있음 | class 선언이 없거나 instance type만 있음 | `?s a ?class` 패턴 결과 |
| 너무 느림 | 전체 graph가 크거나 property path/depth가 큼 | LIMIT, depth, predicate filter |

## 프론트에서 기억할 점

- Fuseki는 "그래프를 예쁘게 보여주는 서버"가 아니라 RDF dataset을 SPARQL HTTP로 노출하는 서버다.
- 화면의 node/edge는 OntoLens가 query 결과를 변환해서 만든 것이다.
- named graph는 저장/조회 scope이고, 화면 레이아웃과는 별개다.
- `CONSTRUCT`는 시각화를 위한 RDF graph를 직접 만드는 데 유리하다.
- `SELECT`는 table/result inspection에 유리하다.
- endpoint별 CORS/auth/timeout/limit 정책이 UI 품질을 크게 좌우한다.

## 참고 문서

- [Apache Jena Fuseki](https://jena.apache.org/documentation/fuseki2/)
- [Fuseki Quickstart](https://jena.apache.org/documentation/fuseki2/fuseki-quick-start.html)
- [Running Fuseki](https://jena.apache.org/documentation/fuseki2/fuseki-server.html)
- [Fuseki Configuration](https://jena.apache.org/documentation/fuseki2/fuseki-configuration)
- [Fuseki Server Information](https://jena.apache.org/documentation/fuseki2/fuseki-server-info.html)
- [SPARQL 1.1 Query Language](https://www.w3.org/TR/sparql11-query/)
