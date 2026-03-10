// ============================================================
// Regex to Minimal DFA Simulator
// ============================================================

(() => {
  "use strict";

  // ----------------------------------------------------------
  // 1. REGEX PARSER  (Regex string → AST)
  // ----------------------------------------------------------
  // Grammar (precedence low→high):
  //   expr   = term ('|' term)*
  //   term   = factor factor*
  //   factor = atom ('*')*
  //   atom   = char | '(' expr ')'

  const EPSILON = "ε";

  function parseRegex(input) {
    let pos = 0;

    // Insert explicit concatenation operator '.'
    const processed = insertConcat(input);

    function peek() { return processed[pos]; }
    function advance() { return processed[pos++]; }

    function parseExpr() {
      let node = parseTerm();
      while (pos < processed.length && peek() === "|") {
        advance(); // consume '|'
        const right = parseTerm();
        node = { type: "union", left: node, right };
      }
      return node;
    }

    function parseTerm() {
      let node = parseFactor();
      while (pos < processed.length && peek() === ".") {
        advance(); // consume '.'
        const right = parseFactor();
        node = { type: "concat", left: node, right };
      }
      return node;
    }

    function parseFactor() {
      let node = parseAtom();
      while (pos < processed.length && peek() === "*") {
        advance(); // consume '*'
        node = { type: "star", child: node };
      }
      return node;
    }

    function parseAtom() {
      if (peek() === "(") {
        advance(); // consume '('
        const node = parseExpr();
        if (peek() !== ")") throw new Error("Missing closing parenthesis");
        advance(); // consume ')'
        return node;
      }
      const ch = advance();
      if (ch === undefined) throw new Error("Unexpected end of regex");
      return { type: "char", value: ch };
    }

    const ast = parseExpr();
    if (pos < processed.length) {
      throw new Error(`Unexpected character '${processed[pos]}' at position ${pos}`);
    }
    return ast;
  }

  function insertConcat(regex) {
    let result = "";
    for (let i = 0; i < regex.length; i++) {
      const c = regex[i];
      result += c;
      if (i + 1 < regex.length) {
        const next = regex[i + 1];
        // Insert '.' between: char-char, )-char, *-char, char-(, )-(, *-(  etc.
        if (needsConcat(c, next)) {
          result += ".";
        }
      }
    }
    return result;
  }

  function needsConcat(a, b) {
    const isLeftOperand  = (a !== "(" && a !== "|");
    const isRightOperand = (b !== ")" && b !== "|" && b !== "*");
    return isLeftOperand && isRightOperand;
  }

  // ----------------------------------------------------------
  // 2. THOMPSON'S CONSTRUCTION  (AST → NFA)
  // ----------------------------------------------------------

  let stateCounter = 0;
  function newState() { return stateCounter++; }

  // Returns { start, accept, transitions: [{from, to, symbol}] }
  function thompsonBuild(node) {
    switch (node.type) {
      case "char": {
        const s = newState(), a = newState();
        return { start: s, accept: a, transitions: [{ from: s, to: a, symbol: node.value }] };
      }
      case "concat": {
        const left  = thompsonBuild(node.left);
        const right = thompsonBuild(node.right);
        // merge left.accept → right.start via ε
        return {
          start: left.start,
          accept: right.accept,
          transitions: [
            ...left.transitions,
            ...right.transitions,
            { from: left.accept, to: right.start, symbol: EPSILON }
          ]
        };
      }
      case "union": {
        const s = newState(), a = newState();
        const left  = thompsonBuild(node.left);
        const right = thompsonBuild(node.right);
        return {
          start: s, accept: a,
          transitions: [
            ...left.transitions,
            ...right.transitions,
            { from: s, to: left.start,  symbol: EPSILON },
            { from: s, to: right.start, symbol: EPSILON },
            { from: left.accept,  to: a, symbol: EPSILON },
            { from: right.accept, to: a, symbol: EPSILON }
          ]
        };
      }
      case "star": {
        const s = newState(), a = newState();
        const inner = thompsonBuild(node.child);
        return {
          start: s, accept: a,
          transitions: [
            ...inner.transitions,
            { from: s, to: inner.start, symbol: EPSILON },
            { from: s, to: a, symbol: EPSILON },
            { from: inner.accept, to: inner.start, symbol: EPSILON },
            { from: inner.accept, to: a, symbol: EPSILON }
          ]
        };
      }
      default:
        throw new Error("Unknown AST node type: " + node.type);
    }
  }

  function buildNFA(regex) {
    stateCounter = 0;
    const ast = parseRegex(regex);
    const nfa = thompsonBuild(ast);

    // Collect all states
    const states = new Set();
    const alphabet = new Set();
    for (const t of nfa.transitions) {
      states.add(t.from);
      states.add(t.to);
      if (t.symbol !== EPSILON) alphabet.add(t.symbol);
    }
    states.add(nfa.start);
    states.add(nfa.accept);

    return {
      states: [...states].sort((a, b) => a - b),
      alphabet: [...alphabet].sort(),
      transitions: nfa.transitions,
      start: nfa.start,
      accept: nfa.accept
    };
  }

  // ----------------------------------------------------------
  // 3. SUBSET CONSTRUCTION  (NFA → DFA)
  // ----------------------------------------------------------

  function epsilonClosure(nfaTransitions, statesSet) {
    const stack = [...statesSet];
    const closure = new Set(statesSet);
    while (stack.length > 0) {
      const st = stack.pop();
      for (const t of nfaTransitions) {
        if (t.from === st && t.symbol === EPSILON && !closure.has(t.to)) {
          closure.add(t.to);
          stack.push(t.to);
        }
      }
    }
    return closure;
  }

  function move(nfaTransitions, statesSet, symbol) {
    const result = new Set();
    for (const st of statesSet) {
      for (const t of nfaTransitions) {
        if (t.from === st && t.symbol === symbol) {
          result.add(t.to);
        }
      }
    }
    return result;
  }

  function setKey(s) {
    return [...s].sort((a, b) => a - b).join(",");
  }

  function subsetConstruction(nfa) {
    const { alphabet, transitions: nfaTrans, start: nfaStart, accept: nfaAccept } = nfa;

    const startClosure = epsilonClosure(nfaTrans, new Set([nfaStart]));
    const startKey = setKey(startClosure);

    const dfaStates = new Map(); // key → id
    let idCounter = 0;
    dfaStates.set(startKey, idCounter++);

    const dfaTransitions = []; // {from, to, symbol}
    const dfaAcceptStates = new Set();
    const stateComposition = new Map(); // id → Set of NFA states

    stateComposition.set(0, startClosure);

    if (startClosure.has(nfaAccept)) {
      dfaAcceptStates.add(0);
    }

    const worklist = [startKey];

    while (worklist.length > 0) {
      const currentKey = worklist.pop();
      const currentId  = dfaStates.get(currentKey);
      const currentSet = stateComposition.get(currentId);

      for (const sym of alphabet) {
        const moved  = move(nfaTrans, currentSet, sym);
        if (moved.size === 0) continue;
        const closed = epsilonClosure(nfaTrans, moved);
        const key    = setKey(closed);

        let targetId;
        if (!dfaStates.has(key)) {
          targetId = idCounter++;
          dfaStates.set(key, targetId);
          stateComposition.set(targetId, closed);
          worklist.push(key);
          if (closed.has(nfaAccept)) {
            dfaAcceptStates.add(targetId);
          }
        } else {
          targetId = dfaStates.get(key);
        }

        dfaTransitions.push({ from: currentId, to: targetId, symbol: sym });
      }
    }

    const allIds = [];
    for (let i = 0; i < idCounter; i++) allIds.push(i);

    return {
      states: allIds,
      alphabet,
      transitions: dfaTransitions,
      start: 0,
      acceptStates: [...dfaAcceptStates],
      stateComposition // for display
    };
  }

  // ----------------------------------------------------------
  // 4. DFA MINIMIZATION  (Hopcroft-style partition refinement)
  // ----------------------------------------------------------

  function minimizeDFA(dfa) {
    const { states, alphabet, transitions, start, acceptStates } = dfa;

    // Build transition map: state → { symbol → targetState }
    const transMap = new Map();
    for (const s of states) transMap.set(s, {});
    for (const t of transitions) {
      transMap.get(t.from)[t.symbol] = t.to;
    }

    // Remove unreachable states
    const reachable = new Set();
    const rStack = [start];
    while (rStack.length > 0) {
      const s = rStack.pop();
      if (reachable.has(s)) continue;
      reachable.add(s);
      const tMap = transMap.get(s);
      for (const sym of alphabet) {
        if (tMap[sym] !== undefined && !reachable.has(tMap[sym])) {
          rStack.push(tMap[sym]);
        }
      }
    }

    const accSet = new Set(acceptStates);
    const reachableStates = states.filter(s => reachable.has(s));
    const reachableAccept = reachableStates.filter(s => accSet.has(s));
    const reachableNonAccept = reachableStates.filter(s => !accSet.has(s));

    // Initial partition
    let partitions = [];
    if (reachableNonAccept.length > 0) partitions.push(reachableNonAccept);
    if (reachableAccept.length > 0) partitions.push(reachableAccept);

    // stateToPartition index
    function buildPartitionMap() {
      const map = new Map();
      for (let i = 0; i < partitions.length; i++) {
        for (const s of partitions[i]) {
          map.set(s, i);
        }
      }
      return map;
    }

    let changed = true;
    while (changed) {
      changed = false;
      const pMap = buildPartitionMap();
      const newPartitions = [];

      for (const group of partitions) {
        // Split group
        const subgroups = new Map(); // signature → [states]
        for (const s of group) {
          let sig = "";
          for (const sym of alphabet) {
            const target = transMap.get(s)[sym];
            sig += (target !== undefined ? pMap.get(target) : -1) + ";";
          }
          if (!subgroups.has(sig)) subgroups.set(sig, []);
          subgroups.get(sig).push(s);
        }

        for (const sg of subgroups.values()) {
          newPartitions.push(sg);
        }

        if (subgroups.size > 1) changed = true;
      }

      partitions = newPartitions;
    }

    // Build minimized DFA
    const pMap = buildPartitionMap();
    const minStates = [];
    const minAccept = new Set();
    let minStart = 0;
    const minTransitions = [];

    for (let i = 0; i < partitions.length; i++) {
      minStates.push(i);
      // Accept?
      if (partitions[i].some(s => accSet.has(s))) {
        minAccept.add(i);
      }
      // Start?
      if (partitions[i].includes(start)) {
        minStart = i;
      }
    }

    const seenEdges = new Set();
    for (let i = 0; i < partitions.length; i++) {
      const representative = partitions[i][0];
      for (const sym of alphabet) {
        const target = transMap.get(representative)[sym];
        if (target !== undefined) {
          const targetPartition = pMap.get(target);
          const edgeKey = `${i}-${sym}-${targetPartition}`;
          if (!seenEdges.has(edgeKey)) {
            seenEdges.add(edgeKey);
            minTransitions.push({ from: i, to: targetPartition, symbol: sym });
          }
        }
      }
    }

    return {
      states: minStates,
      alphabet,
      transitions: minTransitions,
      start: minStart,
      acceptStates: [...minAccept],
      partitions // for display
    };
  }

  // ----------------------------------------------------------
  // 5. STRING TESTING
  // ----------------------------------------------------------

  function testString(dfa, str) {
    const { alphabet, transitions, start, acceptStates } = dfa;
    const transMap = new Map();
    for (const s of dfa.states) transMap.set(s, {});
    for (const t of transitions) {
      transMap.get(t.from)[t.symbol] = t.to;
    }

    let current = start;
    const path = [{ state: current, symbol: null }];

    for (const ch of str) {
      if (!alphabet.includes(ch)) {
        return { accepted: false, path, error: `Character '${ch}' not in alphabet {${alphabet.join(", ")}}` };
      }
      const next = transMap.get(current)?.[ch];
      if (next === undefined) {
        path.push({ state: null, symbol: ch });
        return { accepted: false, path, error: null };
      }
      current = next;
      path.push({ state: current, symbol: ch });
    }

    return { accepted: acceptStates.includes(current), path, error: null };
  }

  // ----------------------------------------------------------
  // 6. VISUALIZATION  (Cytoscape.js)
  // ----------------------------------------------------------

  function renderAutomaton(containerId, automaton, isNFA) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    const elements = [];
    const { states, transitions, start } = automaton;
    const acceptSet = new Set(isNFA ? [automaton.accept] : automaton.acceptStates);

    // Nodes
    for (const s of states) {
      const classes = [];
      if (s === start) classes.push("start");
      if (acceptSet.has(s)) classes.push("accept");
      elements.push({
        data: { id: "s" + s, label: "q" + s },
        classes: classes.join(" ")
      });
    }

    // Invisible start indicator node
    elements.push({
      data: { id: "__start__", label: "" },
      classes: "start-indicator"
    });
    elements.push({
      data: { id: "__start_edge__", source: "__start__", target: "s" + start, label: "" },
      classes: "start-edge"
    });

    // Merge parallel edges
    const edgeMap = new Map();
    for (const t of transitions) {
      const key = t.from + "->" + t.to;
      if (!edgeMap.has(key)) edgeMap.set(key, []);
      edgeMap.get(key).push(t.symbol);
    }

    for (const [key, symbols] of edgeMap) {
      const [from, to] = key.split("->");
      elements.push({
        data: {
          id: "e_" + key,
          source: "s" + from,
          target: "s" + to,
          label: symbols.join(", ")
        }
      });
    }

    const cy = cytoscape({
      container,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "background-color": "#1e2035",
            color: "#e2e8f0",
            "border-width": 2,
            "border-color": "#8b5cf6",
            width: 46,
            height: 46,
            "font-size": "13px",
            "font-weight": "600",
            "font-family": "Inter, system-ui, sans-serif"
          }
        },
        {
          selector: "node.start",
          style: {
            "background-color": "#1a2744",
            "border-color": "#60a5fa",
            "border-width": 3
          }
        },
        {
          selector: "node.accept",
          style: {
            "border-width": 5,
            "border-color": "#22c55e",
            "border-style": "double"
          }
        },
        {
          selector: "node.start.accept",
          style: {
            "background-color": "#1a2744",
            "border-color": "#22c55e",
            "border-width": 5,
            "border-style": "double"
          }
        },
        {
          selector: "node.start-indicator",
          style: {
            width: 1,
            height: 1,
            "background-opacity": 0,
            "border-width": 0,
            label: ""
          }
        },
        {
          selector: "edge",
          style: {
            label: "data(label)",
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "target-arrow-color": "#8b5cf6",
            "line-color": "#2d3352",
            width: 2,
            "font-size": "12px",
            color: "#fbbf24",
            "text-background-color": "#090b12",
            "text-background-opacity": 0.9,
            "text-background-padding": "3px",
            "font-weight": "600",
            "text-margin-y": -10,
            "loop-direction": "0deg",
            "loop-sweep": "-60deg"
          }
        },
        {
          selector: "edge.start-edge",
          style: {
            "line-color": "#60a5fa",
            "target-arrow-color": "#60a5fa",
            width: 2
          }
        },
        {
          selector: "node.highlight",
          style: {
            "background-color": "#7c3aed",
            "border-color": "#a78bfa"
          }
        }
      ],
      layout: {
        name: "dagre",
        rankDir: "LR",
        nodeSep: 50,
        rankSep: 80,
        edgeSep: 30,
        fit: true,
        padding: 30
      },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false
    });

    return cy;
  }

  // ----------------------------------------------------------
  // 7. TABLE RENDERING
  // ----------------------------------------------------------

  function renderNFATable(nfa) {
    const { states, alphabet, transitions, start, accept } = nfa;
    const symbols = [...alphabet, EPSILON];

    // Build map: state → { symbol → Set of target states }
    const tMap = new Map();
    for (const s of states) {
      const row = {};
      for (const sym of symbols) row[sym] = new Set();
      tMap.set(s, row);
    }
    for (const t of transitions) {
      tMap.get(t.from)[t.symbol].add(t.to);
    }

    let html = "<table><thead><tr><th>State</th>";
    for (const sym of symbols) html += `<th>${sym}</th>`;
    html += "</tr></thead><tbody>";

    for (const s of states) {
      const prefix = (s === start ? "→ " : "") + (s === accept ? "* " : "");
      html += `<tr><td>${prefix}q${s}</td>`;
      for (const sym of symbols) {
        const targets = tMap.get(s)[sym];
        html += `<td>${targets.size > 0 ? [...targets].map(t => "q" + t).join(", ") : "∅"}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    return html;
  }

  function renderDFATable(dfa, composition) {
    const { states, alphabet, transitions, start, acceptStates } = dfa;
    const accSet = new Set(acceptStates);

    const tMap = new Map();
    for (const s of states) {
      const row = {};
      for (const sym of alphabet) row[sym] = null;
      tMap.set(s, row);
    }
    for (const t of transitions) {
      tMap.get(t.from)[t.symbol] = t.to;
    }

    let html = "<table><thead><tr><th>State</th>";
    if (composition) html += "<th>NFA States</th>";
    for (const sym of alphabet) html += `<th>${sym}</th>`;
    html += "</tr></thead><tbody>";

    for (const s of states) {
      const prefix = (s === start ? "→ " : "") + (accSet.has(s) ? "* " : "");
      html += `<tr><td>${prefix}q${s}</td>`;
      if (composition) {
        const nfaStates = composition.get(s);
        html += `<td>{${[...nfaStates].sort((a, b) => a - b).map(x => "q" + x).join(", ")}}</td>`;
      }
      for (const sym of alphabet) {
        const target = tMap.get(s)[sym];
        html += `<td>${target !== null ? "q" + target : "∅"}</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    return html;
  }

  // ----------------------------------------------------------
  // 8. MAIN APP CONTROLLER
  // ----------------------------------------------------------

  let currentMinDfa = null;

  const regexInput   = document.getElementById("regexInput");
  const generateBtn  = document.getElementById("generateBtn");
  const errorMsg     = document.getElementById("errorMsg");
  const pipeline     = document.getElementById("pipeline");
  const nfaSection   = document.getElementById("nfaSection");
  const dfaSection   = document.getElementById("dfaSection");
  const minDfaSection = document.getElementById("minDfaSection");
  const testSection  = document.getElementById("testSection");
  const testStringEl = document.getElementById("testString");
  const testBtn      = document.getElementById("testBtn");
  const testResult   = document.getElementById("testResult");
  const simPath      = document.getElementById("simulationPath");

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove("hidden");
  }

  function hideError() {
    errorMsg.classList.add("hidden");
  }

  function hideResults() {
    pipeline.classList.add("hidden");
    nfaSection.classList.add("hidden");
    dfaSection.classList.add("hidden");
    minDfaSection.classList.add("hidden");
    testSection.classList.add("hidden");
    testResult.classList.add("hidden");
    simPath.classList.add("hidden");
    currentMinDfa = null;
  }

  function updatePipeline(step) {
    const steps = pipeline.querySelectorAll(".pipeline-step");
    const order = ["nfa", "dfa", "minDfa", "test"];
    const idx = order.indexOf(step);
    steps.forEach((el, i) => {
      el.classList.remove("active", "completed");
      if (i < idx) el.classList.add("completed");
      if (i === idx) el.classList.add("active");
    });
  }

  function validateRegex(regex) {
    if (!regex) return "Please enter a regular expression.";
    // Check balanced parentheses
    let depth = 0;
    for (const ch of regex) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (depth < 0) return "Unmatched closing parenthesis.";
    }
    if (depth !== 0) return "Unmatched opening parenthesis.";
    // Check for invalid characters
    for (const ch of regex) {
      if (!/[a-zA-Z0-9()|*]/.test(ch)) {
        return `Invalid character '${ch}'. Supported: letters, digits, |, *, (, )`;
      }
    }
    // Check for empty union operands
    if (/\|$|^\||(\|\|)/.test(regex)) {
      return "Invalid empty union operand.";
    }
    return null;
  }

  function runPipeline() {
    hideError();
    hideResults();

    const regex = regexInput.value.trim();
    const err = validateRegex(regex);
    if (err) { showError(err); return; }

    try {
      // Step 1: NFA
      const nfa = buildNFA(regex);
      pipeline.classList.remove("hidden");
      nfaSection.classList.remove("hidden");
      updatePipeline("nfa");

      document.getElementById("nfaTable").innerHTML = renderNFATable(nfa);
      document.getElementById("nfaStart").textContent  = "q" + nfa.start;
      document.getElementById("nfaAccept").textContent = "q" + nfa.accept;
      document.getElementById("nfaCount").textContent  = nfa.states.length;
      renderAutomaton("nfaGraph", nfa, true);

      // Step 2: DFA
      const dfa = subsetConstruction(nfa);
      dfaSection.classList.remove("hidden");
      updatePipeline("dfa");

      document.getElementById("dfaTable").innerHTML = renderDFATable(dfa, dfa.stateComposition);
      document.getElementById("dfaStart").textContent  = "q" + dfa.start;
      document.getElementById("dfaAccept").textContent = dfa.acceptStates.map(s => "q" + s).join(", ");
      document.getElementById("dfaCount").textContent  = dfa.states.length;
      renderAutomaton("dfaGraph", dfa, false);

      // Step 3: Minimized DFA
      const minDfa = minimizeDFA(dfa);
      minDfaSection.classList.remove("hidden");
      updatePipeline("minDfa");

      document.getElementById("minDfaTable").innerHTML = renderDFATable(minDfa, null);
      document.getElementById("minDfaStart").textContent  = "q" + minDfa.start;
      document.getElementById("minDfaAccept").textContent = minDfa.acceptStates.map(s => "q" + s).join(", ");
      document.getElementById("minDfaCount").textContent  = minDfa.states.length;

      const reduced = dfa.states.length - minDfa.states.length;
      const reductionEl = document.getElementById("reduction");
      if (reduced > 0) {
        reductionEl.textContent = `(Reduced by ${reduced} state${reduced > 1 ? "s" : ""}: ${dfa.states.length} → ${minDfa.states.length})`;
      } else {
        reductionEl.textContent = "(Already minimal)";
      }

      renderAutomaton("minDfaGraph", minDfa, false);

      // Show test section
      testSection.classList.remove("hidden");
      updatePipeline("test");
      currentMinDfa = minDfa;

    } catch (e) {
      showError("Error: " + e.message);
    }
  }

  function runTest() {
    if (!currentMinDfa) return;

    const str = testStringEl.value;  // allow empty string
    const result = testString(currentMinDfa, str);

    testResult.classList.remove("hidden", "accepted", "rejected");
    simPath.classList.remove("hidden");

    if (result.error) {
      testResult.classList.add("rejected");
      testResult.textContent = `REJECTED — ${result.error}`;
      simPath.innerHTML = "";
      return;
    }

    testResult.classList.add(result.accepted ? "accepted" : "rejected");
    testResult.textContent = result.accepted
      ? `✓ ACCEPTED — String "${str}" is in the language.`
      : `✗ REJECTED — String "${str}" is NOT in the language.`;

    // Build simulation path display
    let pathHtml = "<strong>Simulation Trace:</strong><br>";
    for (let i = 0; i < result.path.length; i++) {
      const step = result.path[i];
      if (i === 0) {
        pathHtml += `<span class="state-tag">q${step.state}</span>`;
      } else if (step.state !== null) {
        pathHtml += ` —<span class="step-highlight">${step.symbol}</span>→ <span class="state-tag">q${step.state}</span>`;
      } else {
        pathHtml += ` —<span class="step-highlight">${step.symbol}</span>→ <span class="state-tag reject-tag">dead</span>`;
      }
    }

    const finalState = result.path[result.path.length - 1].state;
    if (finalState !== null) {
      const tag = result.accepted ? "accept-tag" : "reject-tag";
      const label = result.accepted ? "ACCEPT" : "NOT ACCEPT";
      pathHtml += ` → <span class="state-tag ${tag}">${label}</span>`;
    }

    simPath.innerHTML = pathHtml;
  }

  // Event Listeners
  generateBtn.addEventListener("click", runPipeline);

  regexInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runPipeline();
  });

  testBtn.addEventListener("click", runTest);

  testStringEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runTest();
  });

  // Example buttons
  document.querySelectorAll(".btn-example").forEach((btn) => {
    btn.addEventListener("click", () => {
      regexInput.value = btn.dataset.regex;
      runPipeline();
    });
  });

})();
