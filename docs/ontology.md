# 온톨로지/RDF/SPARQL 용어 정리

이 문서는 OntoLens를 만들거나 사용할 때 헷갈리기 쉬운 온톨로지, RDF, OWL, SPARQL 용어를 빠르게 잡기 위한 정리다. 엄밀한 표준 문서라기보다, Fuseki endpoint를 바라보는 프론트엔드 개발자가 바로 이해해야 하는 개념 중심으로 쓴다.

## 큰 그림

RDF는 데이터를 `주어-술어-목적어` 형태의 triple로 표현하는 그래프 데이터 모델이다. 온톨로지는 그 그래프에서 어떤 IRI가 클래스인지, 어떤 속성이 어떤 관계를 뜻하는지, 클래스끼리 어떤 계층 관계를 갖는지 설명하는 의미 계층이다.

예를 들어 아래 triple은 `sensor-1`이 `Sensor` 클래스의 인스턴스라는 뜻이다.

```turtle
ex:sensor-1 rdf:type ex:Sensor .
```

아래 triple은 `TemperatureSensor`가 `Sensor`보다 더 구체적인 클래스라는 뜻이다.

```turtle
ex:TemperatureSensor rdfs:subClassOf ex:Sensor .
```

OntoLens 입장에서는 RDF 데이터 전체를 그래프로 보고, 그중 클래스, 인스턴스, 속성, literal, 외부 namespace를 구분해 시각화한다.

## 핵심 용어

| 용어 | 뜻 | OntoLens에서 보는 방식 |
| --- | --- | --- |
| RDF | Resource Description Framework. 정보를 그래프 형태로 표현하는 표준 데이터 모델 | endpoint에서 받아오는 기본 데이터 모델 |
| Triple | `subject predicate object` 하나의 문장 | edge 하나 또는 node 관계 하나 |
| Subject | triple의 주어. IRI 또는 blank node | edge의 출발 node |
| Predicate | triple의 술어. 항상 IRI | edge label |
| Object | triple의 목적어. IRI, blank node, literal 가능 | edge의 도착 node 또는 literal node |
| IRI | 전역 식별자. URI보다 넓은 개념 | 대부분의 class, property, instance id |
| Resource | IRI나 literal이 가리키는 대상 | OntoLens의 일반 node |
| Literal | 문자열, 숫자, 날짜 같은 값 | literal node 또는 상세 정보 |
| Blank node | 이름 없는 리소스. 존재는 하지만 IRI가 없음 | `blank:` 형태 node |
| RDF graph | triple의 집합 | 캔버스에 그리는 그래프 |
| RDF dataset | default graph 1개와 named graph 여러 개의 묶음 | endpoint가 제공하는 전체 데이터 묶음 |
| Default graph | 이름 없는 기본 graph | graph 선택이 `default`일 때 조회 |
| Named graph | 이름이 붙은 graph | OntoLens의 graph selector 후보 |
| Namespace IRI | 여러 IRI가 공유하는 앞부분 | `rdf:`, `rdfs:`, `owl:`, `local:` 축약 기준 |
| Prefix | namespace IRI를 줄여 쓰는 별칭 | 라벨 축약과 SPARQL 가독성에 도움 |
| Vocabulary | 특정 도메인에서 재사용하는 IRI 묶음 | 표준/외부/local namespace 구분 기준 |
| Ontology | 클래스, 속성, 제약, 의미 관계를 설명하는 vocabulary/모델 | class map과 계층 탐색의 대상 |

## RDFS와 OWL

RDFS와 OWL은 RDF 위에 의미를 더하는 vocabulary다.

| 용어 | 뜻 |
| --- | --- |
| `rdf:type` | 어떤 리소스가 어떤 클래스의 인스턴스인지 말한다. Turtle에서는 `a`로 줄여 쓸 수 있다. |
| `rdfs:Class` | 어떤 IRI가 클래스임을 나타낸다. |
| `owl:Class` | OWL에서의 클래스 선언. 보통 `rdfs:Class`보다 더 풍부한 의미 모델과 함께 사용한다. |
| `rdfs:subClassOf` | 클래스 계층. `A rdfs:subClassOf B`는 모든 A가 B라는 뜻이다. |
| `rdf:Property` | 어떤 IRI가 속성임을 나타낸다. |
| `owl:ObjectProperty` | object가 다른 리소스인 관계 속성. 예: `ex:hasPart ex:room-1` |
| `owl:DatatypeProperty` | object가 literal 값인 속성. 예: `ex:temperature "23.1"^^xsd:decimal` |
| `rdfs:domain` | 어떤 property를 쓰는 subject가 어떤 클래스라고 추론할 수 있는지 나타낸다. |
| `rdfs:range` | 어떤 property의 object가 어떤 클래스/데이터타입이라고 추론할 수 있는지 나타낸다. |
| Individual / Instance | 클래스에 속하는 실제 개체 | OntoLens의 `instance` node |
| Reasoning / Entailment | 명시된 triple에서 추가 사실을 추론하는 것 | Fuseki 설정에 따라 보일 수도, 안 보일 수도 있다. |

주의할 점: `rdfs:domain`과 `rdfs:range`는 일반적인 프로그래밍 타입 검사처럼 "이 속성은 이 클래스에서만 사용 가능"이라는 validation 규칙이 아니다. RDF/RDFS에서는 추론 힌트에 가깝다.

## Class, Instance, Property 구분

### Class

클래스는 같은 종류의 인스턴스를 묶는 개념이다.

```turtle
ex:Sensor a owl:Class .
ex:TemperatureSensor rdfs:subClassOf ex:Sensor .
```

OntoLens는 `owl:Class`, `rdfs:Class`, `rdfs:subClassOf`, class count query를 이용해 class map을 만든다.

### Instance

인스턴스는 클래스에 속하는 구체적인 개체다.

```turtle
ex:sensor-1 a ex:TemperatureSensor .
```

OntoLens에서 노드를 클릭하면 이 인스턴스를 중심으로 주변 triple을 `CONSTRUCT`해서 neighborhood를 만든다.

### Property

property는 두 리소스 또는 리소스와 literal 사이의 관계다.

```turtle
ex:sensor-1 ex:observes ex:temperature .
ex:sensor-1 ex:displayName "Main AHU Sensor" .
```

`ex:observes`는 object property일 가능성이 높고, `ex:displayName`은 datatype property일 가능성이 높다.

## SPARQL 기본

SPARQL은 RDF graph/dataset을 조회하는 표준 질의 언어다.

| Query form | 결과 | OntoLens에서의 용도 |
| --- | --- | --- |
| `SELECT` | 변수 binding table | 결과 테이블 |
| `CONSTRUCT` | RDF graph | 그래프 캔버스에 그릴 데이터 생성 |
| `ASK` | boolean | 현재는 직접 UI 없음 |
| `DESCRIBE` | RDF graph | 특정 리소스 설명 그래프 |

예시:

```sparql
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>

SELECT ?class WHERE {
  ?class a owl:Class .
}
LIMIT 100
```

```sparql
CONSTRUCT {
  ?class a owl:Class .
  ?class rdfs:subClassOf ?parent .
}
WHERE {
  ?class rdfs:subClassOf ?parent .
}
LIMIT 5000
```

## Turtle 문법 빠르게 보기

Turtle은 RDF를 사람이 읽기 좋게 쓰는 직렬화 형식이다.

```turtle
@prefix ex: <https://example.com/ontology#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .

ex:Sensor a owl:Class ;
  rdfs:label "Sensor" .

ex:sensor-1 a ex:Sensor ;
  rdfs:label "Main Sensor" ;
  ex:score "0.98"^^xsd:decimal .
```

문법상 `;`는 같은 subject에 predicate/object를 계속 붙인다는 뜻이고, `.`은 statement 묶음 종료다. `a`는 `rdf:type`의 축약이다.

## OntoLens에서 특히 중요한 구분

### 온톨로지와 데이터는 다르다

온톨로지는 class/property/계층/의미를 설명한다. 데이터는 실제 instance와 값이다. 실무 dataset은 둘이 섞여 있는 경우가 많다.

### Named graph는 화면 그래프가 아니다

Named graph는 RDF dataset 안의 저장 단위다. OntoLens의 화면 그래프는 query 결과를 시각화한 것이다. 이름은 비슷하지만 다른 개념이다.

### Prefix는 id가 아니다

`rdf:type`은 실제 IRI가 아니라 축약 표현이다. 실제 값은 `http://www.w3.org/1999/02/22-rdf-syntax-ns#type`이다.

### `CONSTRUCT`는 "보기 좋은 그래프"를 만들기 좋다

`SELECT`는 table에 좋고, `CONSTRUCT`는 OntoLens처럼 시각화를 위해 필요한 triple만 재구성할 때 좋다.

## OntoLens 개선 아이디어와 연결

이 용어를 기준으로 보면 OntoLens의 다음 개선은 다음처럼 해석할 수 있다.

- Prefix manager: IRI를 사람이 읽기 좋은 label로 줄이는 기능
- Class map: ontology의 class/subclass 구조를 보는 기능
- Neighborhood: instance/class/property 주변 triple을 graph로 보는 기능
- Result table: `SELECT` 결과 binding을 table로 보는 기능
- Raw tab: endpoint가 실제로 준 JSON/RDF 파싱 결과를 확인하는 기능
- Error diagnostics: endpoint, CORS, query syntax, result limit 문제를 RDF/SPARQL 맥락으로 설명하는 기능

## 참고 문서

- [RDF 1.1 Concepts and Abstract Syntax](https://www.w3.org/TR/rdf11-concepts/)
- [OWL 2 Web Ontology Language Primer](https://www.w3.org/TR/owl2-primer/)
- [SPARQL 1.1 Query Language](https://www.w3.org/TR/sparql11-query/)
