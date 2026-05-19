from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "data" / "ninewatt-large-sample.ttl"
GRAPH_IRI = "https://rnd-fuseki.ninewatt.com/kg/graph/large-sample"
DOCUMENT_IRI = f"https://rnd-fuseki.ninewatt.com/ds/data?graph={GRAPH_IRI}"

KG = "kg"
SERVICE = "service"
TEAM = "team"
INFRA = "infra"
DATACENTER = "datacenter"
ENDPOINT = "endpoint"
JOB = "job"
DASHBOARD = "dashboard"
MONITOR = "monitor"
DOMAIN = "domain"
ENVIRONMENT = "environment"
RUNTIME = "runtime"
CLUSTER = "cluster"
GATEWAY = "gateway"
VENDOR = "vendor"
POLICY = "policy"

PREFIXES = {
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "owl": "http://www.w3.org/2002/07/owl#",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    KG: f"{DOCUMENT_IRI}#",
    SERVICE: f"{DOCUMENT_IRI}#id/service/",
    TEAM: f"{DOCUMENT_IRI}#id/team/",
    INFRA: f"{DOCUMENT_IRI}#id/infra/",
    DATACENTER: f"{DOCUMENT_IRI}#id/datacenter/",
    ENDPOINT: f"{DOCUMENT_IRI}#id/endpoint/",
    JOB: f"{DOCUMENT_IRI}#id/job/",
    DASHBOARD: f"{DOCUMENT_IRI}#id/dashboard/",
    MONITOR: f"{DOCUMENT_IRI}#id/monitor/",
    DOMAIN: f"{DOCUMENT_IRI}#id/domain/",
    ENVIRONMENT: f"{DOCUMENT_IRI}#id/environment/",
    RUNTIME: f"{DOCUMENT_IRI}#id/runtime/",
    CLUSTER: f"{DOCUMENT_IRI}#id/cluster/",
    GATEWAY: f"{DOCUMENT_IRI}#id/gateway/",
    VENDOR: f"{DOCUMENT_IRI}#id/vendor/",
    POLICY: f"{DOCUMENT_IRI}#id/policy/",
}


@dataclass(frozen=True)
class Triple:
    subject: str
    predicate: str
    object: str


@dataclass(frozen=True)
class ServiceSpec:
    slug: str
    domain: str
    team: str
    runtime: str
    database: str
    cache: str
    topic: str
    queue: str
    gateway: str
    dependencies: tuple[str, ...]
    cost: float
    criticality: str


@dataclass(frozen=True)
class JobSpec:
    slug: str
    domain: str
    team: str
    runtime: str
    reads_from: str
    writes_to: str
    queue: str
    depends_on: str
    schedule: str


def curie(prefix: str, value: str) -> str:
    return f"{prefix}:{value}"


def kg(value: str) -> str:
    return curie(KG, value)


def literal(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def typed_literal(value: int | float | str, datatype: str) -> str:
    return f'"{value}"^^xsd:{datatype}'


def display_name(slug: str) -> str:
    words = []
    replacements = {
        "api": "API",
        "bff": "BFF",
        "crm": "CRM",
        "dr": "DR",
        "flink": "Flink",
        "go": "Go",
        "idc": "IDC",
        "java": "Java",
        "kr": "KR",
        "ml": "ML",
        "nginx": "NGINX",
        "nodejs": "Node.js",
        "pdf": "PDF",
        "python": "Python",
        "rust": "Rust",
        "spark": "Spark",
        "slo": "SLO",
        "sms": "SMS",
    }

    for part in slug.split("-"):
        words.append(replacements.get(part, part.capitalize()))

    return " ".join(words)


class GraphBuilder:
    def __init__(self) -> None:
        self.triples: list[Triple] = []
        self.seen: set[Triple] = set()

    def add(self, subject: str, predicate: str, object_value: str) -> None:
        triple = Triple(subject, predicate, object_value)
        if triple in self.seen:
            return
        self.seen.add(triple)
        self.triples.append(triple)

    def resource_nodes(self) -> set[str]:
        nodes = set()
        for triple in self.triples:
            nodes.add(triple.subject)
            if not triple.object.startswith('"'):
                nodes.add(triple.object)
        return nodes

    def resource_edges(self) -> list[Triple]:
        return [triple for triple in self.triples if not triple.object.startswith('"')]


def add_ontology(builder: GraphBuilder) -> None:
    builder.add("<>", "rdf:type", "owl:Ontology")
    builder.add("<>", "rdfs:label", literal("Ninewatt large sample knowledge graph"))
    builder.add("<>", kg("name"), literal("Ninewatt Large Sample Knowledge Graph"))

    classes = {
        "KnowledgeAsset": ("Knowledge Asset", None),
        "OrganizationalUnit": ("Organizational Unit", "KnowledgeAsset"),
        "Team": ("Team", "OrganizationalUnit"),
        "OwnerGroup": ("Owner Group", "OrganizationalUnit"),
        "TechnologyAsset": ("Technology Asset", "KnowledgeAsset"),
        "ApplicationComponent": ("Application Component", "TechnologyAsset"),
        "Service": ("Service", "ApplicationComponent"),
        "BatchJob": ("Batch Job", "ApplicationComponent"),
        "Endpoint": ("Endpoint", "ApplicationComponent"),
        "InfrastructureAsset": ("Infrastructure Asset", "TechnologyAsset"),
        "Server": ("Server", "InfrastructureAsset"),
        "Cluster": ("Cluster", "InfrastructureAsset"),
        "Gateway": ("Gateway", "InfrastructureAsset"),
        "DataStore": ("Data Store", "InfrastructureAsset"),
        "Database": ("Database", "DataStore"),
        "Cache": ("Cache", "DataStore"),
        "Queue": ("Queue", "InfrastructureAsset"),
        "Topic": ("Topic", "InfrastructureAsset"),
        "ObservabilityAsset": ("Observability Asset", "TechnologyAsset"),
        "Dashboard": ("Dashboard", "ObservabilityAsset"),
        "Monitor": ("Monitor", "ObservabilityAsset"),
        "Policy": ("Policy", "KnowledgeAsset"),
        "Runtime": ("Runtime", "TechnologyAsset"),
        "Environment": ("Environment", "KnowledgeAsset"),
        "Domain": ("Business Domain", "KnowledgeAsset"),
        "DataCenter": ("Data Center", "InfrastructureAsset"),
        "ExternalVendor": ("External Vendor", "KnowledgeAsset"),
    }

    for slug, (label, parent) in classes.items():
        class_id = kg(slug)
        builder.add(class_id, "rdf:type", "owl:Class")
        builder.add(class_id, "rdfs:label", literal(label))
        if parent:
            builder.add(class_id, "rdfs:subClassOf", kg(parent))

    object_properties = {
        "ownedBy": ("owned by", "KnowledgeAsset", "OrganizationalUnit"),
        "dependsOn": ("depends on", "ApplicationComponent", "TechnologyAsset"),
        "runsOn": ("runs on", "ApplicationComponent", "InfrastructureAsset"),
        "locatedIn": ("located in", "InfrastructureAsset", "DataCenter"),
        "partOfDomain": ("part of domain", "KnowledgeAsset", "Domain"),
        "deployedIn": ("deployed in", "ApplicationComponent", "Environment"),
        "partOfCluster": ("part of cluster", "InfrastructureAsset", "Cluster"),
        "hasRuntime": ("has runtime", "ApplicationComponent", "Runtime"),
        "readsFrom": ("reads from", "ApplicationComponent", "DataStore"),
        "writesTo": ("writes to", "ApplicationComponent", "DataStore"),
        "usesCache": ("uses cache", "ApplicationComponent", "Cache"),
        "publishesTo": ("publishes to", "ApplicationComponent", "Topic"),
        "consumesFrom": ("consumes from", "ApplicationComponent", "Queue"),
        "emitsTelemetryTo": ("emits telemetry to", "ApplicationComponent", "Topic"),
        "exposesEndpoint": ("exposes endpoint", "Service", "Endpoint"),
        "exposedBy": ("exposed by", "Endpoint", "Gateway"),
        "routesTo": ("routes to", "Gateway", "Service"),
        "monitoredBy": ("monitored by", "TechnologyAsset", "Monitor"),
        "shownOn": ("shown on", "TechnologyAsset", "Dashboard"),
        "alertsTo": ("alerts to", "Monitor", "Team"),
        "coveredByPolicy": ("covered by policy", "KnowledgeAsset", "Policy"),
        "integratesWith": ("integrates with", "ApplicationComponent", "ExternalVendor"),
        "replicatesTo": ("replicates to", "DataStore", "DataStore"),
        "backsUpTo": ("backs up to", "DataStore", "DataCenter"),
        "synchronizesWith": (
            "synchronizes with",
            "ApplicationComponent",
            "ApplicationComponent",
        ),
    }

    for slug, (label, domain, range_value) in object_properties.items():
        property_id = kg(slug)
        builder.add(property_id, "rdf:type", "owl:ObjectProperty")
        builder.add(property_id, "rdfs:label", literal(label))
        builder.add(property_id, "rdfs:domain", kg(domain))
        builder.add(property_id, "rdfs:range", kg(range_value))

    datatype_properties = {
        "name": ("name", "KnowledgeAsset", "string"),
        "description": ("description", "KnowledgeAsset", "string"),
        "country": ("country", "DataCenter", "string"),
        "engine": ("engine", "DataStore", "string"),
        "httpMethod": ("HTTP method", "Endpoint", "string"),
        "path": ("path", "Endpoint", "string"),
        "criticality": ("criticality", "TechnologyAsset", "string"),
        "tier": ("tier", "TechnologyAsset", "string"),
        "schedule": ("schedule", "BatchJob", "string"),
        "monthlyCostUSD": ("monthly cost USD", "Service", "decimal"),
        "cpuCore": ("CPU core count", "Server", "integer"),
        "memoryGB": ("memory GB", "Server", "integer"),
        "sloAvailability": ("SLO availability", "Service", "decimal"),
        "retentionDays": ("retention days", "DataStore", "integer"),
    }

    for slug, (label, domain, range_value) in datatype_properties.items():
        property_id = kg(slug)
        builder.add(property_id, "rdf:type", "owl:DatatypeProperty")
        builder.add(property_id, "rdfs:label", literal(label))
        builder.add(property_id, "rdfs:domain", kg(domain))
        builder.add(property_id, "rdfs:range", curie("xsd", range_value))


def add_named_resource(
    builder: GraphBuilder,
    prefix: str,
    slug: str,
    class_name: str,
    name: str | None = None,
) -> str:
    resource_id = curie(prefix, slug)
    builder.add(resource_id, "rdf:type", kg(class_name))
    builder.add(resource_id, kg("name"), literal(name or display_name(slug)))
    return resource_id


def add_reference_data(builder: GraphBuilder) -> None:
    teams = [
        ("data-platform", "Data Platform Team"),
        ("backend", "Backend Team"),
        ("payments", "Payments Platform Team"),
        ("identity-access", "Identity and Access Team"),
        ("commerce-platform", "Commerce Platform Team"),
        ("fulfillment-ops", "Fulfillment Operations Team"),
        ("growth-platform", "Growth Platform Team"),
        ("analytics-engineering", "Analytics Engineering Team"),
        ("ml-platform", "ML Platform Team"),
        ("security", "Security Engineering Team"),
        ("reliability", "Reliability Engineering Team"),
        ("support-ops", "Support Operations Team"),
        ("partner-engineering", "Partner Engineering Team"),
        ("media-platform", "Media Platform Team"),
        ("governance-risk", "Governance and Risk Team"),
        ("frontend-platform", "Frontend Platform Team"),
    ]
    for slug, name in teams:
        add_named_resource(builder, TEAM, slug, "Team", name)

    domains = [
        "finance",
        "identity",
        "commerce",
        "operations",
        "risk",
        "loyalty",
        "growth",
        "discovery",
        "platform",
        "data",
        "analytics",
        "machine-learning",
        "privacy-governance",
        "experience",
        "support",
        "security",
        "reliability",
        "media",
    ]
    for slug in domains:
        add_named_resource(builder, DOMAIN, slug, "Domain")

    environments = [
        ("prod", "Production"),
        ("staging", "Staging"),
        ("dr", "Disaster Recovery"),
        ("sandbox", "Sandbox"),
    ]
    for slug, name in environments:
        add_named_resource(builder, ENVIRONMENT, slug, "Environment", name)

    data_centers = [
        ("seoul-idc", "Seoul IDC", "KR"),
        ("busan-dr-idc", "Busan DR IDC", "KR"),
        ("singapore-edge", "Singapore Edge", "SG"),
        ("tokyo-edge", "Tokyo Edge", "JP"),
        ("frankfurt-backup", "Frankfurt Backup", "DE"),
    ]
    for slug, name, country in data_centers:
        resource_id = add_named_resource(builder, DATACENTER, slug, "DataCenter", name)
        builder.add(resource_id, kg("country"), literal(country))

    runtimes = [
        ("nodejs-22", "Node.js 22"),
        ("java-21", "Java 21"),
        ("python-3-12", "Python 3.12"),
        ("go-1-23", "Go 1.23"),
        ("rust-1-82", "Rust 1.82"),
        ("nginx-1-27", "NGINX 1.27"),
        ("flink-1-19", "Apache Flink 1.19"),
        ("spark-3-5", "Apache Spark 3.5"),
    ]
    for slug, name in runtimes:
        add_named_resource(builder, RUNTIME, slug, "Runtime", name)

    clusters = [
        ("seoul-prod-core", "Seoul Production Core Cluster", "seoul-idc"),
        ("seoul-prod-data", "Seoul Production Data Cluster", "seoul-idc"),
        ("seoul-prod-edge", "Seoul Production Edge Cluster", "seoul-idc"),
        ("busan-dr-core", "Busan Disaster Recovery Core Cluster", "busan-dr-idc"),
        ("singapore-edge-cluster", "Singapore Edge Cluster", "singapore-edge"),
        ("tokyo-edge-cluster", "Tokyo Edge Cluster", "tokyo-edge"),
        ("analytics-prod", "Analytics Production Cluster", "seoul-idc"),
        ("ml-prod", "ML Production Cluster", "seoul-idc"),
    ]
    for slug, name, data_center in clusters:
        resource_id = add_named_resource(builder, CLUSTER, slug, "Cluster", name)
        builder.add(resource_id, kg("locatedIn"), curie(DATACENTER, data_center))

    gateways = [
        ("public-api-gateway", "Public API Gateway", "seoul-prod-edge"),
        ("partner-api-gateway", "Partner API Gateway", "seoul-prod-edge"),
        ("internal-api-gateway", "Internal API Gateway", "seoul-prod-core"),
        ("edge-content-gateway", "Edge Content Gateway", "singapore-edge-cluster"),
    ]
    for slug, name, cluster in gateways:
        resource_id = add_named_resource(builder, GATEWAY, slug, "Gateway", name)
        builder.add(resource_id, kg("partOfCluster"), curie(CLUSTER, cluster))
        data_center = (
            "singapore-edge" if slug == "edge-content-gateway" else "seoul-idc"
        )
        builder.add(resource_id, kg("locatedIn"), curie(DATACENTER, data_center))

    vendors = [
        "stripe",
        "sendgrid",
        "twilio",
        "salesforce",
        "sentry",
    ]
    for slug in vendors:
        add_named_resource(builder, VENDOR, slug, "ExternalVendor")

    policies = [
        "pci-dss-payment-data",
        "pii-data-retention",
        "customer-erasure-sla",
        "production-change-approval",
        "incident-severity-routing",
        "model-risk-review",
        "audit-log-immutability",
        "third-party-data-processing",
    ]
    for slug in policies:
        add_named_resource(builder, POLICY, slug, "Policy")


def add_infrastructure(builder: GraphBuilder) -> None:
    servers = [
        ("server-a", "server-a", 16, 64, "seoul-idc", "seoul-prod-core"),
        ("server-b", "server-b", 8, 32, "seoul-idc", "seoul-prod-core"),
        ("kr-api-node-01", "KR API Node 01", 16, 64, "seoul-idc", "seoul-prod-core"),
        ("kr-api-node-02", "KR API Node 02", 16, 64, "seoul-idc", "seoul-prod-core"),
        ("kr-api-node-03", "KR API Node 03", 16, 64, "seoul-idc", "seoul-prod-core"),
        ("kr-api-node-04", "KR API Node 04", 16, 64, "seoul-idc", "seoul-prod-core"),
        ("kr-data-node-01", "KR Data Node 01", 32, 128, "seoul-idc", "seoul-prod-data"),
        ("kr-data-node-02", "KR Data Node 02", 32, 128, "seoul-idc", "seoul-prod-data"),
        ("kr-data-node-03", "KR Data Node 03", 32, 128, "seoul-idc", "analytics-prod"),
        ("kr-data-node-04", "KR Data Node 04", 32, 128, "seoul-idc", "analytics-prod"),
        ("kr-ml-node-01", "KR ML Node 01", 48, 192, "seoul-idc", "ml-prod"),
        ("kr-ml-node-02", "KR ML Node 02", 48, 192, "seoul-idc", "ml-prod"),
        ("kr-edge-node-01", "KR Edge Node 01", 16, 64, "seoul-idc", "seoul-prod-edge"),
        ("kr-edge-node-02", "KR Edge Node 02", 16, 64, "seoul-idc", "seoul-prod-edge"),
        (
            "busan-core-node-01",
            "Busan Core Node 01",
            16,
            64,
            "busan-dr-idc",
            "busan-dr-core",
        ),
        (
            "busan-core-node-02",
            "Busan Core Node 02",
            16,
            64,
            "busan-dr-idc",
            "busan-dr-core",
        ),
        (
            "sg-edge-node-01",
            "Singapore Edge Node 01",
            16,
            64,
            "singapore-edge",
            "singapore-edge-cluster",
        ),
        (
            "sg-edge-node-02",
            "Singapore Edge Node 02",
            16,
            64,
            "singapore-edge",
            "singapore-edge-cluster",
        ),
        (
            "tokyo-edge-node-01",
            "Tokyo Edge Node 01",
            16,
            64,
            "tokyo-edge",
            "tokyo-edge-cluster",
        ),
        (
            "tokyo-edge-node-02",
            "Tokyo Edge Node 02",
            16,
            64,
            "tokyo-edge",
            "tokyo-edge-cluster",
        ),
        ("worker-node-01", "Worker Node 01", 16, 64, "seoul-idc", "seoul-prod-core"),
        ("worker-node-02", "Worker Node 02", 16, 64, "seoul-idc", "seoul-prod-core"),
        ("worker-node-03", "Worker Node 03", 16, 64, "seoul-idc", "seoul-prod-core"),
        ("worker-node-04", "Worker Node 04", 16, 64, "seoul-idc", "seoul-prod-core"),
        ("stream-node-01", "Stream Node 01", 24, 96, "seoul-idc", "seoul-prod-data"),
        ("stream-node-02", "Stream Node 02", 24, 96, "seoul-idc", "seoul-prod-data"),
        ("audit-node-01", "Audit Node 01", 16, 64, "seoul-idc", "seoul-prod-data"),
        ("audit-node-02", "Audit Node 02", 16, 64, "busan-dr-idc", "busan-dr-core"),
    ]

    for slug, name, cpu, memory, data_center, cluster in servers:
        resource_id = add_named_resource(builder, INFRA, slug, "Server", name)
        builder.add(resource_id, kg("cpuCore"), typed_literal(cpu, "integer"))
        builder.add(resource_id, kg("memoryGB"), typed_literal(memory, "integer"))
        builder.add(resource_id, kg("locatedIn"), curie(DATACENTER, data_center))
        builder.add(resource_id, kg("partOfCluster"), curie(CLUSTER, cluster))

    databases = [
        (
            "postgres-prod",
            "postgres-prod",
            "PostgreSQL",
            35,
            "seoul-idc",
            "postgres-prod-replica",
        ),
        (
            "postgres-prod-replica",
            "postgres-prod-replica",
            "PostgreSQL",
            35,
            "busan-dr-idc",
            "",
        ),
        (
            "billing-ledger-postgres",
            "Billing Ledger PostgreSQL",
            "PostgreSQL",
            2555,
            "seoul-idc",
            "billing-ledger-postgres-replica",
        ),
        (
            "billing-ledger-postgres-replica",
            "Billing Ledger PostgreSQL Replica",
            "PostgreSQL",
            2555,
            "busan-dr-idc",
            "",
        ),
        (
            "identity-postgres",
            "Identity PostgreSQL",
            "PostgreSQL",
            730,
            "seoul-idc",
            "identity-postgres-replica",
        ),
        (
            "identity-postgres-replica",
            "Identity PostgreSQL Replica",
            "PostgreSQL",
            730,
            "busan-dr-idc",
            "",
        ),
        (
            "order-postgres",
            "Order PostgreSQL",
            "PostgreSQL",
            1095,
            "seoul-idc",
            "order-postgres-replica",
        ),
        (
            "order-postgres-replica",
            "Order PostgreSQL Replica",
            "PostgreSQL",
            1095,
            "busan-dr-idc",
            "",
        ),
        ("catalog-postgres", "Catalog PostgreSQL", "PostgreSQL", 365, "seoul-idc", ""),
        (
            "inventory-postgres",
            "Inventory PostgreSQL",
            "PostgreSQL",
            365,
            "seoul-idc",
            "",
        ),
        (
            "customer-postgres",
            "Customer PostgreSQL",
            "PostgreSQL",
            1095,
            "seoul-idc",
            "customer-postgres-replica",
        ),
        (
            "customer-postgres-replica",
            "Customer PostgreSQL Replica",
            "PostgreSQL",
            1095,
            "busan-dr-idc",
            "",
        ),
        (
            "notification-postgres",
            "Notification PostgreSQL",
            "PostgreSQL",
            180,
            "seoul-idc",
            "",
        ),
        (
            "audit-postgres",
            "Audit PostgreSQL",
            "PostgreSQL",
            2555,
            "seoul-idc",
            "audit-postgres-replica",
        ),
        (
            "audit-postgres-replica",
            "Audit PostgreSQL Replica",
            "PostgreSQL",
            2555,
            "frankfurt-backup",
            "",
        ),
        (
            "consent-postgres",
            "Consent PostgreSQL",
            "PostgreSQL",
            2555,
            "seoul-idc",
            "consent-postgres-replica",
        ),
        (
            "consent-postgres-replica",
            "Consent PostgreSQL Replica",
            "PostgreSQL",
            2555,
            "busan-dr-idc",
            "",
        ),
        (
            "analytics-clickhouse",
            "Analytics ClickHouse",
            "ClickHouse",
            545,
            "seoul-idc",
            "",
        ),
        (
            "warehouse-bigquery",
            "Warehouse BigQuery",
            "BigQuery",
            2555,
            "frankfurt-backup",
            "",
        ),
        (
            "feature-store-postgres",
            "Feature Store PostgreSQL",
            "PostgreSQL",
            365,
            "seoul-idc",
            "",
        ),
        (
            "model-registry-postgres",
            "Model Registry PostgreSQL",
            "PostgreSQL",
            1095,
            "seoul-idc",
            "",
        ),
        ("support-postgres", "Support PostgreSQL", "PostgreSQL", 730, "seoul-idc", ""),
        (
            "media-metadata-postgres",
            "Media Metadata PostgreSQL",
            "PostgreSQL",
            365,
            "seoul-idc",
            "",
        ),
        ("risk-postgres", "Risk PostgreSQL", "PostgreSQL", 1095, "seoul-idc", ""),
        (
            "cost-allocation-postgres",
            "Cost Allocation PostgreSQL",
            "PostgreSQL",
            1095,
            "seoul-idc",
            "",
        ),
    ]

    for slug, name, engine, retention, data_center, replica in databases:
        resource_id = add_named_resource(builder, INFRA, slug, "Database", name)
        builder.add(resource_id, kg("engine"), literal(engine))
        builder.add(
            resource_id, kg("retentionDays"), typed_literal(retention, "integer")
        )
        builder.add(resource_id, kg("locatedIn"), curie(DATACENTER, data_center))
        if replica:
            builder.add(resource_id, kg("replicatesTo"), curie(INFRA, replica))
        if data_center != "busan-dr-idc":
            builder.add(resource_id, kg("backsUpTo"), curie(DATACENTER, "busan-dr-idc"))

    caches = [
        "redis-prod",
        "session-redis",
        "catalog-redis",
        "pricing-redis",
        "order-redis",
        "search-redis",
        "feature-redis",
        "recommendation-redis",
        "rate-limit-redis",
        "partner-redis",
    ]
    for index, slug in enumerate(caches):
        resource_id = add_named_resource(
            builder, INFRA, slug, "Cache", display_name(slug)
        )
        builder.add(resource_id, kg("engine"), literal("Redis"))
        builder.add(resource_id, kg("locatedIn"), curie(DATACENTER, "seoul-idc"))
        builder.add(
            resource_id,
            kg("partOfCluster"),
            curie(CLUSTER, "seoul-prod-data" if index < 6 else "seoul-prod-core"),
        )

    queues = [
        "payment-command-queue",
        "billing-command-queue",
        "fulfillment-command-queue",
        "notification-command-queue",
        "export-command-queue",
        "security-work-queue",
        "support-sync-queue",
        "ml-training-queue",
    ]
    for slug in queues:
        resource_id = add_named_resource(builder, INFRA, slug, "Queue")
        builder.add(resource_id, kg("engine"), literal("Kafka"))
        builder.add(resource_id, kg("locatedIn"), curie(DATACENTER, "seoul-idc"))

    topics = [
        "billing-events",
        "payment-events",
        "order-events",
        "inventory-events",
        "customer-events",
        "shipment-events",
        "notification-events",
        "audit-events",
        "experiment-events",
        "feature-events",
        "risk-events",
        "support-events",
        "media-events",
        "observability-events",
    ]
    for slug in topics:
        resource_id = add_named_resource(builder, INFRA, slug, "Topic")
        builder.add(resource_id, kg("engine"), literal("Kafka"))
        builder.add(resource_id, kg("locatedIn"), curie(DATACENTER, "seoul-idc"))


def add_observability(builder: GraphBuilder) -> None:
    dashboards = [
        "finance-ops-dashboard",
        "payments-slo-dashboard",
        "identity-risk-dashboard",
        "commerce-order-dashboard",
        "fulfillment-control-dashboard",
        "growth-campaign-dashboard",
        "search-quality-dashboard",
        "data-platform-pipeline-dashboard",
        "analytics-usage-dashboard",
        "ml-model-health-dashboard",
        "privacy-governance-dashboard",
        "partner-api-dashboard",
        "media-delivery-dashboard",
        "support-ops-dashboard",
        "security-posture-dashboard",
        "reliability-command-dashboard",
    ]
    for slug in dashboards:
        resource_id = add_named_resource(builder, DASHBOARD, slug, "Dashboard")
        builder.add(resource_id, kg("ownedBy"), curie(TEAM, dashboard_team(slug)))

    monitors = [
        "billing-api-slo-monitor",
        "payment-latency-monitor",
        "identity-auth-monitor",
        "order-funnel-monitor",
        "inventory-freshness-monitor",
        "fraud-decision-monitor",
        "notification-delivery-monitor",
        "event-router-lag-monitor",
        "analytics-query-monitor",
        "feature-store-freshness-monitor",
        "privacy-request-monitor",
        "partner-webhook-monitor",
        "media-cache-hit-monitor",
        "support-sync-monitor",
        "security-feed-monitor",
        "capacity-forecast-monitor",
    ]
    for slug in monitors:
        resource_id = add_named_resource(builder, MONITOR, slug, "Monitor")
        builder.add(resource_id, kg("alertsTo"), curie(TEAM, monitor_team(slug)))
        builder.add(
            resource_id, kg("shownOn"), curie(DASHBOARD, monitor_dashboard(slug))
        )


def dashboard_team(slug: str) -> str:
    mapping = {
        "finance": "payments",
        "payments": "payments",
        "identity": "identity-access",
        "commerce": "commerce-platform",
        "fulfillment": "fulfillment-ops",
        "growth": "growth-platform",
        "search": "commerce-platform",
        "data": "data-platform",
        "analytics": "analytics-engineering",
        "ml": "ml-platform",
        "privacy": "governance-risk",
        "partner": "partner-engineering",
        "media": "media-platform",
        "support": "support-ops",
        "security": "security",
        "reliability": "reliability",
    }
    return next(value for key, value in mapping.items() if slug.startswith(key))


def monitor_team(slug: str) -> str:
    mapping = {
        "billing": "payments",
        "payment": "payments",
        "identity": "identity-access",
        "order": "commerce-platform",
        "inventory": "fulfillment-ops",
        "fraud": "governance-risk",
        "notification": "backend",
        "event": "data-platform",
        "analytics": "analytics-engineering",
        "feature": "ml-platform",
        "privacy": "governance-risk",
        "partner": "partner-engineering",
        "media": "media-platform",
        "support": "support-ops",
        "security": "security",
        "capacity": "reliability",
    }
    return next(value for key, value in mapping.items() if slug.startswith(key))


def monitor_dashboard(slug: str) -> str:
    mapping = {
        "billing": "finance-ops-dashboard",
        "payment": "payments-slo-dashboard",
        "identity": "identity-risk-dashboard",
        "order": "commerce-order-dashboard",
        "inventory": "fulfillment-control-dashboard",
        "fraud": "identity-risk-dashboard",
        "notification": "reliability-command-dashboard",
        "event": "data-platform-pipeline-dashboard",
        "analytics": "analytics-usage-dashboard",
        "feature": "ml-model-health-dashboard",
        "privacy": "privacy-governance-dashboard",
        "partner": "partner-api-dashboard",
        "media": "media-delivery-dashboard",
        "support": "support-ops-dashboard",
        "security": "security-posture-dashboard",
        "capacity": "reliability-command-dashboard",
    }
    return next(value for key, value in mapping.items() if slug.startswith(key))


def service_specs() -> list[ServiceSpec]:
    rows = [
        (
            "billing-api",
            "finance",
            "data-platform",
            "java-21",
            "postgres-prod",
            "redis-prod",
            "billing-events",
            "billing-command-queue",
            "internal-api-gateway",
            ("payment-api",),
            420.50,
            "critical",
        ),
        (
            "payment-api",
            "finance",
            "backend",
            "java-21",
            "billing-ledger-postgres",
            "redis-prod",
            "payment-events",
            "payment-command-queue",
            "public-api-gateway",
            (),
            210.00,
            "critical",
        ),
        (
            "invoice-api",
            "finance",
            "payments",
            "java-21",
            "billing-ledger-postgres",
            "pricing-redis",
            "billing-events",
            "billing-command-queue",
            "internal-api-gateway",
            ("billing-api", "customer-profile-api"),
            178.25,
            "high",
        ),
        (
            "subscription-api",
            "finance",
            "payments",
            "java-21",
            "billing-ledger-postgres",
            "pricing-redis",
            "billing-events",
            "billing-command-queue",
            "public-api-gateway",
            ("payment-api", "pricing-api"),
            232.75,
            "critical",
        ),
        (
            "settlement-api",
            "finance",
            "payments",
            "go-1-23",
            "billing-ledger-postgres",
            "redis-prod",
            "payment-events",
            "payment-command-queue",
            "internal-api-gateway",
            ("payment-api", "ledger-api"),
            264.40,
            "critical",
        ),
        (
            "ledger-api",
            "finance",
            "payments",
            "java-21",
            "billing-ledger-postgres",
            "redis-prod",
            "audit-events",
            "billing-command-queue",
            "internal-api-gateway",
            ("audit-log-api",),
            310.10,
            "critical",
        ),
        (
            "pricing-api",
            "commerce",
            "commerce-platform",
            "go-1-23",
            "catalog-postgres",
            "pricing-redis",
            "order-events",
            "payment-command-queue",
            "public-api-gateway",
            ("catalog-api",),
            120.25,
            "high",
        ),
        (
            "tax-api",
            "finance",
            "payments",
            "python-3-12",
            "billing-ledger-postgres",
            "pricing-redis",
            "billing-events",
            "export-command-queue",
            "internal-api-gateway",
            ("pricing-api",),
            96.35,
            "high",
        ),
        (
            "revenue-recognition-api",
            "finance",
            "payments",
            "python-3-12",
            "cost-allocation-postgres",
            "redis-prod",
            "billing-events",
            "export-command-queue",
            "internal-api-gateway",
            ("ledger-api", "settlement-api"),
            188.60,
            "high",
        ),
        (
            "cost-allocation-api",
            "finance",
            "data-platform",
            "python-3-12",
            "cost-allocation-postgres",
            "redis-prod",
            "billing-events",
            "export-command-queue",
            "internal-api-gateway",
            ("billing-api", "analytics-query-api"),
            149.80,
            "medium",
        ),
        (
            "identity-api",
            "identity",
            "identity-access",
            "go-1-23",
            "identity-postgres",
            "session-redis",
            "customer-events",
            "security-work-queue",
            "public-api-gateway",
            (),
            244.00,
            "critical",
        ),
        (
            "access-policy-api",
            "identity",
            "identity-access",
            "go-1-23",
            "identity-postgres",
            "session-redis",
            "audit-events",
            "security-work-queue",
            "internal-api-gateway",
            ("identity-api",),
            155.40,
            "critical",
        ),
        (
            "session-api",
            "identity",
            "identity-access",
            "go-1-23",
            "identity-postgres",
            "session-redis",
            "customer-events",
            "security-work-queue",
            "public-api-gateway",
            ("identity-api", "rate-limit-api"),
            132.20,
            "high",
        ),
        (
            "customer-profile-api",
            "experience",
            "backend",
            "nodejs-22",
            "customer-postgres",
            "session-redis",
            "customer-events",
            "support-sync-queue",
            "public-api-gateway",
            ("identity-api",),
            168.70,
            "high",
        ),
        (
            "consent-api",
            "privacy-governance",
            "governance-risk",
            "java-21",
            "consent-postgres",
            "session-redis",
            "audit-events",
            "security-work-queue",
            "internal-api-gateway",
            ("identity-api", "customer-profile-api"),
            142.45,
            "critical",
        ),
        (
            "privacy-request-api",
            "privacy-governance",
            "governance-risk",
            "python-3-12",
            "consent-postgres",
            "session-redis",
            "audit-events",
            "export-command-queue",
            "internal-api-gateway",
            ("consent-api", "customer-profile-api"),
            121.95,
            "critical",
        ),
        (
            "audit-log-api",
            "privacy-governance",
            "governance-risk",
            "java-21",
            "audit-postgres",
            "redis-prod",
            "audit-events",
            "security-work-queue",
            "internal-api-gateway",
            ("identity-api",),
            202.30,
            "critical",
        ),
        (
            "compliance-reporting-api",
            "privacy-governance",
            "governance-risk",
            "python-3-12",
            "audit-postgres",
            "redis-prod",
            "audit-events",
            "export-command-queue",
            "internal-api-gateway",
            ("audit-log-api", "privacy-request-api"),
            176.55,
            "high",
        ),
        (
            "notification-api",
            "platform",
            "backend",
            "nodejs-22",
            "notification-postgres",
            "redis-prod",
            "notification-events",
            "notification-command-queue",
            "internal-api-gateway",
            ("customer-profile-api",),
            130.00,
            "high",
        ),
        (
            "email-dispatcher",
            "platform",
            "backend",
            "nodejs-22",
            "notification-postgres",
            "redis-prod",
            "notification-events",
            "notification-command-queue",
            "internal-api-gateway",
            ("notification-api",),
            88.35,
            "medium",
        ),
        (
            "sms-gateway-adapter",
            "platform",
            "backend",
            "nodejs-22",
            "notification-postgres",
            "redis-prod",
            "notification-events",
            "notification-command-queue",
            "internal-api-gateway",
            ("notification-api",),
            92.75,
            "medium",
        ),
        (
            "push-notification-api",
            "platform",
            "backend",
            "go-1-23",
            "notification-postgres",
            "redis-prod",
            "notification-events",
            "notification-command-queue",
            "public-api-gateway",
            ("notification-api",),
            102.10,
            "medium",
        ),
        (
            "order-api",
            "commerce",
            "commerce-platform",
            "java-21",
            "order-postgres",
            "order-redis",
            "order-events",
            "payment-command-queue",
            "public-api-gateway",
            ("cart-api", "payment-api"),
            255.90,
            "critical",
        ),
        (
            "cart-api",
            "commerce",
            "commerce-platform",
            "nodejs-22",
            "order-postgres",
            "order-redis",
            "order-events",
            "payment-command-queue",
            "public-api-gateway",
            ("catalog-api", "pricing-api"),
            118.20,
            "high",
        ),
        (
            "checkout-api",
            "commerce",
            "commerce-platform",
            "nodejs-22",
            "order-postgres",
            "order-redis",
            "order-events",
            "payment-command-queue",
            "public-api-gateway",
            ("cart-api", "payment-api", "fraud-screening-api"),
            179.45,
            "critical",
        ),
        (
            "catalog-api",
            "commerce",
            "commerce-platform",
            "nodejs-22",
            "catalog-postgres",
            "catalog-redis",
            "inventory-events",
            "fulfillment-command-queue",
            "public-api-gateway",
            ("search-api",),
            145.90,
            "high",
        ),
        (
            "inventory-api",
            "operations",
            "fulfillment-ops",
            "java-21",
            "inventory-postgres",
            "catalog-redis",
            "inventory-events",
            "fulfillment-command-queue",
            "internal-api-gateway",
            ("catalog-api",),
            181.30,
            "high",
        ),
        (
            "fulfillment-api",
            "operations",
            "fulfillment-ops",
            "java-21",
            "inventory-postgres",
            "order-redis",
            "shipment-events",
            "fulfillment-command-queue",
            "internal-api-gateway",
            ("order-api", "inventory-api"),
            199.60,
            "critical",
        ),
        (
            "shipment-api",
            "operations",
            "fulfillment-ops",
            "go-1-23",
            "inventory-postgres",
            "order-redis",
            "shipment-events",
            "fulfillment-command-queue",
            "partner-api-gateway",
            ("fulfillment-api",),
            138.75,
            "high",
        ),
        (
            "returns-api",
            "operations",
            "fulfillment-ops",
            "java-21",
            "order-postgres",
            "order-redis",
            "shipment-events",
            "fulfillment-command-queue",
            "public-api-gateway",
            ("order-api", "payment-api"),
            126.40,
            "high",
        ),
        (
            "fraud-screening-api",
            "risk",
            "governance-risk",
            "python-3-12",
            "risk-postgres",
            "feature-redis",
            "risk-events",
            "payment-command-queue",
            "internal-api-gateway",
            ("risk-scoring-api", "identity-api"),
            214.70,
            "critical",
        ),
        (
            "risk-scoring-api",
            "risk",
            "governance-risk",
            "python-3-12",
            "risk-postgres",
            "feature-redis",
            "risk-events",
            "ml-training-queue",
            "internal-api-gateway",
            ("feature-store-api", "ml-inference-api"),
            194.25,
            "critical",
        ),
        (
            "chargeback-api",
            "risk",
            "payments",
            "java-21",
            "risk-postgres",
            "redis-prod",
            "risk-events",
            "payment-command-queue",
            "internal-api-gateway",
            ("payment-api", "fraud-screening-api"),
            158.65,
            "high",
        ),
        (
            "rewards-api",
            "loyalty",
            "growth-platform",
            "nodejs-22",
            "customer-postgres",
            "recommendation-redis",
            "customer-events",
            "notification-command-queue",
            "public-api-gateway",
            ("customer-profile-api",),
            113.10,
            "medium",
        ),
        (
            "loyalty-api",
            "loyalty",
            "growth-platform",
            "nodejs-22",
            "customer-postgres",
            "recommendation-redis",
            "customer-events",
            "notification-command-queue",
            "public-api-gateway",
            ("rewards-api", "campaign-api"),
            151.00,
            "high",
        ),
        (
            "campaign-api",
            "growth",
            "growth-platform",
            "nodejs-22",
            "customer-postgres",
            "recommendation-redis",
            "experiment-events",
            "notification-command-queue",
            "public-api-gateway",
            ("consent-api", "customer-profile-api"),
            137.45,
            "medium",
        ),
        (
            "recommendation-api",
            "growth",
            "ml-platform",
            "python-3-12",
            "feature-store-postgres",
            "recommendation-redis",
            "feature-events",
            "ml-training-queue",
            "public-api-gateway",
            ("feature-store-api", "ml-inference-api"),
            222.20,
            "high",
        ),
        (
            "search-api",
            "discovery",
            "commerce-platform",
            "go-1-23",
            "catalog-postgres",
            "search-redis",
            "inventory-events",
            "fulfillment-command-queue",
            "public-api-gateway",
            ("catalog-api", "product-graph-api"),
            171.55,
            "high",
        ),
        (
            "product-graph-api",
            "discovery",
            "commerce-platform",
            "rust-1-82",
            "catalog-postgres",
            "search-redis",
            "inventory-events",
            "fulfillment-command-queue",
            "internal-api-gateway",
            ("catalog-api",),
            164.35,
            "medium",
        ),
        (
            "data-ingestion-api",
            "data",
            "data-platform",
            "python-3-12",
            "warehouse-bigquery",
            "feature-redis",
            "customer-events",
            "export-command-queue",
            "internal-api-gateway",
            ("event-router",),
            198.75,
            "high",
        ),
        (
            "event-router",
            "platform",
            "data-platform",
            "go-1-23",
            "analytics-clickhouse",
            "redis-prod",
            "observability-events",
            "export-command-queue",
            "internal-api-gateway",
            (),
            240.50,
            "critical",
        ),
        (
            "analytics-query-api",
            "analytics",
            "analytics-engineering",
            "python-3-12",
            "analytics-clickhouse",
            "feature-redis",
            "observability-events",
            "export-command-queue",
            "internal-api-gateway",
            ("data-ingestion-api",),
            185.65,
            "high",
        ),
        (
            "feature-store-api",
            "machine-learning",
            "ml-platform",
            "python-3-12",
            "feature-store-postgres",
            "feature-redis",
            "feature-events",
            "ml-training-queue",
            "internal-api-gateway",
            ("data-ingestion-api",),
            196.00,
            "critical",
        ),
        (
            "experimentation-api",
            "growth",
            "growth-platform",
            "nodejs-22",
            "analytics-clickhouse",
            "feature-redis",
            "experiment-events",
            "notification-command-queue",
            "public-api-gateway",
            ("feature-store-api", "consent-api"),
            148.95,
            "high",
        ),
        (
            "admin-console-api",
            "platform",
            "backend",
            "nodejs-22",
            "audit-postgres",
            "session-redis",
            "audit-events",
            "security-work-queue",
            "internal-api-gateway",
            ("identity-api", "audit-log-api"),
            124.10,
            "medium",
        ),
        (
            "developer-portal-api",
            "platform",
            "partner-engineering",
            "nodejs-22",
            "support-postgres",
            "partner-redis",
            "support-events",
            "support-sync-queue",
            "partner-api-gateway",
            ("identity-api", "partner-api"),
            117.85,
            "medium",
        ),
        (
            "api-gateway",
            "platform",
            "reliability",
            "nginx-1-27",
            "audit-postgres",
            "rate-limit-redis",
            "observability-events",
            "security-work-queue",
            "public-api-gateway",
            ("identity-api", "access-policy-api"),
            260.20,
            "critical",
        ),
        (
            "partner-api",
            "platform",
            "partner-engineering",
            "go-1-23",
            "support-postgres",
            "partner-redis",
            "support-events",
            "support-sync-queue",
            "partner-api-gateway",
            ("identity-api", "webhook-dispatcher"),
            175.50,
            "high",
        ),
        (
            "webhook-dispatcher",
            "platform",
            "partner-engineering",
            "go-1-23",
            "support-postgres",
            "partner-redis",
            "support-events",
            "support-sync-queue",
            "partner-api-gateway",
            ("partner-api", "event-router"),
            131.70,
            "high",
        ),
        (
            "file-export-api",
            "data",
            "data-platform",
            "python-3-12",
            "warehouse-bigquery",
            "redis-prod",
            "audit-events",
            "export-command-queue",
            "internal-api-gateway",
            ("analytics-query-api", "audit-log-api"),
            135.40,
            "medium",
        ),
        (
            "media-metadata-api",
            "media",
            "media-platform",
            "go-1-23",
            "media-metadata-postgres",
            "catalog-redis",
            "media-events",
            "export-command-queue",
            "internal-api-gateway",
            ("asset-delivery-api",),
            112.80,
            "medium",
        ),
        (
            "asset-delivery-api",
            "media",
            "media-platform",
            "rust-1-82",
            "media-metadata-postgres",
            "catalog-redis",
            "media-events",
            "export-command-queue",
            "edge-content-gateway",
            ("media-metadata-api",),
            186.30,
            "high",
        ),
        (
            "support-case-api",
            "support",
            "support-ops",
            "nodejs-22",
            "support-postgres",
            "partner-redis",
            "support-events",
            "support-sync-queue",
            "internal-api-gateway",
            ("customer-profile-api",),
            98.25,
            "medium",
        ),
        (
            "ticket-sync-worker",
            "support",
            "support-ops",
            "nodejs-22",
            "support-postgres",
            "partner-redis",
            "support-events",
            "support-sync-queue",
            "internal-api-gateway",
            ("support-case-api", "crm-sync-api"),
            76.60,
            "medium",
        ),
        (
            "crm-sync-api",
            "support",
            "support-ops",
            "nodejs-22",
            "support-postgres",
            "partner-redis",
            "support-events",
            "support-sync-queue",
            "internal-api-gateway",
            ("partner-api",),
            90.10,
            "medium",
        ),
        (
            "mobile-bff",
            "experience",
            "frontend-platform",
            "nodejs-22",
            "customer-postgres",
            "session-redis",
            "customer-events",
            "support-sync-queue",
            "public-api-gateway",
            ("identity-api", "order-api", "notification-api"),
            152.70,
            "high",
        ),
        (
            "web-bff",
            "experience",
            "frontend-platform",
            "nodejs-22",
            "customer-postgres",
            "session-redis",
            "customer-events",
            "support-sync-queue",
            "public-api-gateway",
            ("identity-api", "catalog-api", "cart-api"),
            147.30,
            "high",
        ),
        (
            "reporting-api",
            "analytics",
            "analytics-engineering",
            "python-3-12",
            "analytics-clickhouse",
            "feature-redis",
            "observability-events",
            "export-command-queue",
            "internal-api-gateway",
            ("analytics-query-api", "file-export-api"),
            167.20,
            "high",
        ),
        (
            "ml-inference-api",
            "machine-learning",
            "ml-platform",
            "python-3-12",
            "model-registry-postgres",
            "feature-redis",
            "feature-events",
            "ml-training-queue",
            "internal-api-gateway",
            ("model-registry-api", "feature-store-api"),
            258.45,
            "critical",
        ),
        (
            "model-registry-api",
            "machine-learning",
            "ml-platform",
            "python-3-12",
            "model-registry-postgres",
            "feature-redis",
            "feature-events",
            "ml-training-queue",
            "internal-api-gateway",
            ("feature-store-api",),
            139.95,
            "high",
        ),
        (
            "content-moderation-api",
            "security",
            "security",
            "python-3-12",
            "risk-postgres",
            "feature-redis",
            "risk-events",
            "security-work-queue",
            "internal-api-gateway",
            ("ml-inference-api", "audit-log-api"),
            133.55,
            "high",
        ),
        (
            "review-api",
            "experience",
            "commerce-platform",
            "nodejs-22",
            "customer-postgres",
            "recommendation-redis",
            "customer-events",
            "support-sync-queue",
            "public-api-gateway",
            ("customer-profile-api", "content-moderation-api"),
            103.30,
            "medium",
        ),
        (
            "warehouse-sync-worker",
            "data",
            "data-platform",
            "spark-3-5",
            "warehouse-bigquery",
            "feature-redis",
            "audit-events",
            "export-command-queue",
            "internal-api-gateway",
            ("data-ingestion-api", "analytics-query-api"),
            184.90,
            "high",
        ),
        (
            "data-quality-api",
            "data",
            "data-platform",
            "python-3-12",
            "warehouse-bigquery",
            "feature-redis",
            "observability-events",
            "export-command-queue",
            "internal-api-gateway",
            ("warehouse-sync-worker",),
            122.45,
            "medium",
        ),
        (
            "observability-api",
            "reliability",
            "reliability",
            "go-1-23",
            "analytics-clickhouse",
            "redis-prod",
            "observability-events",
            "security-work-queue",
            "internal-api-gateway",
            ("event-router",),
            156.80,
            "high",
        ),
        (
            "incident-routing-api",
            "reliability",
            "reliability",
            "go-1-23",
            "audit-postgres",
            "redis-prod",
            "observability-events",
            "security-work-queue",
            "internal-api-gateway",
            ("observability-api", "notification-api"),
            142.20,
            "critical",
        ),
        (
            "capacity-planner-api",
            "reliability",
            "reliability",
            "python-3-12",
            "analytics-clickhouse",
            "feature-redis",
            "observability-events",
            "ml-training-queue",
            "internal-api-gateway",
            ("analytics-query-api", "feature-store-api"),
            174.60,
            "high",
        ),
        (
            "secret-rotation-worker",
            "security",
            "security",
            "go-1-23",
            "audit-postgres",
            "session-redis",
            "audit-events",
            "security-work-queue",
            "internal-api-gateway",
            ("identity-api", "audit-log-api"),
            119.75,
            "critical",
        ),
        (
            "vulnerability-intake-api",
            "security",
            "security",
            "python-3-12",
            "risk-postgres",
            "feature-redis",
            "risk-events",
            "security-work-queue",
            "internal-api-gateway",
            ("content-moderation-api", "audit-log-api"),
            127.65,
            "high",
        ),
        (
            "rate-limit-api",
            "platform",
            "reliability",
            "go-1-23",
            "audit-postgres",
            "rate-limit-redis",
            "observability-events",
            "security-work-queue",
            "internal-api-gateway",
            ("identity-api",),
            89.95,
            "critical",
        ),
    ]
    return [ServiceSpec(*row) for row in rows]


def add_services(builder: GraphBuilder) -> None:
    servers = [
        "server-a",
        "server-b",
        "kr-api-node-01",
        "kr-api-node-02",
        "kr-api-node-03",
        "kr-api-node-04",
        "worker-node-01",
        "worker-node-02",
        "worker-node-03",
        "worker-node-04",
        "kr-data-node-01",
        "kr-data-node-02",
        "kr-ml-node-01",
        "kr-ml-node-02",
        "kr-edge-node-01",
        "kr-edge-node-02",
    ]
    monitors = [
        "billing-api-slo-monitor",
        "payment-latency-monitor",
        "identity-auth-monitor",
        "order-funnel-monitor",
        "inventory-freshness-monitor",
        "fraud-decision-monitor",
        "notification-delivery-monitor",
        "event-router-lag-monitor",
        "analytics-query-monitor",
        "feature-store-freshness-monitor",
        "privacy-request-monitor",
        "partner-webhook-monitor",
        "media-cache-hit-monitor",
        "support-sync-monitor",
        "security-feed-monitor",
        "capacity-forecast-monitor",
    ]
    dashboards = [
        "finance-ops-dashboard",
        "payments-slo-dashboard",
        "identity-risk-dashboard",
        "commerce-order-dashboard",
        "fulfillment-control-dashboard",
        "growth-campaign-dashboard",
        "search-quality-dashboard",
        "data-platform-pipeline-dashboard",
        "analytics-usage-dashboard",
        "ml-model-health-dashboard",
        "privacy-governance-dashboard",
        "partner-api-dashboard",
        "media-delivery-dashboard",
        "support-ops-dashboard",
        "security-posture-dashboard",
        "reliability-command-dashboard",
    ]
    policies_by_domain = {
        "finance": "pci-dss-payment-data",
        "privacy-governance": "pii-data-retention",
        "identity": "customer-erasure-sla",
        "risk": "model-risk-review",
        "machine-learning": "model-risk-review",
        "security": "incident-severity-routing",
        "reliability": "incident-severity-routing",
        "platform": "production-change-approval",
    }
    vendors_by_service = {
        "payment-api": "stripe",
        "email-dispatcher": "sendgrid",
        "sms-gateway-adapter": "twilio",
        "crm-sync-api": "salesforce",
        "observability-api": "sentry",
        "incident-routing-api": "sentry",
    }

    for index, spec in enumerate(service_specs()):
        service_id = add_named_resource(builder, SERVICE, spec.slug, "Service")
        endpoint_id = add_named_resource(
            builder,
            ENDPOINT,
            spec.slug,
            "Endpoint",
            f"{display_name(spec.slug)} Endpoint",
        )
        endpoint_path = f"/v1/{spec.slug.replace('-api', '').replace('-worker', '')}"

        builder.add(service_id, kg("ownedBy"), curie(TEAM, spec.team))
        builder.add(service_id, kg("partOfDomain"), curie(DOMAIN, spec.domain))
        builder.add(service_id, kg("deployedIn"), curie(ENVIRONMENT, "prod"))
        builder.add(service_id, kg("hasRuntime"), curie(RUNTIME, spec.runtime))
        builder.add(
            service_id, kg("runsOn"), curie(INFRA, servers[index % len(servers)])
        )
        builder.add(service_id, kg("readsFrom"), curie(INFRA, spec.database))
        builder.add(service_id, kg("writesTo"), curie(INFRA, spec.database))
        builder.add(service_id, kg("usesCache"), curie(INFRA, spec.cache))
        builder.add(service_id, kg("dependsOn"), curie(INFRA, spec.database))
        builder.add(service_id, kg("dependsOn"), curie(INFRA, spec.cache))
        builder.add(service_id, kg("publishesTo"), curie(INFRA, spec.topic))
        builder.add(
            service_id, kg("emitsTelemetryTo"), curie(INFRA, "observability-events")
        )
        builder.add(service_id, kg("consumesFrom"), curie(INFRA, spec.queue))
        builder.add(service_id, kg("exposesEndpoint"), endpoint_id)
        builder.add(
            service_id,
            kg("monitoredBy"),
            curie(MONITOR, monitors[index % len(monitors)]),
        )
        builder.add(
            service_id,
            kg("shownOn"),
            curie(DASHBOARD, dashboards[index % len(dashboards)]),
        )
        builder.add(
            service_id,
            kg("coveredByPolicy"),
            curie(
                POLICY,
                policies_by_domain.get(spec.domain, "production-change-approval"),
            ),
        )
        builder.add(
            service_id, kg("monthlyCostUSD"), typed_literal(spec.cost, "decimal")
        )
        builder.add(service_id, kg("criticality"), literal(spec.criticality))
        builder.add(
            service_id,
            kg("tier"),
            literal("tier-1" if spec.criticality == "critical" else "tier-2"),
        )
        builder.add(
            service_id,
            kg("sloAvailability"),
            typed_literal(99.95 if spec.criticality == "critical" else 99.9, "decimal"),
        )

        for dependency in spec.dependencies:
            builder.add(service_id, kg("dependsOn"), curie(SERVICE, dependency))

        if index > 2:
            builder.add(
                service_id,
                kg("dependsOn"),
                curie(SERVICE, service_specs()[index - 3].slug),
            )
        if index % 5 == 0 and index > 0:
            builder.add(
                service_id,
                kg("synchronizesWith"),
                curie(SERVICE, service_specs()[index - 1].slug),
            )

        if spec.slug in vendors_by_service:
            builder.add(
                service_id,
                kg("integratesWith"),
                curie(VENDOR, vendors_by_service[spec.slug]),
            )

        builder.add(
            endpoint_id,
            kg("httpMethod"),
            literal("POST" if spec.slug.endswith("worker") else "GET"),
        )
        builder.add(endpoint_id, kg("path"), literal(endpoint_path))
        builder.add(endpoint_id, kg("exposedBy"), curie(GATEWAY, spec.gateway))
        builder.add(curie(GATEWAY, spec.gateway), kg("routesTo"), service_id)


def job_specs() -> list[JobSpec]:
    rows = [
        (
            "nightly-billing-close",
            "finance",
            "payments",
            "python-3-12",
            "billing-ledger-postgres",
            "warehouse-bigquery",
            "billing-command-queue",
            "billing-api",
            "0 2 * * *",
        ),
        (
            "daily-ledger-reconciliation",
            "finance",
            "payments",
            "python-3-12",
            "billing-ledger-postgres",
            "audit-postgres",
            "billing-command-queue",
            "ledger-api",
            "0 3 * * *",
        ),
        (
            "invoice-pdf-render",
            "finance",
            "payments",
            "nodejs-22",
            "billing-ledger-postgres",
            "media-metadata-postgres",
            "export-command-queue",
            "invoice-api",
            "*/15 * * * *",
        ),
        (
            "subscription-renewal-sweeper",
            "finance",
            "payments",
            "java-21",
            "billing-ledger-postgres",
            "billing-ledger-postgres",
            "billing-command-queue",
            "subscription-api",
            "0 */2 * * *",
        ),
        (
            "settlement-bank-file-export",
            "finance",
            "payments",
            "python-3-12",
            "billing-ledger-postgres",
            "warehouse-bigquery",
            "export-command-queue",
            "settlement-api",
            "0 4 * * 1-5",
        ),
        (
            "tax-rate-refresh",
            "finance",
            "payments",
            "python-3-12",
            "billing-ledger-postgres",
            "catalog-postgres",
            "export-command-queue",
            "tax-api",
            "0 1 * * *",
        ),
        (
            "inventory-reorder-planner",
            "operations",
            "fulfillment-ops",
            "python-3-12",
            "inventory-postgres",
            "warehouse-bigquery",
            "fulfillment-command-queue",
            "inventory-api",
            "30 1 * * *",
        ),
        (
            "shipment-status-import",
            "operations",
            "fulfillment-ops",
            "go-1-23",
            "inventory-postgres",
            "order-postgres",
            "fulfillment-command-queue",
            "shipment-api",
            "*/10 * * * *",
        ),
        (
            "returns-refund-settlement",
            "operations",
            "fulfillment-ops",
            "java-21",
            "order-postgres",
            "billing-ledger-postgres",
            "payment-command-queue",
            "returns-api",
            "*/30 * * * *",
        ),
        (
            "campaign-audience-refresh",
            "growth",
            "growth-platform",
            "python-3-12",
            "customer-postgres",
            "analytics-clickhouse",
            "notification-command-queue",
            "campaign-api",
            "0 */4 * * *",
        ),
        (
            "recommendation-model-train",
            "machine-learning",
            "ml-platform",
            "python-3-12",
            "feature-store-postgres",
            "model-registry-postgres",
            "ml-training-queue",
            "recommendation-api",
            "0 5 * * *",
        ),
        (
            "search-index-compaction",
            "discovery",
            "commerce-platform",
            "rust-1-82",
            "catalog-postgres",
            "catalog-postgres",
            "fulfillment-command-queue",
            "search-api",
            "0 0 * * 0",
        ),
        (
            "clickstream-rollup",
            "analytics",
            "analytics-engineering",
            "spark-3-5",
            "analytics-clickhouse",
            "warehouse-bigquery",
            "export-command-queue",
            "analytics-query-api",
            "0 * * * *",
        ),
        (
            "warehouse-dimension-sync",
            "data",
            "data-platform",
            "spark-3-5",
            "warehouse-bigquery",
            "warehouse-bigquery",
            "export-command-queue",
            "warehouse-sync-worker",
            "15 * * * *",
        ),
        (
            "feature-store-materializer",
            "machine-learning",
            "ml-platform",
            "flink-1-19",
            "warehouse-bigquery",
            "feature-store-postgres",
            "ml-training-queue",
            "feature-store-api",
            "*/20 * * * *",
        ),
        (
            "privacy-erasure-sweeper",
            "privacy-governance",
            "governance-risk",
            "python-3-12",
            "consent-postgres",
            "audit-postgres",
            "security-work-queue",
            "privacy-request-api",
            "0 */6 * * *",
        ),
        (
            "audit-log-retention-rollup",
            "privacy-governance",
            "governance-risk",
            "spark-3-5",
            "audit-postgres",
            "warehouse-bigquery",
            "security-work-queue",
            "audit-log-api",
            "30 2 * * *",
        ),
        (
            "cost-anomaly-detector",
            "finance",
            "data-platform",
            "python-3-12",
            "cost-allocation-postgres",
            "analytics-clickhouse",
            "ml-training-queue",
            "cost-allocation-api",
            "0 * * * *",
        ),
        (
            "capacity-forecast-trainer",
            "reliability",
            "reliability",
            "python-3-12",
            "analytics-clickhouse",
            "model-registry-postgres",
            "ml-training-queue",
            "capacity-planner-api",
            "0 6 * * *",
        ),
        (
            "vulnerability-feed-import",
            "security",
            "security",
            "python-3-12",
            "risk-postgres",
            "risk-postgres",
            "security-work-queue",
            "vulnerability-intake-api",
            "*/30 * * * *",
        ),
    ]
    return [JobSpec(*row) for row in rows]


def add_jobs(builder: GraphBuilder) -> None:
    servers = [
        "worker-node-01",
        "worker-node-02",
        "worker-node-03",
        "worker-node-04",
        "kr-data-node-03",
        "kr-data-node-04",
    ]
    monitors = [
        "event-router-lag-monitor",
        "analytics-query-monitor",
        "feature-store-freshness-monitor",
        "privacy-request-monitor",
        "security-feed-monitor",
        "capacity-forecast-monitor",
    ]
    dashboards = [
        "data-platform-pipeline-dashboard",
        "analytics-usage-dashboard",
        "ml-model-health-dashboard",
        "privacy-governance-dashboard",
        "security-posture-dashboard",
        "reliability-command-dashboard",
    ]

    for index, spec in enumerate(job_specs()):
        job_id = add_named_resource(builder, JOB, spec.slug, "BatchJob")
        builder.add(job_id, kg("ownedBy"), curie(TEAM, spec.team))
        builder.add(job_id, kg("partOfDomain"), curie(DOMAIN, spec.domain))
        builder.add(job_id, kg("deployedIn"), curie(ENVIRONMENT, "prod"))
        builder.add(job_id, kg("hasRuntime"), curie(RUNTIME, spec.runtime))
        builder.add(job_id, kg("runsOn"), curie(INFRA, servers[index % len(servers)]))
        builder.add(job_id, kg("readsFrom"), curie(INFRA, spec.reads_from))
        builder.add(job_id, kg("writesTo"), curie(INFRA, spec.writes_to))
        builder.add(job_id, kg("consumesFrom"), curie(INFRA, spec.queue))
        builder.add(job_id, kg("dependsOn"), curie(SERVICE, spec.depends_on))
        builder.add(job_id, kg("publishesTo"), curie(INFRA, "audit-events"))
        builder.add(
            job_id, kg("emitsTelemetryTo"), curie(INFRA, "observability-events")
        )
        builder.add(
            job_id, kg("monitoredBy"), curie(MONITOR, monitors[index % len(monitors)])
        )
        builder.add(
            job_id, kg("shownOn"), curie(DASHBOARD, dashboards[index % len(dashboards)])
        )
        builder.add(job_id, kg("schedule"), literal(spec.schedule))
        builder.add(
            job_id, kg("criticality"), literal("high" if index % 3 == 0 else "medium")
        )


def serialize_turtle(builder: GraphBuilder) -> str:
    lines = [f"@base <{DOCUMENT_IRI}> ."]
    lines.extend(f"@prefix {prefix}: <{iri}> ." for prefix, iri in PREFIXES.items())
    lines.append("")

    grouped: dict[str, list[Triple]] = {}
    for triple in builder.triples:
        grouped.setdefault(triple.subject, []).append(triple)

    for subject in grouped:
        triples = grouped[subject]
        lines.append(f"{subject}")
        for index, triple in enumerate(triples):
            predicate = "a" if triple.predicate == "rdf:type" else triple.predicate
            terminator = " ." if index == len(triples) - 1 else " ;"
            lines.append(f"    {predicate} {triple.object}{terminator}")
        lines.append("")

    return "\n".join(lines)


def build_graph() -> GraphBuilder:
    builder = GraphBuilder()
    add_reference_data(builder)
    add_infrastructure(builder)
    add_observability(builder)
    add_services(builder)
    add_jobs(builder)
    add_ontology(builder)
    return builder


def main() -> None:
    builder = build_graph()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(serialize_turtle(builder), encoding="utf-8")

    print(f"Wrote {OUTPUT_PATH}")
    print(f"Graph IRI: {GRAPH_IRI}")
    print(f"Dereference URL: {DOCUMENT_IRI}")
    print(f"Resource nodes: {len(builder.resource_nodes())}")
    print(f"Resource edges: {len(builder.resource_edges())}")
    print(f"Total triples: {len(builder.triples)}")


if __name__ == "__main__":
    main()
