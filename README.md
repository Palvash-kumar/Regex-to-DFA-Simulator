# Regex to DFA Simulator

> A comprehensive, interactive web application that visualizes the complete automata theory pipeline — from **Regular Expressions** to **Minimized DFA** — with step-by-step algorithm tracing, animated simulation, and PDF report export. Built for Theory of Computation education.

---

## Overview

This tool demonstrates the fundamental automata theory pipeline in a fully interactive environment:

```
Regular Expression → NFA (Thompson's Construction) → DFA (Subset Construction) → Minimized DFA (Hopcroft's Algorithm)
```

Students and educators can enter any regular expression and instantly observe how it transforms through each stage — complete with **interactive graph visualizations**, **transition tables**, **algorithm step logs**, and **animated string testing**.

---

## Features

### Core Pipeline

| Step | Algorithm | Output |
|------|-----------|--------|
| **1. Regex → NFA** | Thompson's Construction | NFA graph + transition table + construction step log |
| **2. NFA → DFA** | Subset Construction | DFA graph + transition table + ε-closure/move step log |
| **3. DFA → Min DFA** | Hopcroft's Partition Refinement | Minimized DFA graph + transition table + partition refinement log |
| **4. String Testing** | DFA Simulation | Accept/Reject verdict with full state trace + animated graph walkthrough |

### Supported Regex Operators

| Operator | Symbol | Example |
|----------|--------|---------|
| Union | `\|` | `a\|b` |
| Concatenation | implicit | `ab` |
| Kleene Star | `*` | `a*` |
| Parentheses | `()` | `(a\|b)*` |

### Step-by-Step Algorithm Visualization

Each stage of the pipeline includes a **scrollable step log** that records every operation performed by the algorithm:

- **Thompson's Construction**: logs each CHAR, CONCAT, UNION, and STAR fragment with state assignments
- **Subset Construction**: logs ε-closures, move operations, and new DFA state discoveries
- **Hopcroft's Minimization**: logs initial partitions, each split operation, and the final partition result

### Partition Visualization

After minimization, the final state partitions are displayed as styled cards — accept partitions are highlighted in green, making it easy to identify how states were merged.

### Animated String Simulation

Click the **▶ Animate** button to watch the minimized DFA process a string in real time:

- Each transition highlights the **active node and edge** on the graph
- The **simulation trace** builds incrementally, one step at a time
- The final state glows **green** (accepted) or **red** (rejected)
- The verdict banner appears after the animation completes

### PDF Report Export

Click **⬇ Export DFA** to generate a professional PDF document containing the complete conversion pipeline:

- Input regular expression
- NFA graph snapshot, transition table, and state information
- DFA graph snapshot, transition table with NFA state composition
- Minimized DFA graph snapshot, transition table, and partition details
- Reduction summary and auto-pagination for large automata

### Interactive Graph Visualization

- **Graph rendering** powered by [Cytoscape.js](https://js.cytoscape.org/) with dagre layout
- Directed left-to-right automata graphs
- **Blue borders** for start states, **green double borders** for accept states
- **Epsilon (ε) transitions** rendered as dashed orange edges for clear distinction
- Labeled edges with merged parallel transitions
- Pan and zoom support on all graphs

### Collapsible Sections

Each pipeline stage (NFA, DFA, MinDFA, Test) can be **collapsed or expanded** by clicking its header — keeping the interface clean when focusing on a specific step.

### Tooltips

Hover over the algorithm name in each section header to see a brief explanation of how the algorithm works — useful for quick reference during study.

### User Interface

- Premium dark theme with glassmorphism panels
- One-click example regex buttons
- Pipeline progress indicator with step completion tracking
- Transition tables with ε-column highlighting for NFA
- Input validation with clear error messages
- Fully responsive design for all screen sizes

---

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Edge, Safari)
- Internet connection (for CDN libraries on first load)

### Installation

1. **Clone or download** the project:
   ```
   git clone <repository-url>
   ```

2. **Open** `index.html` in your browser.

No build tools, no server, no package installation required.

### Usage

1. Enter a regular expression in the input box (e.g., `(a|b)*abb`)
2. Click **Generate Automata** or press Enter
3. Explore the NFA, DFA, and Minimized DFA graphs, tables, and algorithm step logs
4. Collapse/expand sections as needed by clicking the section headers
5. Enter a test string and click **Test String** for instant results, or **▶ Animate** for a step-by-step visual walkthrough
6. Click **⬇ Export DFA** to download a full PDF report of the conversion pipeline

---

## Project Structure

```
TOC/
├── index.html      # Single-page application with all UI sections
├── style.css       # Dark theme styling (Inter + JetBrains Mono fonts)
├── app.js          # Core logic: parser, algorithms, visualization, export
└── README.md       # Project documentation
```

### Architecture

```
app.js
├── Regex Parser              → Converts regex string to AST (with explicit concat insertion)
├── Thompson's Construction   → AST to NFA with step logging
├── Subset Construction       → NFA to DFA with ε-closure/move step logging
├── DFA Minimization          → Hopcroft partition refinement with partition history
├── String Testing            → Simulates DFA on input string
├── Cytoscape Renderer        → Graph visualization with ε-edge highlighting
├── Table Renderer            → HTML transition tables with ε-column styling
├── Step Log Renderer         → Algorithm step-by-step display
├── Partition Visualizer      → Final partition card display
├── Animated Simulation       → Step-by-step graph animation with trace sync
├── PDF Export                → Full pipeline report generation via jsPDF
└── Collapsible Sections      → Toggle visibility of each pipeline stage
```

---

## Example Inputs

| Regex | Description |
|-------|-------------|
| `(a\|b)*abb` | Strings over {a,b} ending in "abb" |
| `a*b*` | Zero or more a's followed by zero or more b's |
| `ab\|ba` | Exactly "ab" or "ba" |
| `(a\|b)a*` | One a or b, followed by zero or more a's |
| `(a\|b)*` | Any string over {a,b} |
| `a(b\|c)*d` | Starts with a, ends with d, b's and c's in between |

---

## Technology Stack

| Technology | Purpose |
|------------|---------|
| HTML5 | Page structure |
| CSS3 | Styling, glassmorphism, animations, responsive layout |
| JavaScript (ES6+) | Core algorithms, visualization, interactivity |
| [Cytoscape.js](https://js.cytoscape.org/) | Graph rendering and animation |
| [Dagre](https://github.com/dagrejs/dagre) | Directed graph layout engine |
| [jsPDF](https://github.com/parallax/jsPDF) | Client-side PDF report generation |
| [Inter](https://rsms.me/inter/) | UI typeface |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | Monospace typeface for code and tables |

---

## Concepts Covered

This simulator helps students understand:

- **Regular Expressions** — pattern syntax and operator precedence
- **NFA (Nondeterministic Finite Automaton)** — epsilon transitions, multiple paths
- **Thompson's Construction** — systematic regex-to-NFA conversion, fragment composition
- **Epsilon Closure** — computing reachable states through ε-transitions
- **Subset Construction** — determinization via ε-closure and move operations
- **DFA (Deterministic Finite Automaton)** — single-path deterministic execution
- **DFA Minimization** — equivalent state merging via Hopcroft's partition refinement
- **State Partitioning** — understanding how equivalent states are grouped
- **Language Acceptance** — how automata decide string membership

---

## Author

**Made by Palvash**

---

## License

This project is open source and available for educational use.
