# Mermaid Diagram Patterns

Reusable templates for generating architecture diagrams. Adapt based on project type.

## Module Dependency Graph (Most Common)

Use `graph TD` (top-down) for hierarchical dependencies, `graph LR` (left-right) for pipelines.

```mermaid
graph TD
    subgraph API["API Layer"]
        Routes[Routes/Controllers]
        Middleware[Middleware]
    end

    subgraph Core["Core/Business Logic"]
        Services[Services]
        Models[Domain Models]
    end

    subgraph Data["Data Layer"]
        Repos[Repositories]
        DB[(Database)]
    end

    Routes --> Middleware
    Middleware --> Services
    Services --> Models
    Services --> Repos
    Repos --> DB
```

## Request Flow Sequence (Web API)

```mermaid
sequenceDiagram
    participant C as Client
    participant R as Router
    participant M as Middleware
    participant S as Service
    participant D as Database

    C->>R: HTTP Request
    R->>M: Auth/Validation
    M->>S: Business Logic
    S->>D: Query/Mutation
    D-->>S: Result
    S-->>M: Response Data
    M-->>R: Formatted Response
    R-->>C: HTTP Response
```

## Component Tree (Frontend)

```mermaid
graph TD
    App[App]
    App --> Layout[Layout]
    App --> Router[Router]

    Layout --> Header[Header]
    Layout --> Sidebar[Sidebar]
    Layout --> Main[Main Content]

    Router --> Home[Home Page]
    Router --> Dashboard[Dashboard]
    Router --> Settings[Settings]

    Dashboard --> Charts[Charts]
    Dashboard --> Table[Data Table]
    Dashboard --> Filters[Filters]
```

## State / Data Flow (Frontend)

```mermaid
graph LR
    subgraph UI["UI Components"]
        Comp[Component]
    end

    subgraph State["State Management"]
        Store[Store/Context]
        Actions[Actions/Reducers]
    end

    subgraph API["API Layer"]
        Client[API Client]
        Cache[Cache]
    end

    Comp -->|dispatch| Actions
    Actions -->|update| Store
    Store -->|subscribe| Comp
    Actions -->|async| Client
    Client -->|response| Cache
    Cache -->|data| Store
```

## CLI Command Flow

```mermaid
graph TD
    Entry[CLI Entry]
    Entry --> Parser[Arg Parser]
    Parser --> Cmd1[Command A]
    Parser --> Cmd2[Command B]
    Parser --> Cmd3[Command C]

    Cmd1 --> Config[Load Config]
    Cmd2 --> Config
    Config --> Execute[Execute Logic]
    Execute --> Output[Format Output]
```

## Data Pipeline / ETL

```mermaid
graph LR
    subgraph Ingest["Ingestion"]
        S1[Source A]
        S2[Source B]
    end

    subgraph Process["Processing"]
        V[Validate]
        T[Transform]
        E[Enrich]
    end

    subgraph Store["Storage"]
        DB[(Database)]
        Cache[(Cache)]
    end

    S1 --> V
    S2 --> V
    V --> T
    T --> E
    E --> DB
    E --> Cache
```

## Service Communication (Microservices / Monorepo)

```mermaid
graph TD
    subgraph Gateway
        API[API Gateway]
    end

    subgraph Services
        Auth[Auth Service]
        User[User Service]
        Order[Order Service]
        Notify[Notification Service]
    end

    subgraph Infra
        DB[(Database)]
        Queue[Message Queue]
        Cache[(Cache)]
    end

    API --> Auth
    API --> User
    API --> Order
    Auth --> DB
    User --> DB
    Order --> DB
    Order --> Queue
    Queue --> Notify
    Auth --> Cache
```

## Class / Data Model Diagram

```mermaid
classDiagram
    class User {
        +id: string
        +email: string
        +name: string
        +role: Role
        +createdAt: Date
    }

    class Order {
        +id: string
        +userId: string
        +items: Item[]
        +status: Status
        +total: number
    }

    class Item {
        +id: string
        +name: string
        +price: number
        +quantity: number
    }

    User "1" --> "*" Order : places
    Order "1" --> "*" Item : contains
```

## Library Public API Surface

```mermaid
graph TD
    subgraph Public["Public API"]
        Main[main export]
        Types[Type exports]
        Utils[Utility exports]
    end

    subgraph Internal["Internal"]
        Core[Core Logic]
        Parser[Parser]
        Validator[Validator]
        Formatter[Formatter]
    end

    Main --> Core
    Main --> Utils
    Core --> Parser
    Core --> Validator
    Core --> Formatter
    Utils --> Formatter
```

## Tips for Effective Diagrams

1. **One concept per diagram** — avoid cramming everything into one graph
2. **Use subgraph for grouping** — makes layers visually clear
3. **15-20 nodes max** — beyond that, split into multiple diagrams
4. **Short labels** — use `Auth` not `AuthenticationService`, add detail in accompanying text
5. **Arrow labels for clarity** — `-->|"HTTP"|` when the relationship type matters
6. **Choose diagram type wisely:**
   - `graph TD/LR` — dependencies, architecture overview
   - `sequenceDiagram` — request flows, interactions over time
   - `classDiagram` — data models, entity relationships
   - `flowchart` — decision trees, command flows
   - `stateDiagram-v2` — state machines, lifecycle
7. **Color with style** — `style NodeA fill:#f9f,stroke:#333` for emphasis (use sparingly)
