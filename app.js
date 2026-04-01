// ============================================================
// Regex to Minimal DFA Simulator
// ============================================================

(() => {
  "use strict";

  const EPSILON = "\u03b5";

  // ----------------------------------------------------------
  // 1. REGEX PARSER  (Regex string -> AST)
  // ----------------------------------------------------------

  function parseRegex(input) {
    let pos = 0;
    const processed = insertConcat(input);

    function peek() { return processed[pos]; }
    function advance() { return processed[pos++]; }

    function parseExpr() {
      let node = parseTerm();
      while (pos < processed.length && peek() === "|") {
        advance();
        const right = parseTerm();
        node = { type: "union", left: node, right };
      }
      return node;
    }

    function parseTerm() {
      let node = parseFactor();
      while (pos < processed.length && peek() === ".") {
        advance();
        const right = parseFactor();
        node = { type: "concat", left: node, right };
      }
      return node;
    }

    function parseFactor() {
      let node = parseAtom();
      while (pos < processed.length && peek() === "*") {
        advance();
        node = { type: "star", child: node };
      }
      return node;
    }

    function parseAtom() {
      if (peek() === "(") {
        advance();
        const node = parseExpr();
        if (peek() !== ")") throw new Error("Missing closing parenthesis");
        advance();
        return node;
      }
      const ch = advance();
      if (ch === undefined) throw new Error("Unexpected end of regex");
      return { type: "char", value: ch };
    }

    const ast = parseExpr();
    if (pos < processed.length) {
      throw new Error("Unexpected character '" + processed[pos] + "' at position " + pos);
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
        if (needsConcat(c, next)) result += ".";
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
  // 2. THOMPSON'S CONSTRUCTION  (AST -> NFA) with step logging
  // ----------------------------------------------------------

  let stateCounter = 0;
  function newState() { return stateCounter++; }

  let thompsonLog = [];

  function thompsonBuild(node) {
    switch (node.type) {
      case "char": {
        const s = newState(), a = newState();
        thompsonLog.push({
          tag: "thompson",
          text: "CHAR '" + node.value + "': created q" + s + " --" + node.value + "--> q" + a
        });
        return { start: s, accept: a, transitions: [{ from: s, to: a, symbol: node.value }] };
      }
      case "concat": {
        const left  = thompsonBuild(node.left);
        const right = thompsonBuild(node.right);
        thompsonLog.push({
          tag: "thompson",
          text: "CONCAT: merged q" + left.accept + " --\u03b5--> q" + right.start + " (start=q" + left.start + ", accept=q" + right.accept + ")"
        });
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
        thompsonLog.push({
          tag: "thompson",
          text: "UNION: new start q" + s + " branches to q" + left.start + " and q" + right.start + ", both merge to q" + a
        });
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
        thompsonLog.push({
          tag: "thompson",
          text: "STAR: new start q" + s + " -> q" + inner.start + ", loop q" + inner.accept + " -> q" + inner.start + ", skip q" + s + " -> q" + a
        });
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
    thompsonLog = [];
    const ast = parseRegex(regex);
    const nfa = thompsonBuild(ast);

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
  // 3. SUBSET CONSTRUCTION  (NFA -> DFA) with step logging
  // ----------------------------------------------------------

  let subsetLog = [];

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
    subsetLog = [];
    const { alphabet, transitions: nfaTrans, start: nfaStart, accept: nfaAccept } = nfa;

    const startClosure = epsilonClosure(nfaTrans, new Set([nfaStart]));
    const startKey = setKey(startClosure);

    subsetLog.push({
      tag: "closure",
      text: "\u03b5-closure({q" + nfaStart + "}) = {" + [...startClosure].sort((a,b)=>a-b).map(s=>"q"+s).join(", ") + "} \u2192 DFA state q0"
    });

    const dfaStates = new Map();
    let idCounter = 0;
    dfaStates.set(startKey, idCounter++);

    const dfaTransitions = [];
    const dfaAcceptStates = new Set();
    const stateComposition = new Map();

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
          subsetLog.push({
            tag: "state",
            text: "New DFA state q" + targetId + " = \u03b5-closure(move(q" + currentId + ", '" + sym + "')) = {" + [...closed].sort((a,b)=>a-b).map(s=>"q"+s).join(", ") + "}"
          });
        } else {
          targetId = dfaStates.get(key);
        }

        subsetLog.push({
          tag: "move",
          text: "\u03b4(q" + currentId + ", '" + sym + "') = q" + targetId
        });

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
      stateComposition
    };
  }

  // ----------------------------------------------------------
  // 4. DFA MINIMIZATION  (Hopcroft-style) with step logging
  // ----------------------------------------------------------

  let partitionLog = [];
  let partitionHistory = [];

  function minimizeDFA(dfa) {
    partitionLog = [];
    partitionHistory = [];
    const { states, alphabet, transitions, start, acceptStates } = dfa;

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

    let partitions = [];
    if (reachableNonAccept.length > 0) partitions.push(reachableNonAccept);
    if (reachableAccept.length > 0) partitions.push(reachableAccept);

    partitionLog.push({
      tag: "partition",
      text: "Initial partition: " + partitions.map((g, i) => "P" + i + "={" + g.map(s=>"q"+s).join(",") + "}").join("  ")
    });
    partitionHistory.push(partitions.map(g => [...g]));

    function buildPartitionMap() {
      const map = new Map();
      for (let i = 0; i < partitions.length; i++) {
        for (const s of partitions[i]) {
          map.set(s, i);
        }
      }
      return map;
    }

    let iteration = 0;
    let changed = true;
    while (changed) {
      changed = false;
      iteration++;
      const pMap = buildPartitionMap();
      const newPartitions = [];

      for (const group of partitions) {
        const subgroups = new Map();
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

        if (subgroups.size > 1) {
          changed = true;
          partitionLog.push({
            tag: "split",
            text: "Iteration " + iteration + ": split {" + group.map(s=>"q"+s).join(",") + "} into " +
              [...subgroups.values()].map(sg => "{" + sg.map(s=>"q"+s).join(",") + "}").join(" and ")
          });
        }
      }

      partitions = newPartitions;
      partitionHistory.push(partitions.map(g => [...g]));
    }

    partitionLog.push({
      tag: "partition",
      text: "Final partition (" + partitions.length + " groups): " + partitions.map((g, i) => "P" + i + "={" + g.map(s=>"q"+s).join(",") + "}").join("  ")
    });

    // Build minimized DFA
    const pMap = buildPartitionMap();
    const minStates = [];
    const minAccept = new Set();
    let minStart = 0;
    const minTransitions = [];

    for (let i = 0; i < partitions.length; i++) {
      minStates.push(i);
      if (partitions[i].some(s => accSet.has(s))) {
        minAccept.add(i);
      }
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
          const edgeKey = i + "-" + sym + "-" + targetPartition;
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
      partitions
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
        return { accepted: false, path, error: "Character '" + ch + "' not in alphabet {" + alphabet.join(", ") + "}" };
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
  // 6. VISUALIZATION  (Cytoscape.js) with epsilon highlighting
  // ----------------------------------------------------------

  function renderAutomaton(containerId, automaton, isNFA) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    const elements = [];
    const { states, transitions, start } = automaton;
    const acceptSet = new Set(isNFA ? [automaton.accept] : automaton.acceptStates);

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
      const hasEpsilon = symbols.includes(EPSILON);
      const edgeClasses = hasEpsilon ? "epsilon-edge" : "";
      elements.push({
        data: {
          id: "e_" + key,
          source: "s" + from,
          target: "s" + to,
          label: symbols.join(", ")
        },
        classes: edgeClasses
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
          selector: "edge.epsilon-edge",
          style: {
            "line-color": "#f59e0b",
            "line-style": "dashed",
            "target-arrow-color": "#f59e0b",
            width: 1.5,
            color: "#fbbf24"
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
          selector: "node.anim-active",
          style: {
            "background-color": "#fbbf24",
            "border-color": "#fbbf24",
            color: "#0b0d14",
            "border-width": 4
          }
        },
        {
          selector: "edge.anim-active",
          style: {
            "line-color": "#fbbf24",
            "target-arrow-color": "#fbbf24",
            width: 4
          }
        },
        {
          selector: "node.anim-accept",
          style: {
            "background-color": "#22c55e",
            "border-color": "#22c55e",
            color: "#fff",
            "border-width": 4
          }
        },
        {
          selector: "node.anim-reject",
          style: {
            "background-color": "#ef4444",
            "border-color": "#ef4444",
            color: "#fff",
            "border-width": 4
          }
        },
        {
          selector: "node.anim-visited",
          style: {
            "background-color": "rgba(139, 92, 246, 0.35)",
            "border-color": "rgba(139, 92, 246, 0.5)",
            color: "#a78bfa",
            "border-width": 2.5
          }
        },
        {
          selector: "edge.anim-visited",
          style: {
            "line-color": "rgba(139, 92, 246, 0.3)",
            "target-arrow-color": "rgba(139, 92, 246, 0.3)",
            width: 2
          }
        },
        {
          selector: "node.anim-pulse",
          style: {
            "background-color": "#fbbf24",
            "border-color": "#f59e0b",
            color: "#0b0d14",
            "border-width": 5,
            width: 54,
            height: 54
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
      boxSelectionEnabled: false,
      wheelSensitivity: 0.3,
      minZoom: 0.3,
      maxZoom: 3
    });

    return cy;
  }

  // ----------------------------------------------------------
  // 7. TABLE RENDERING  (with epsilon column highlight)
  // ----------------------------------------------------------

  function renderNFATable(nfa) {
    const { states, alphabet, transitions, start, accept } = nfa;
    const symbols = [...alphabet, EPSILON];

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
    for (const sym of symbols) {
      const isEps = sym === EPSILON;
      html += "<th" + (isEps ? ' class="epsilon-col"' : "") + ">" + sym + "</th>";
    }
    html += "</tr></thead><tbody>";

    for (const s of states) {
      const prefix = (s === start ? "\u2192 " : "") + (s === accept ? "* " : "");
      html += "<tr><td>" + prefix + "q" + s + "</td>";
      for (const sym of symbols) {
        const isEps = sym === EPSILON;
        const targets = tMap.get(s)[sym];
        html += "<td" + (isEps ? ' class="epsilon-col"' : "") + ">" +
          (targets.size > 0 ? [...targets].map(t => "q" + t).join(", ") : "\u2205") + "</td>";
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
    for (const sym of alphabet) html += "<th>" + sym + "</th>";
    html += "</tr></thead><tbody>";

    for (const s of states) {
      const prefix = (s === start ? "\u2192 " : "") + (accSet.has(s) ? "* " : "");
      html += "<tr><td>" + prefix + "q" + s + "</td>";
      if (composition) {
        const nfaStates = composition.get(s);
        html += "<td>{" + [...nfaStates].sort((a, b) => a - b).map(x => "q" + x).join(", ") + "}</td>";
      }
      for (const sym of alphabet) {
        const target = tMap.get(s)[sym];
        html += "<td>" + (target !== null ? "q" + target : "\u2205") + "</td>";
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    return html;
  }

  // ----------------------------------------------------------
  // 8. STEP LOG RENDERING
  // ----------------------------------------------------------

  function renderStepLog(containerId, steps) {
    const el = document.getElementById(containerId);
    if (!el || steps.length === 0) {
      if (el) el.innerHTML = '<div class="algo-step" style="color:#4b5563">No steps to display.</div>';
      return;
    }
    let html = "";
    for (const step of steps) {
      const tagClass = "tag-" + step.tag;
      const tagLabel = step.tag.charAt(0).toUpperCase() + step.tag.slice(1);
      html += '<div class="algo-step"><span class="step-label-tag ' + tagClass + '">' + tagLabel + '</span>' + escapeHtml(step.text) + '</div>';
    }
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ----------------------------------------------------------
  // 9. PARTITION VISUALIZATION
  // ----------------------------------------------------------

  function renderPartitionViz(dfa, minDfa) {
    const container = document.getElementById("partitionViz");
    if (!container || !minDfa.partitions) { return; }

    const accSet = new Set(dfa.acceptStates);
    let html = "<h4>Final State Partitions</h4><div class='partition-cards'>";

    for (let i = 0; i < minDfa.partitions.length; i++) {
      const group = minDfa.partitions[i];
      const isAccept = group.some(s => accSet.has(s));
      html += '<div class="partition-card' + (isAccept ? ' accept-partition' : '') + '">' +
        '<span class="partition-label">P' + i + ':</span>' +
        group.map(s => "q" + s).join(", ") +
        '</div>';
    }

    html += "</div>";
    container.innerHTML = html;
  }

  // ----------------------------------------------------------
  // 10. ANIMATED STRING SIMULATION (Professional Edition)
  // ----------------------------------------------------------

  let animationRunning = false;
  let animationTimers = [];

  function clearAnimationTimers() {
    animationTimers.forEach(t => clearTimeout(t));
    animationTimers = [];
  }

  function createAnimOverlay(graphContainer) {
    // Remove any existing overlay
    const existing = graphContainer.querySelector('.anim-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'anim-overlay';
    overlay.innerHTML = `
      <div class="anim-char-display">
        <div class="anim-string-track"></div>
        <div class="anim-current-info">
          <span class="anim-state-label"></span>
        </div>
      </div>
    `;
    graphContainer.style.position = 'relative';
    graphContainer.appendChild(overlay);
    return overlay;
  }

  function removeAnimOverlay(graphContainer) {
    const overlay = graphContainer.querySelector('.anim-overlay');
    if (overlay) {
      overlay.classList.add('anim-overlay-exit');
      setTimeout(() => overlay.remove(), 400);
    }
  }

  function animateString(cy, dfa, str) {
    if (animationRunning) return;

    const animateBtnEl = document.getElementById("animateBtn");
    const testResultEl = document.getElementById("testResult");
    const simPathEl    = document.getElementById("simulationPath");
    const animGraphContainer = document.getElementById("animGraphContainer");
    const { alphabet, transitions, start, acceptStates } = dfa;
    const transMap = new Map();
    for (const s of dfa.states) transMap.set(s, {});
    for (const t of transitions) {
      transMap.get(t.from)[t.symbol] = t.to;
    }

    // Validate string characters
    for (const ch of str) {
      if (!alphabet.includes(ch)) {
        testResultEl.classList.remove("hidden", "accepted", "rejected");
        testResultEl.classList.add("rejected");
        testResultEl.textContent = "REJECTED \u2014 Character '" + ch + "' not in alphabet {" + alphabet.join(", ") + "}";
        simPathEl.classList.add("hidden");
        animGraphContainer.classList.add("hidden");
        return;
      }
    }

    animationRunning = true;
    animateBtnEl.disabled = true;
    clearAnimationTimers();

    // Clear previous results
    testResultEl.classList.add("hidden");
    testResultEl.classList.remove("accepted", "rejected");
    simPathEl.classList.remove("hidden");
    simPathEl.innerHTML = "<strong>Simulation Trace:</strong><br>";

    // Show and render a fresh MinDFA graph inside Step 4
    animGraphContainer.classList.remove("hidden");
    const animCy = renderAutomaton("animGraph", dfa, false);

    // Create overlay on the animation graph
    const graphEl = document.getElementById("animGraph");
    const overlay = createAnimOverlay(graphEl);
    const stringTrack = overlay.querySelector('.anim-string-track');
    const stateLabel = overlay.querySelector('.anim-state-label');

    // Build string character display
    let trackHtml = '';
    for (let i = 0; i < str.length; i++) {
      trackHtml += '<span class="anim-char" data-idx="' + i + '">' + str[i] + '</span>';
    }
    if (str.length === 0) {
      trackHtml = '<span class="anim-char anim-char-empty">ε</span>';
    }
    stringTrack.innerHTML = trackHtml;
    stateLabel.textContent = 'State: q' + start;

    // Scroll the animation graph into view
    animGraphContainer.scrollIntoView({ behavior: "smooth", block: "center" });

    // Pre-compute all steps
    let current = start;
    const steps = [];
    let valid = true;

    for (const ch of str) {
      const next = transMap.get(current)?.[ch];
      if (next === undefined) {
        steps.push({ from: current, symbol: ch, to: null });
        valid = false;
        break;
      }
      steps.push({ from: current, symbol: ch, to: next });
      current = next;
    }

    const accepted = valid && acceptStates.includes(current);
    const stepDelay = Math.max(900, Math.min(1800, 4500 / (str.length + 1)));
    let stepIdx = 0;

    // Show start state — animate the node
    const startNode = animCy.getElementById("s" + start);
    startNode.addClass("anim-active");
    
    // Smooth zoom to start node
    animCy.animate({
      center: { eles: startNode },
      zoom: Math.min(animCy.zoom() * 1.15, 2.2),
      duration: 600,
      easing: 'ease-in-out-cubic'
    });

    simPathEl.innerHTML += '<span class="state-tag anim-state-appear">q' + start + '</span>';

    function nextStep() {
      if (stepIdx >= steps.length) {
        // Animation finished — show final result
        animCy.nodes().removeClass("anim-active anim-pulse");
        animCy.edges().removeClass("anim-active");

        const finalState = steps.length > 0 ? steps[steps.length - 1].to : start;

        if (finalState !== null) {
          const finalNode = animCy.getElementById("s" + finalState);
          if (accepted) {
            finalNode.addClass("anim-accept");
            stateLabel.textContent = '✓ ACCEPTED at q' + finalState;
            stateLabel.classList.add('anim-label-accept');
          } else {
            finalNode.addClass("anim-reject");
            stateLabel.textContent = '✗ REJECTED at q' + finalState;
            stateLabel.classList.add('anim-label-reject');
          }

          // Zoom to final node
          animCy.animate({
            center: { eles: finalNode },
            duration: 500,
            easing: 'ease-in-out-cubic'
          });

          const tag = accepted ? "accept-tag" : "reject-tag";
          const label = accepted ? "ACCEPT" : "NOT ACCEPT";
          simPathEl.innerHTML += ' \u2192 <span class="state-tag ' + tag + ' anim-state-appear">' + label + '</span>';
        }

        // Show final verdict banner after a brief pause
        const t1 = setTimeout(() => {
          testResultEl.classList.remove("hidden", "accepted", "rejected");
          testResultEl.classList.add(accepted ? "accepted" : "rejected");
          testResultEl.textContent = accepted
            ? "\u2713 ACCEPTED \u2014 String \"" + str + "\" is in the language."
            : "\u2717 REJECTED \u2014 String \"" + str + "\" is NOT in the language.";
          
          // Scroll test result into view
          testResultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 600);
        animationTimers.push(t1);

        // Remove overlay after showing result, keep graph visible
        const t2 = setTimeout(() => {
          removeAnimOverlay(graphEl);
          // Fit graph back to full view
          animCy.animate({
            fit: { eles: animCy.elements(), padding: 30 },
            duration: 800,
            easing: 'ease-in-out-cubic'
          });
        }, 2000);
        animationTimers.push(t2);

        animationRunning = false;
        animateBtnEl.disabled = false;
        return;
      }

      const step = steps[stepIdx];

      // Mark current character in the overlay
      const charEls = overlay.querySelectorAll('.anim-char');
      charEls.forEach((el, i) => {
        el.classList.remove('anim-char-active', 'anim-char-done');
        if (i < stepIdx) el.classList.add('anim-char-done');
        if (i === stepIdx) el.classList.add('anim-char-active');
      });

      // Mark previous node as visited (trail effect)
      const prevNode = animCy.getElementById("s" + step.from);
      prevNode.removeClass("anim-active anim-pulse");
      prevNode.addClass("anim-visited");

      // Clear active edge highlights
      animCy.edges().removeClass("anim-active");

      // Highlight edge on graph with animation
      if (step.to !== null) {
        const edgeId = "e_" + step.from + "->" + step.to;
        const edge = animCy.getElementById(edgeId);
        if (edge.length) {
          edge.addClass("anim-active");
        }
      }

      // Short pause to show edge, then highlight target node
      const t = setTimeout(() => {
        if (step.to !== null) {
          const targetNode = animCy.getElementById("s" + step.to);
          targetNode.addClass("anim-active anim-pulse");
          stateLabel.textContent = 'State: q' + step.to;

          // Pan to the target node smoothly
          animCy.animate({
            center: { eles: targetNode },
            duration: 350,
            easing: 'ease-in-out-cubic'
          });

          simPathEl.innerHTML += ' \u2014<span class="step-highlight anim-step-appear">' + step.symbol + '</span>\u2192 <span class="state-tag anim-state-appear">q' + step.to + '</span>';
        } else {
          stateLabel.textContent = '✗ Dead state';
          stateLabel.classList.add('anim-label-reject');
          simPathEl.innerHTML += ' \u2014<span class="step-highlight anim-step-appear">' + step.symbol + '</span>\u2192 <span class="state-tag reject-tag anim-state-appear">dead</span>';
        }

        stepIdx++;
        const t2 = setTimeout(nextStep, stepDelay * 0.6);
        animationTimers.push(t2);
      }, stepDelay * 0.4);
      animationTimers.push(t);
    }

    const startDelay = setTimeout(nextStep, stepDelay);
    animationTimers.push(startDelay);
  }

  // ----------------------------------------------------------
  // 11. EXPORT DFA
  // ----------------------------------------------------------

  function exportDFA(nfa, dfa, minDfa, regex) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentW = pw - margin * 2;
    let y = margin;

    function checkPage(needed) {
      if (y + needed > ph - margin) {
        doc.addPage();
        y = margin;
      }
    }

    function heading(text, size) {
      checkPage(12);
      doc.setFontSize(size);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
      doc.text(text, margin, y);
      y += size * 0.45;
    }

    function label(text) {
      checkPage(8);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      doc.text(text, margin, y);
      y += 5;
    }

    function addGraphImage(cyInstance) {
      if (!cyInstance) return;
      const png = cyInstance.png({ output: "base64", bg: "#ffffff", scale: 2, full: true });
      const imgW = contentW;
      const imgH = 55;
      checkPage(imgH + 4);
      doc.addImage(png, "PNG", margin, y, imgW, imgH);
      y += imgH + 4;
    }

    function addTransitionTable(automaton, isNFA, composition) {
      const { states, alphabet, transitions, start } = automaton;
      const accSet = new Set(isNFA ? [automaton.accept] : automaton.acceptStates);
      const symbols = isNFA ? [...alphabet, EPSILON] : [...alphabet];

      // Build transition map
      const tMap = new Map();
      for (const s of states) {
        const row = {};
        for (const sym of symbols) row[sym] = isNFA ? new Set() : null;
        tMap.set(s, row);
      }
      for (const t of transitions) {
        if (isNFA) tMap.get(t.from)[t.symbol].add(t.to);
        else tMap.get(t.from)[t.symbol] = t.to;
      }

      // Build header
      const headers = ["State"];
      if (composition) headers.push("NFA States");
      for (const sym of symbols) headers.push(sym);

      // Build rows
      const rows = [];
      for (const s of states) {
        const prefix = (s === start ? "\u2192 " : "") + (accSet.has(s) ? "* " : "");
        const row = [prefix + "q" + s];
        if (composition) {
          const nfaStates = composition.get(s);
          row.push("{" + [...nfaStates].sort((a, b) => a - b).map(x => "q" + x).join(", ") + "}");
        }
        for (const sym of symbols) {
          if (isNFA) {
            const targets = tMap.get(s)[sym];
            row.push(targets.size > 0 ? [...targets].map(t => "q" + t).join(", ") : "\u2205");
          } else {
            const target = tMap.get(s)[sym];
            row.push(target !== null ? "q" + target : "\u2205");
          }
        }
        rows.push(row);
      }

      const colCount = headers.length;
      const colW = Math.min(contentW / colCount, 24);
      const tableW = colW * colCount;
      const rowH = 6;
      const tableH = (rows.length + 1) * rowH;
      checkPage(tableH + 4);

      const tx = margin;

      // Header row
      doc.setFillColor(240, 240, 250);
      doc.rect(tx, y, tableW, rowH, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 120);
      for (let c = 0; c < colCount; c++) {
        doc.text(headers[c], tx + c * colW + colW / 2, y + rowH - 1.5, { align: "center" });
      }
      y += rowH;

      // Data rows
      doc.setFont("courier", "normal");
      doc.setFontSize(7);
      doc.setTextColor(50, 50, 50);
      for (let r = 0; r < rows.length; r++) {
        if (r % 2 === 0) {
          doc.setFillColor(248, 248, 252);
          doc.rect(tx, y, tableW, rowH, "F");
        }
        for (let c = 0; c < colCount; c++) {
          doc.text(String(rows[r][c]), tx + c * colW + colW / 2, y + rowH - 1.5, { align: "center" });
        }
        y += rowH;
      }

      // Table border
      doc.setDrawColor(180, 180, 200);
      doc.setLineWidth(0.2);
      doc.rect(tx, y - (rows.length + 1) * rowH, tableW, (rows.length + 1) * rowH);
      y += 3;
    }

    // ======== PDF Content ========

    // Title
    heading("Regex to DFA Simulator", 18);
    y += 1;
    label("Regular Expression \u2192 NFA (Thompson) \u2192 DFA (Subset Construction) \u2192 Minimized DFA");
    y += 2;

    // Regex
    doc.setDrawColor(139, 92, 246);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pw - margin, y);
    y += 5;
    heading("Input Regular Expression", 12);
    doc.setFontSize(12);
    doc.setFont("courier", "bold");
    doc.setTextColor(100, 50, 200);
    doc.text(regex, margin, y);
    y += 8;

    // ---- NFA SECTION ----
    heading("Step 1: NFA (Thompson's Construction)", 13);
    y += 1;
    label("Start: q" + nfa.start + "   |   Accept: q" + nfa.accept + "   |   Total States: " + nfa.states.length);
    addGraphImage(nfaCy);
    label("NFA Transition Table:");
    addTransitionTable(nfa, true, null);
    y += 4;

    // ---- DFA SECTION ----
    heading("Step 2: DFA (Subset Construction)", 13);
    y += 1;
    label("Start: q" + dfa.start + "   |   Accept: " + dfa.acceptStates.map(s => "q" + s).join(", ") + "   |   Total States: " + dfa.states.length);
    addGraphImage(dfaCy);
    label("DFA Transition Table:");
    addTransitionTable(dfa, false, dfa.stateComposition);
    y += 4;

    // ---- MinDFA SECTION ----
    heading("Step 3: Minimized DFA (Hopcroft's Algorithm)", 13);
    y += 1;
    const reduced = dfa.states.length - minDfa.states.length;
    const reductionText = reduced > 0
      ? "Reduced by " + reduced + " state" + (reduced > 1 ? "s" : "") + ": " + dfa.states.length + " \u2192 " + minDfa.states.length
      : "Already minimal";
    label("Start: q" + minDfa.start + "   |   Accept: " + minDfa.acceptStates.map(s => "q" + s).join(", ") + "   |   Total States: " + minDfa.states.length + "   |   " + reductionText);
    addGraphImage(minDfaCy);
    label("Minimized DFA Transition Table:");
    addTransitionTable(minDfa, false, null);

    // Partitions
    if (minDfa.partitions) {
      y += 3;
      label("State Partitions:");
      for (let i = 0; i < minDfa.partitions.length; i++) {
        label("  P" + i + " = { " + minDfa.partitions[i].map(s => "q" + s).join(", ") + " }");
      }
    }

    // Footer
    y += 6;
    checkPage(10);
    doc.setDrawColor(139, 92, 246);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pw - margin, y);
    y += 5;
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(130, 130, 140);
    doc.text("Generated by Regex to DFA Simulator \u2014 Theory of Computation", pw / 2, y, { align: "center" });

    doc.save("regex-to-dfa-report.pdf");
  }

  // ----------------------------------------------------------
  // 12. COLLAPSIBLE SECTIONS
  // ----------------------------------------------------------

  function initCollapsible() {
    document.querySelectorAll(".section-header.collapsible").forEach(header => {
      header.addEventListener("click", () => {
        const targetId = header.getAttribute("data-target");
        const content = document.getElementById(targetId);
        if (!content) return;
        const isCollapsed = content.classList.contains("collapsed");
        if (isCollapsed) {
          content.classList.remove("collapsed");
          header.classList.remove("collapsed");
        } else {
          content.classList.add("collapsed");
          header.classList.add("collapsed");
        }
      });
    });
  }

  // ----------------------------------------------------------
  // 13. MAIN APP CONTROLLER
  // ----------------------------------------------------------

  let currentNfa = null;
  let currentDfa = null;
  let currentMinDfa = null;
  let nfaCy = null;
  let dfaCy = null;
  let minDfaCy = null;
  let lastRegex = "";

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
  const animateBtn   = document.getElementById("animateBtn");
  const testResult   = document.getElementById("testResult");
  const simPath      = document.getElementById("simulationPath");
  const exportSection = document.getElementById("exportSection");
  const exportBtn    = document.getElementById("exportBtn");

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
    exportSection.classList.add("hidden");
    testResult.classList.add("hidden");
    testResult.classList.remove("accepted", "rejected");
    simPath.classList.add("hidden");
    simPath.innerHTML = "";
    // Reset animation graph and test input
    const animGraphContainer = document.getElementById("animGraphContainer");
    if (animGraphContainer) {
      animGraphContainer.classList.add("hidden");
      document.getElementById("animGraph").innerHTML = "";
    }
    testStringEl.value = "";
    // Cancel any running animation
    clearAnimationTimers();
    animationRunning = false;
    currentNfa = null;
    currentDfa = null;
    currentMinDfa = null;
    nfaCy = null;
    dfaCy = null;
    minDfaCy = null;
    lastRegex = "";
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
    let depth = 0;
    for (const ch of regex) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (depth < 0) return "Unmatched closing parenthesis.";
    }
    if (depth !== 0) return "Unmatched opening parenthesis.";
    for (const ch of regex) {
      if (!/[a-zA-Z0-9()|*]/.test(ch)) {
        return "Invalid character '" + ch + "'. Supported: letters, digits, |, *, (, )";
      }
    }
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
      nfaCy = renderAutomaton("nfaGraph", nfa, true);
      currentNfa = nfa;
      lastRegex = regex;
      renderStepLog("nfaSteps", thompsonLog);

      // Step 2: DFA
      const dfa = subsetConstruction(nfa);
      currentDfa = dfa;
      dfaSection.classList.remove("hidden");
      updatePipeline("dfa");

      document.getElementById("dfaTable").innerHTML = renderDFATable(dfa, dfa.stateComposition);
      document.getElementById("dfaStart").textContent  = "q" + dfa.start;
      document.getElementById("dfaAccept").textContent = dfa.acceptStates.map(s => "q" + s).join(", ");
      document.getElementById("dfaCount").textContent  = dfa.states.length;
      dfaCy = renderAutomaton("dfaGraph", dfa, false);
      renderStepLog("dfaSteps", subsetLog);

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
        reductionEl.textContent = "(Reduced by " + reduced + " state" + (reduced > 1 ? "s" : "") + ": " + dfa.states.length + " \u2192 " + minDfa.states.length + ")";
      } else {
        reductionEl.textContent = "(Already minimal)";
      }

      minDfaCy = renderAutomaton("minDfaGraph", minDfa, false);
      renderStepLog("partitionSteps", partitionLog);
      renderPartitionViz(dfa, minDfa);

      // Show test section and export
      testSection.classList.remove("hidden");
      exportSection.classList.remove("hidden");
      updatePipeline("test");
      currentMinDfa = minDfa;

    } catch (e) {
      showError("Error: " + e.message);
    }
  }

  function runTest() {
    if (!currentMinDfa) return;

    const str = testStringEl.value;
    const result = testString(currentMinDfa, str);

    testResult.classList.remove("hidden", "accepted", "rejected");
    simPath.classList.remove("hidden");

    if (result.error) {
      testResult.classList.add("rejected");
      testResult.textContent = "REJECTED \u2014 " + result.error;
      simPath.innerHTML = "";
      return;
    }

    testResult.classList.add(result.accepted ? "accepted" : "rejected");
    testResult.textContent = result.accepted
      ? "\u2713 ACCEPTED \u2014 String \"" + str + "\" is in the language."
      : "\u2717 REJECTED \u2014 String \"" + str + "\" is NOT in the language.";

    // Build simulation path display
    let pathHtml = "<strong>Simulation Trace:</strong><br>";
    for (let i = 0; i < result.path.length; i++) {
      const step = result.path[i];
      if (i === 0) {
        pathHtml += '<span class="state-tag">q' + step.state + '</span>';
      } else if (step.state !== null) {
        pathHtml += ' \u2014<span class="step-highlight">' + step.symbol + '</span>\u2192 <span class="state-tag">q' + step.state + '</span>';
      } else {
        pathHtml += ' \u2014<span class="step-highlight">' + step.symbol + '</span>\u2192 <span class="state-tag reject-tag">dead</span>';
      }
    }

    const finalState = result.path[result.path.length - 1].state;
    if (finalState !== null) {
      const tag = result.accepted ? "accept-tag" : "reject-tag";
      const label = result.accepted ? "ACCEPT" : "NOT ACCEPT";
      pathHtml += ' \u2192 <span class="state-tag ' + tag + '">' + label + '</span>';
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

  animateBtn.addEventListener("click", () => {
    if (!currentMinDfa || !minDfaCy) return;
    const str = testStringEl.value;
    animateString(minDfaCy, currentMinDfa, str);
  });

  exportBtn.addEventListener("click", () => {
    if (currentNfa && currentDfa && currentMinDfa) {
      exportDFA(currentNfa, currentDfa, currentMinDfa, lastRegex);
    }
  });

  // Example buttons
  document.querySelectorAll(".btn-example").forEach((btn) => {
    btn.addEventListener("click", () => {
      regexInput.value = btn.dataset.regex;
      runPipeline();
    });
  });

  // Initialize collapsible sections
  initCollapsible();

})();
