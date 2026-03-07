---
name: deep-dive
description: "This skill should be used when the user asks to 'deep dive into a project', 'analyze this codebase', 'investigate tech stack', 'map the architecture', 'understand how this project works', 'explore this repo', 'what technologies does this use', 'give me an overview of this project', or needs a comprehensive codebase analysis with Mermaid diagrams."
disable-model-invocation: false
context: fork
allowed-tools: Read, Glob, Grep, Bash, WebSearch, WebFetch
---

# /deep-dive

Perform a comprehensive, structured analysis of any codebase — identifying its tech stack, dissecting core modules, mapping data flows, and producing a visual Mermaid-based report.

## Pre-fetched Context

- **Project root:** !`ls -la 2>/dev/null | head -25`
- **Package files:** !`cat package.json 2>/dev/null | head -30 || cat Cargo.toml 2>/dev/null | head -30 || cat go.mod 2>/dev/null | head -30 || cat pyproject.toml 2>/dev/null | head -30 || cat pom.xml 2>/dev/null | head -30 || cat Gemfile 2>/dev/null | head -30 || echo "No standard package manifest found"`
- **README:** !`cat README.md 2>/dev/null | head -80 || cat README.rst 2>/dev/null | head -80 || echo "No README"`
- **Directory structure:** !`find . -maxdepth 3 -type d ! -path '*/node_modules/*' ! -path '*/.git/*' ! -path '*/vendor/*' ! -path '*/__pycache__/*' ! -path '*/target/*' ! -path '*/dist/*' ! -path '*/.next/*' ! -path '*/build/*' 2>/dev/null | head -60`
- **Source file types:** !`find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.java" -o -name "*.rb" -o -name "*.php" -o -name "*.cs" -o -name "*.swift" -o -name "*.kt" \) ! -path '*/node_modules/*' ! -path '*/vendor/*' ! -path '*/.git/*' ! -path '*/target/*' 2>/dev/null | wc -l`
- **Config files:** !`ls -la *.config.* .*.json .*.yaml .*.yml docker* Docker* Makefile CMakeLists.txt 2>/dev/null | head -20`
- **Has gh CLI:** !`which gh 2>/dev/null && echo "available" || echo "not available"`

## Analysis Protocol

### Phase 1: Tech Stack Identification

Identify and catalog:

1. **Language & Runtime** — primary language(s), version requirements, runtime (Node, Python, JVM, etc.)
2. **Frameworks** — web frameworks, UI frameworks, testing frameworks
3. **Key Dependencies** — categorize by purpose (HTTP, ORM, auth, queue, cache, logging, etc.)
4. **Infrastructure** — databases, message brokers, cloud services, container setup
5. **Build & Tooling** — bundler, compiler, linter, formatter, CI/CD pipeline

Consult `references/stack-detection.md` for detection patterns per ecosystem.

### Phase 2: Core Module Dissection

Identify the project's architectural layers:

1. **Entry Points** — main files, server bootstrap, CLI entrypoints
2. **Core Modules** — business logic, domain models, services
3. **Data Layer** — database models/schemas, repositories, migrations
4. **API Layer** — routes, controllers, resolvers, RPC definitions
5. **Integration Layer** — external service clients, SDKs, adapters

For each core module, note:
- Responsibility (single sentence)
- Key exported symbols
- Dependencies on other modules

### Phase 3: Data Flow Analysis

Trace how data moves through the system:

1. **Ingress** — how data enters (HTTP, CLI args, events, files, etc.)
2. **Processing** — transformation pipeline, validation, business rules
3. **Storage** — where and how data is persisted
4. **Egress** — how data leaves (API responses, events, notifications, files)

### Phase 4: Mermaid Diagram Generation

Generate diagrams adaptive to the project type. Select from:

| Project Type | Recommended Diagrams |
|---|---|
| Web API / Backend | Module dependency graph + Request flow sequence |
| Frontend / SPA | Component tree + State/data flow |
| CLI Tool | Command flow + Pipeline diagram |
| Library / SDK | Public API surface + Internal module graph |
| Monorepo | Package dependency graph + Service communication |
| Data Pipeline | DAG / Pipeline flow + Data transformation |
| Full-stack | All of the above, focused on most complex areas |

Consult `references/mermaid-patterns.md` for diagram templates.

General rules for Mermaid diagrams:
- Keep each diagram focused — one concept per diagram
- Use clear, short labels (not full file paths)
- Group related nodes with `subgraph`
- Limit to 15-20 nodes per diagram for readability
- Use appropriate diagram types: `graph TD` for dependencies, `sequenceDiagram` for flows, `classDiagram` for data models

### Phase 5: Report Assembly

Assemble the final report in the format defined below. Match the report language to the user's conversation language.

## Output Format

Generate a single Markdown report with this structure:

```markdown
# [Project Name] Deep Dive Report

## 1. Overview
> One-paragraph project summary

## 2. Tech Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| Language | ... | ... |
| Framework | ... | ... |
| ... | ... | ... |

## 3. Architecture

### Module Map

```mermaid
[adaptive diagram]
```

### Key Modules

| Module | Responsibility | Key Symbols |
|--------|---------------|-------------|
| ... | ... | ... |

## 4. Data Flow

### Flow Diagram

```mermaid
[adaptive diagram]
```

### Flow Description
[Concise text description of data movement]

## 5. Key Findings
- [Notable patterns, design decisions, potential concerns]
```

## Gist Publishing

After generating the report, check `gh` CLI availability from pre-fetched context.

If available:
1. Save the report to a temporary file with unique name:
   ```bash
   REPORT_FILE="/tmp/deep-dive-$(basename $(pwd))-$(date +%s).md"
   gh gist create "$REPORT_FILE" --desc "[ProjectName] Deep Dive Analysis"
   ```
2. Return the gist URL to the user

If not available, output the report directly in the conversation.

## Additional Resources

### Reference Files

- **`references/stack-detection.md`** — Detection patterns for identifying tech stacks across ecosystems
- **`references/mermaid-patterns.md`** — Reusable Mermaid diagram templates for common architectures
