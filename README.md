# Regex to DFA Simulator

> An interactive web application that visualizes the complete pipeline from **Regular Expressions** to **Minimized DFA**, built for Theory of Computation education.

---

## Overview

This tool demonstrates the fundamental automata theory pipeline step by step:

```
Regular Expression → NFA (Thompson's Construction) → DFA (Subset Construction) → Minimized DFA
```

Students and educators can enter any regular expression and instantly see how it transforms through each stage — complete with **interactive graph visualizations** and **transition tables**.

---

## Features

### Core Pipeline

| Step | Algorithm | Output |
|------|-----------|--------|
| **1. Regex → NFA** | Thompson's Construction | NFA graph + transition table (with ε-transitions) |
| **2. NFA → DFA** | Subset Construction | DFA graph + transition table (with NFA state composition) |
| **3. DFA → Min DFA** | Hopcroft's Partition Refinement | Minimized DFA graph + transition table |
| **4. String Testing** | DFA Simulation | Accept/Reject result with full state trace |

### Supported Regex Operators

| Operator | Symbol | Example |
|----------|--------|---------|
| Union | `\|` | `a\|b` |
| Concatenation | implicit | `ab` |
| Kleene Star | `*` | `a*` |
| Parentheses | `()` | `(a\|b)*` |

### Interactive Visualization

- **Graph rendering** powered by [Cytoscape.js](https://js.cytoscape.org/) with dagre layout
- Directed left-to-right automata graphs
- **Blue borders** for start states
- **Green double borders** for accept states
- **Labeled edges** with merged parallel transitions
- Pan & zoom support on all graphs

### User Interface

- Clean dark theme with professional styling
- One-click example regex buttons
- Pipeline progress indicator
- Transition tables for every stage
- Simulation trace showing state-by-state path
- Input validation with clear error messages
- Fully responsive design

---

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Edge, Safari)
- Internet connection (for CDN libraries)

### Installation

1. **Clone or download** the project:
   ```
   git clone https://github.com/Palvash-kumar/Regex-to-DFA-Simulator.git
   ```

2. **Open** `index.html` in your browser.

That's it — no build tools, no server, no dependencies to install.

### Usage

1. Enter a regular expression in the input box (e.g., `(a|b)*abb`)
2. Click **Generate Automata** or press Enter
3. View the NFA, DFA, and Minimized DFA visualizations
4. Scroll to the **String Testing** section
5. Enter a test string and click **Test String** to see if it's accepted or rejected

---

## Project Structure

```
TOC/
├── index.html      # Main HTML page with all UI sections
├── style.css       # Dark theme styling (Inter + JetBrains Mono fonts)
├── app.js          # Core logic: parser, algorithms, visualization
└── README.md       # Project documentation
```

### Architecture

```
app.js
├── Regex Parser         → Converts regex string to AST (with explicit concat insertion)
├── Thompson's Builder   → AST to NFA (epsilon transitions)
├── Subset Construction  → NFA to DFA (epsilon-closure + move)
├── DFA Minimizer        → Hopcroft partition refinement
├── String Tester        → Simulates DFA on input string
├── Cytoscape Renderer   → Graph visualization for each automaton
└── Table Renderer       → HTML transition tables
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
| CSS3 | Styling & responsive layout |
| JavaScript (ES6+) | Core algorithms & interactivity |
| [Cytoscape.js](https://js.cytoscape.org/) | Graph visualization |
| [Dagre](https://github.com/dagrejs/dagre) | Directed graph layout engine |
| [Inter](https://rsms.me/inter/) | UI typeface |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | Monospace typeface |

---

## Concepts Covered

This simulator helps students understand:

- **Regular Expressions** — pattern syntax and operator precedence
- **NFA (Nondeterministic Finite Automaton)** — epsilon transitions, multiple paths
- **Thompson's Construction** — systematic regex-to-NFA conversion
- **Subset Construction** — determinization via epsilon-closure
- **DFA (Deterministic Finite Automaton)** — single-path execution
- **DFA Minimization** — equivalent state merging via partition refinement
- **Language Acceptance** — how automata decide string membership

---

## Author

**Made by Palvash**

---

## License

This project is open source and available for educational use.
