# Appy Sentinel & AppyTelemetry — v1 Architecture Brief

## 1. Purpose

This document defines the architecture, terminology, and core design principles for a local-first telemetry system built by AppyDave.

The goal is to provide a consistent foundation for building telemetry-driven applications such as:

* AngelEye (log-centric analysis)
* AppyRadar (machine/system monitoring)

This system avoids heavy infrastructure and instead focuses on:

* Simplicity
* Local-first design
* Clear data contracts
* Extensibility

---

## 2. Terminology (Core Mental Model)

### Telemetry (Domain)

Telemetry refers to the collection, transmission, and analysis of system data.

It is the *problem space* this system operates in.

Examples:

* Logs
* Metrics
* Events
* System state

---

### OTEL (OpenTelemetry) (Standard)

OpenTelemetry (OTEL) is an industry standard for structuring and transporting telemetry data.

This system is **inspired by OTEL**, but does NOT depend on it.

OTEL provides:

* Standard data shapes (logs, metrics, spans)
* Semantic conventions (naming standards)
* Transport protocols (OTLP)

In this system:

> OTEL is treated as a reference model, not a dependency.

---

### Collector (Function)

A collector is a component that:

* Gathers data
* Sends data to a central system

This is a functional description, not a system identity.

---

### Sentinel (Identity)

A Sentinel is the core runtime unit of this system.

A Sentinel:

* Runs locally on a machine
* Collects telemetry
* Exposes a local control interface (MCP)
* Pushes data to a central system
* Pulls configuration from a central system

> A Sentinel is a **collector with agency and interaction capabilities**.

---

### MCP (Model Context Protocol / Local Control Interface)

MCP refers to a local interface exposed by the Sentinel.

It allows:

* Local AI agents
* Local dashboards
* Developer tools

to:

* Query data
* Trigger actions
* Configure behavior

---

## 3. System Overview

The system consists of three primary layers:

1. **Sentinel (Local Agent)**
2. **Central System (Optional / Remote)**
3. **Local Clients (AI, UI, Dev Tools)**

---

### 3.1 Sentinel (Local Runtime)

Each machine runs one or more Sentinels.

Responsibilities:

* Collect telemetry from local sources
* Normalize data into standard shapes
* Expose MCP interface
* Push telemetry upstream
* Pull configuration downstream

---

### 3.2 Central System

The central system aggregates telemetry from multiple Sentinels.

Responsibilities:

* Store data
* Provide dashboards
* Provide configuration
* Coordinate across machines

NOTE:

* The system must function WITHOUT a central system (local-first design)

---

### 3.3 Local Clients

Local clients interact with the Sentinel via MCP.

Examples:

* Local dashboards
* AI agents
* Developer tools

---

## 4. Communication Model

### 4.1 Push (Primary Data Flow)

Sentinel → Central System

Used for:

* Logs
* Metrics
* Events
* State snapshots
* Artifacts

---

### 4.2 Pull (Configuration)

Sentinel → Central System (polling)

Used for:

* Configuration updates
* Feature flags
* Policies
* Runtime instructions

Reasoning:

* Avoid inbound network exposure
* Maintain security
* Simplify networking

---

### 4.3 Local MCP Interaction

Local Client ↔ Sentinel

Used for:

* Querying telemetry
* Controlling behavior
* Debugging
* Local automation

---

## 5. Core Data Shapes

This system uses a minimal set of OTEL-inspired data shapes.

---

### 5.1 Log

Represents a point-in-time record.

Purpose:

* Debugging
* Audit trails

Example:

```json
{
  "type": "log",
  "timestamp": "2026-04-25T10:00:00Z",
  "severity": "info",
  "message": "Transcription completed",
  "attributes": {
    "file": "video.mp4"
  }
}
```

---

### 5.2 Metric

Represents a numeric measurement.

Purpose:

* System monitoring
* Dashboards

Example:

```json
{
  "type": "metric",
  "name": "disk.usage",
  "value": 72,
  "timestamp": "2026-04-25T10:00:00Z",
  "attributes": {
    "disk": "main"
  }
}
```

---

### 5.3 Event

Represents a meaningful domain-level occurrence.

Purpose:

* Business logic
* Workflow triggers

Example:

```json
{
  "type": "event",
  "name": "transcription.completed",
  "timestamp": "2026-04-25T10:00:00Z",
  "payload": {
    "fileId": "abc123"
  }
}
```

---

### 5.4 State Snapshot

Represents the full system state at a point in time.

Purpose:

* Machine monitoring
* Debugging
* Diffing system states

Example:

```json
{
  "type": "state",
  "timestamp": "2026-04-25T10:00:00Z",
  "state": {
    "diskUsage": 72,
    "tailscaleConnected": true
  }
}
```

---

### 5.5 Span (Optional / Future)

Represents a time-bounded operation.

Purpose:

* Tracing workflows
* Performance analysis

Example:

```json
{
  "type": "span",
  "name": "process.transcription",
  "start": "2026-04-25T10:00:00Z",
  "end": "2026-04-25T10:00:10Z",
  "attributes": {
    "fileId": "abc123"
  }
}
```

---

## 6. Design Principles

* **Local-first** — system must work without a central server
* **No inbound connections** — all remote communication is outbound
* **Pull-based configuration** — simplifies networking and security
* **Transport-agnostic** — works with Socket.IO, HTTP, etc.
* **Minimal data model** — avoid over-engineering
* **OTEL-inspired, not dependent**

---

## 7. Non-Goals

This system is NOT:

* A full observability platform (e.g., Datadog, ELK)
* A distributed streaming system (e.g., Kafka)
* A vendor-locked solution
* A full OpenTelemetry implementation

---

## 8. Future Considerations

* OTEL compatibility layer
* Distributed tracing (spans)
* Multi-sentinel coordination
* Centralized dashboards
* AI-driven automation

---

## 9. Summary

This system defines:

* **Telemetry** as the domain
* **OTEL** as the inspiration
* **Collector** as the function
* **Sentinel** as the identity

It provides a clean, extensible foundation for building telemetry-driven applications without unnecessary complexity.
