# RoadDesignApp - Diagrams and Visuals

This document provides comprehensive visual representations of the RoadDesignApp architecture, module interactions, data flows, and user workflows using Mermaid diagrams.

## 1. System Architecture Diagram

The following diagram shows the complete system architecture of the RoadDesignApp, including all core and specialized components:

graph TB
    subgraph "Client Layer"
        Browser["Browser<br>React + Three.js SPA"]
        ClientLibs["Client-side Libraries<br>Three.js, MapLibre, WebGL"]
    end
    
    subgraph "API Layer"
        APIGateway["API Gateway<br>(NestJS)"]
        WebSocket["WebSocket Server<br>(Real-time updates)"]
    end
    
    subgraph "Core Services"
        AlignEngine["Alignment Engine<br>(Go)"]
        ModelService["3D Model Service<br>(Rust/WASM)"]
        TerrainService["Terrain Service<br>(GDAL/Python)"]
        CostEstimator["Cost Estimator<br>(Python)"]
    end
    
    subgraph "Advanced Modules"
        JunctionEngine["Junction Engine<br>(Go)"]
        SignageEngine["Signage & Marking<br>(Go)"]
        DrainageService["Drainage Suite<br>(Python/Rust)"]
        GradingEngine["Terrain Grading<br>(C++/Go)"]
    end
    
    subgraph "Data Storage"
        PostgreSQL["PostgreSQL + PostGIS<br>(Spatial Database)"]
        MinIO["MinIO/S3<br>(Object Storage)"]
        Redis["Redis<br>(Cache & Job Queue)"]
    end
    
    subgraph "External Systems"
        MapTiles["Map Tile Services<br>(OSM/MapBox)"]
        Auth["Authentication<br>(Keycloak)"]
    end
    
    Browser --> APIGateway
    Browser --> WebSocket
    Browser --> ClientLibs
    ClientLibs --> Browser
    
    APIGateway --> AlignEngine
    APIGateway --> ModelService
    APIGateway --> TerrainService
    APIGateway --> CostEstimator
    APIGateway --> JunctionEngine
    APIGateway --> SignageEngine
    APIGateway --> DrainageService
    APIGateway --> GradingEngine
    
    AlignEngine --> PostgreSQL
    ModelService --> MinIO
    TerrainService --> MinIO
    JunctionEngine --> PostgreSQL
    SignageEngine --> PostgreSQL
    DrainageService --> PostgreSQL
    GradingEngine --> MinIO
    
    APIGateway --> Redis
    WebSocket --> Redis
    
    Browser --> MapTiles
    APIGateway --> Auth
    
    classDef primary fill:#4672b4,color:white,stroke:#333,stroke-width:1px
    classDef secondary fill:#47956f,color:white,stroke:#333,stroke-width:1px
    classDef tertiary fill:#de953e,color:white,stroke:#333,stroke-width:1px
    classDef quaternary fill:#8b251e,color:white,stroke:#333,stroke-width:1px
    
    class Browser,ClientLibs primary
    class APIGateway,WebSocket secondary
    class AlignEngine,ModelService,TerrainService,CostEstimator secondary
    class JunctionEngine,SignageEngine,DrainageService,GradingEngine tertiary
    class PostgreSQL,MinIO,Redis quaternary
    class MapTiles,Auth quaternary

## 2. Module Interaction Flowchart

This diagram illustrates how the different modules interact with each other during the road design process:

flowchart TD
    subgraph "Core Modules"
        Align["Alignment Design"]
        Vertical["Vertical Profile"]
        Corridor["3D Corridor Model"]
        Cost["Cost Estimation"]
    end
    
    subgraph "Advanced Modules"
        Junction["Junction & Intersection"]
        Signage["Traffic Signage & Marking"]
        Drainage["Drainage System"]
        Grading["Terrain Grading"]
    end
    
    Align -->|"Centerline<br>Geometry"| Junction
    Align -->|"Horizontal<br>Alignment"| Vertical
    Vertical -->|"3D Alignment"| Corridor
    Align -->|"Alignment<br>Parameters"| Signage
    
    Junction -->|"Junction<br>Geometry"| Corridor
    Junction -->|"Control<br>Points"| Signage
    
    Corridor -->|"Pavement<br>Edges"| Drainage
    Corridor -->|"Corridor<br>Mesh"| Grading
    
    Vertical -->|"Profile<br>Grade"| Drainage
    Drainage -->|"Drainage<br>Features"| Grading
    
    Grading -->|"Modified<br>Terrain"| Corridor
    Grading -->|"Cut/Fill<br>Volumes"| Cost
    
    Corridor -->|"Material<br>Quantities"| Cost
    Drainage -->|"Drainage<br>Quantities"| Cost
    Signage -->|"Sign/Mark<br>Inventory"| Cost
    Junction -->|"Special<br>Features"| Cost
    
    classDef primary fill:#4672b4,color:white,stroke:#333,stroke-width:1px
    classDef secondary fill:#47956f,color:white,stroke:#333,stroke-width:1px
    
    class Align,Vertical,Corridor,Cost primary
    class Junction,Signage,Drainage,Grading secondary

## 3. Data Flow Diagram

This diagram shows how information flows between different components of the system:

flowchart LR
    subgraph "User Inputs"
        UI_Align["Alignment<br>Parameters"]
        UI_Profile["Profile<br>Parameters"]
        UI_Template["Cross-Section<br>Templates"]
        UI_Junction["Junction<br>Parameters"]
        UI_Terrain["Terrain<br>Modifications"]
    end
    
    subgraph "Processing"
        Proc_Align["Alignment<br>Calculation"]
        Proc_Profile["Profile<br>Generation"]
        Proc_3D["3D Model<br>Generation"]
        Proc_Junction["Junction<br>Design"]
        Proc_Drainage["Drainage<br>Analysis"]
        Proc_Grading["Cut/Fill<br>Optimization"]
        Proc_Cost["Cost<br>Calculation"]
    end
    
    subgraph "Data Stores"
        DB_Project["Project<br>Database"]
        DB_Alignment["Alignment<br>Data"]
        DB_Surface["Surface<br>Models"]
        DB_Assets["Asset<br>Library"]
        DB_Cost["Cost<br>Database"]
    end
    
    subgraph "Outputs"
        Out_3D["3D<br>Visualization"]
        Out_Plans["2D Plan<br>Sheets"]
        Out_Reports["Engineering<br>Reports"]
        Out_Cost["Cost<br>Estimates"]
        Out_Export["File<br>Exports"]
    end
    
    UI_Align --> Proc_Align
    UI_Profile --> Proc_Profile
    UI_Template --> Proc_3D
    UI_Junction --> Proc_Junction
    UI_Terrain --> Proc_Grading
    
    Proc_Align --> DB_Alignment
    Proc_Profile --> DB_Alignment
    DB_Alignment --> Proc_3D
    DB_Alignment --> Proc_Junction
    DB_Alignment --> Proc_Drainage
    
    DB_Surface --> Proc_3D
    DB_Surface --> Proc_Drainage
    DB_Surface --> Proc_Grading
    
    Proc_Grading --> DB_Surface
    
    DB_Assets --> Proc_3D
    DB_Assets --> Proc_Junction
    
    Proc_3D --> Out_3D
    Proc_Align --> Out_Plans
    Proc_Profile --> Out_Plans
    Proc_Junction --> Out_Plans
    Proc_Drainage --> Out_Plans
    
    Proc_3D --> Out_Export
    Proc_Drainage --> Out_Reports
    Proc_Grading --> Out_Reports
    
    DB_Alignment --> Proc_Cost
    DB_Surface --> Proc_Cost
    Proc_3D --> Proc_Cost
    Proc_Junction --> Proc_Cost
    Proc_Drainage --> Proc_Cost
    Proc_Grading --> Proc_Cost
    
    Proc_Cost --> DB_Cost
    DB_Cost --> Out_Cost
    
    DB_Project --> DB_Alignment
    DB_Project --> DB_Surface
    DB_Project --> DB_Cost
    
    classDef input fill:#de953e,color:white,stroke:#333,stroke-width:1px
    classDef process fill:#47956f,color:white,stroke:#333,stroke-width:1px
    classDef storage fill:#4672b4,color:white,stroke:#333,stroke-width:1px
    classDef output fill:#8b251e,color:white,stroke:#333,stroke-width:1px
    
    class UI_Align,UI_Profile,UI_Template,UI_Junction,UI_Terrain input
    class Proc_Align,Proc_Profile,Proc_3D,Proc_Junction,Proc_Drainage,Proc_Grading,Proc_Cost process
    class DB_Project,DB_Alignment,DB_Surface,DB_Assets,DB_Cost storage
    class Out_3D,Out_Plans,Out_Reports,Out_Cost,Out_Export output

## 4. User Workflow Diagram

This diagram illustrates the typical user workflow for designing a road from start to finish:

flowchart TD
    Start([Start]) --> CreateProject["Create Project"]
    CreateProject --> ImportTerrain["Import Terrain Data"]
    ImportTerrain --> DesignAlignment["Design Horizontal Alignment<br>• Tangents<br>• Curves<br>• Spirals"]
    
    DesignAlignment --> ValidateAlignment{"Validate<br>AASHTO<br>Compliance"}
    ValidateAlignment -->|"No"| AdjustAlignment["Adjust Alignment"]
    AdjustAlignment --> ValidateAlignment
    
    ValidateAlignment -->|"Yes"| DesignProfile["Design Vertical Profile<br>• Grades<br>• Vertical Curves"]
    DesignProfile --> ApplyCrossSection["Apply Cross-Section<br>Templates"]
    
    ApplyCrossSection --> Generate3D["Generate 3D<br>Corridor Model"]
    
    Generate3D --> AddJunctions["Design Junctions<br>& Intersections"]
    AddJunctions --> DesignDrainage["Design Drainage<br>System"]
    DesignDrainage --> OptimizeGrading["Optimize Terrain<br>Grading"]
    
    OptimizeGrading --> AddSignage["Add Traffic Signs<br>& Markings"]
    
    AddSignage --> RunValidation["Run Comprehensive<br>Validation"]
    RunValidation --> ValidationPass{"All Rules<br>Pass?"}
    ValidationPass -->|"No"| MakeAdjustments["Make Necessary<br>Adjustments"]
    MakeAdjustments --> RunValidation
    
    ValidationPass -->|"Yes"| GenerateCost["Generate Cost<br>Estimate"]
    GenerateCost --> ExportFiles["Export Files<br>• IFC<br>• LandXML<br>• CAD"]
    
    ExportFiles --> End([End])
    
    classDef start fill:#47956f,color:white,stroke:#333,stroke-width:1px
    classDef process fill:#4672b4,color:white,stroke:#333,stroke-width:1px
    classDef decision fill:#de953e,color:white,stroke:#333,stroke-width:1px
    classDef end fill:#8b251e,color:white,stroke:#333,stroke-width:1px
    
    class Start,End start
    class CreateProject,ImportTerrain,DesignAlignment,DesignProfile,ApplyCrossSection,Generate3D,AddJunctions,DesignDrainage,OptimizeGrading,AddSignage,RunValidation,MakeAdjustments,GenerateCost,ExportFiles process
    class ValidateAlignment,ValidationPass decision

## 5. Detailed Drainage System Flow

This diagram shows the detailed workflow for the drainage system design module:

flowchart TD
    Start([Start]) --> DefineWatershed["Define Watershed<br>Catchments"]
    DefineWatershed --> SetupRainfall["Setup Rainfall<br>Parameters"]
    SetupRainfall --> CalculateRunoff["Calculate Runoff<br>• Rational Method<br>• SCS Method"]
    
    CalculateRunoff --> PlaceDrainageElements["Place Drainage Elements<br>• Inlets<br>• Pipes<br>• Culverts"]
    PlaceDrainageElements --> SizeElements["Size Drainage<br>Elements"]
    
    SizeElements --> RunSimulation["Run Flow<br>Simulation"]
    RunSimulation --> CheckCapacity{"Adequate<br>Capacity?"}
    
    CheckCapacity -->|"No"| AdjustElements["Adjust Element<br>Size/Position"]
    AdjustElements --> SizeElements
    
    CheckCapacity -->|"Yes"| GenerateProfile["Generate Hydraulic<br>Grade Line Profile"]
    GenerateProfile --> ExportResults["Export Results to<br>Grading & Cost"]
    
    ExportResults --> End([End])
    
    classDef start fill:#47956f,color:white,stroke:#333,stroke-width:1px
    classDef process fill:#4672b4,color:white,stroke:#333,stroke-width:1px
    classDef decision fill:#de953e,color:white,stroke:#333,stroke-width:1px
    classDef end fill:#8b251e,color:white,stroke:#333,stroke-width:1px
    
    class Start,End start
    class DefineWatershed,SetupRainfall,CalculateRunoff,PlaceDrainageElements,SizeElements,RunSimulation,AdjustElements,GenerateProfile,ExportResults process
    class CheckCapacity decision

## 6. Technology Stack Diagram

This diagram illustrates the technology stack used in the RoadDesignApp:

flowchart TB
    subgraph "Frontend"
        React["React + TypeScript"]
        ThreeJS["Three.js<br>WebGL"]
        MapLibre["MapLibre GL"]
        ChakraUI["Chakra UI"]
    end
    
    subgraph "API Layer"
        NestJS["NestJS"]
        GraphQL["GraphQL"]
        REST["REST API"]
        WebSockets["WebSockets"]
    end
    
    subgraph "Backend Services"
        Go["Go<br>• Alignment Engine<br>• Junction Engine<br>• Signage Engine"]
        Rust["Rust/WASM<br>• 3D Model Service<br>• Flow Simulation"]
        Python["Python<br>• Terrain Service<br>• Cost Estimator<br>• Drainage Analysis"]
        CPP["C++<br>• Grading Engine"]
    end
    
    subgraph "Data Storage"
        Postgres["PostgreSQL"]
        PostGIS["PostGIS"]
        Redis["Redis"]
        MinIO["MinIO/S3"]
    end
    
    subgraph "DevOps"
        Docker["Docker"]
        K8s["Kubernetes"]
        CI["GitHub Actions"]
        Monitoring["Prometheus/Grafana"]
    end
    
    React --> ThreeJS
    React --> MapLibre
    React --> ChakraUI
    
    React --> NestJS
    React --> WebSockets
    React --> GraphQL
    
    NestJS --> REST
    NestJS --> GraphQL
    NestJS --> WebSockets
    
    REST --> Go
    REST --> Rust
    REST --> Python
    REST --> CPP
    
    Go --> Postgres
    Rust --> MinIO
    Python --> Postgres
    Python --> MinIO
    CPP --> MinIO
    
    Postgres --> PostGIS
    
    NestJS --> Redis
    
    Docker --> K8s
    K8s --> Monitoring
    CI --> Docker
    
    classDef frontend fill:#4672b4,color:white,stroke:#333,stroke-width:1px
    classDef api fill:#47956f,color:white,stroke:#333,stroke-width:1px
    classDef backend fill:#de953e,color:white,stroke:#333,stroke-width:1px
    classDef storage fill:#8b251e,color:white,stroke:#333,stroke-width:1px
    classDef devops fill:#8b251e,color:white,stroke:#333,stroke-width:1px
    
    class React,ThreeJS,MapLibre,ChakraUI frontend
    class NestJS,GraphQL,REST,WebSockets api
    class Go,Rust,Python,CPP backend
    class Postgres,PostGIS,Redis,MinIO storage
    class Docker,K8s,CI,Monitoring devops
