const toggleLabButton = document.getElementById("toggle-lab");
const closeLabButton = document.getElementById("close-lab");
const examplesContainer = document.getElementById("examples-container");
const labPanel = document.getElementById("lab-panel");
const codeEditor = document.getElementById("code-editor");
const output = document.getElementById("output");
const runButton = document.getElementById("run-code");
const clearButton = document.getElementById("clear-output");
const runtimeStatus = document.getElementById("runtime-status");
const labTitle = document.getElementById("lab-title");

const pyodideSources = [
  {
    scriptSrc: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js",
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
  },
  {
    scriptSrc: "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js",
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/",
  },
];

const examples = [
  {
    id: "example-1",
    sectionTitle: "1) Create a Heap",
    description:
      "A heap can be represented by a Python list. In this first example, we push items with priorities and inspect the resulting heap structure.",
    labTitle: "Example 1: Create a Heap",
    code: `import heapq

queue = []
heapq.heappush(queue, (3, "Low"))
heapq.heappush(queue, (1, "Urgent"))
heapq.heappush(queue, (2, "Normal"))

print("Heap:", queue)`,
  },
  {
    id: "example-2",
    sectionTitle: "2) Peek and Pop the Smallest Item",
    description:
      "The smallest priority element is always at index 0. Then, use heappop to remove it.",
    labTitle: "Example 2: Peek and Pop",
    code: `import heapq

queue = [(5, "Task A"), (2, "Task B"), (7, "Task C"), (3, "Task D")]
heapq.heapify(queue)

smallest = queue[0]
print("Peek:", smallest)

removed = heapq.heappop(queue)
print("Popped:", removed)
print("After pop:", queue)`,
  },
  {
    id: "example-3",
    sectionTitle: "3) Custom Example: Simulate Job Scheduling",
    description:
      "This example inserts jobs and repeatedly extracts them in priority order. Each run is independent, so one example does not affect the others.",
    labTitle: "Example 3: Job Scheduling",
    code: `import heapq

jobs = []
heapq.heappush(jobs, (4, "Generate report"))
heapq.heappush(jobs, (1, "Fix production bug"))
heapq.heappush(jobs, (3, "Code review"))

while jobs:
    priority, job = heapq.heappop(jobs)
    print(f"Running: {job} (priority {priority})")`,
  },
];

let pyodide;
let runtimeReady = false;
let runtimeLoadingPromise = null;
let currentExampleId = examples[0].id;

function setPanelOpen(isOpen) {
  labPanel.classList.toggle("open", isOpen);
  labPanel.setAttribute("aria-hidden", String(!isOpen));
  toggleLabButton.setAttribute("aria-expanded", String(isOpen));
}

function renderExamples() {
  const markup = examples
    .map(
      (example) => `
      <section class="topic-section">
        <h2>${example.sectionTitle}</h2>
        <p>${example.description}</p>
        <pre><code>${example.code.replace(/</g, "&lt;")}</code></pre>
        <button class="load-example" data-example-id="${example.id}">Load example in lab</button>
      </section>
    `
    )
    .join("");

  examplesContainer.innerHTML = markup;

  examplesContainer.querySelectorAll(".load-example").forEach((button) => {
    button.addEventListener("click", () => {
      loadExample(button.dataset.exampleId);
      setPanelOpen(true);
    });
  });
}

function loadExample(exampleId) {
  const example = examples.find((item) => item.id === exampleId);
  if (!example) {
    return;
  }

  currentExampleId = exampleId;
  codeEditor.value = example.code;
  labTitle.firstChild.textContent = `${example.labTitle} `;
  output.textContent = "Example loaded. Click Run.";
}

function loadExternalScript(scriptSrc) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-pyodide-src="${scriptSrc}"]`);
    if (existing) {
      if (window.loadPyodide) {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(`Failed to load ${scriptSrc}`)), {
          once: true,
        });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;
    script.dataset.pyodideSrc = scriptSrc;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${scriptSrc}`));
    document.head.appendChild(script);
  });
}

async function initializePyodideWithFallback() {
  let lastError;

  for (const source of pyodideSources) {
    try {
      await loadExternalScript(source.scriptSrc);
      if (typeof window.loadPyodide !== "function") {
        throw new Error("Pyodide loader is unavailable after script load.");
      }

      pyodide = await window.loadPyodide({ indexURL: source.indexURL });
      return true;
    } catch (error) {
      lastError = error;
      window.loadPyodide = undefined;
    }
  }

  throw lastError;
}

async function ensurePyodideRuntime() {
  if (runtimeReady) {
    return true;
  }

  if (!runtimeLoadingPromise) {
    output.textContent = "Loading Python runtime...";
    runButton.disabled = true;

    runtimeLoadingPromise = (async () => {
      try {
        await initializePyodideWithFallback();
        runtimeReady = true;
        runtimeStatus.classList.add("ready");
        output.textContent = "Ready. Click Run to execute code.";
        return true;
      } catch (error) {
        output.textContent = `Runtime failed to load: ${error.message}`;
        runtimeLoadingPromise = null;
        return false;
      } finally {
        runButton.disabled = false;
      }
    })();
  }

  return runtimeLoadingPromise;
}

async function runPythonIsolated(userCode) {
  pyodide.globals.set("user_code", userCode);

  const pythonRunner = `
import io
import traceback
import contextlib

_stdout_buffer = io.StringIO()
_error = None
_local_scope = {}

with contextlib.redirect_stdout(_stdout_buffer):
    try:
        exec(user_code, {}, _local_scope)
    except Exception:
        _error = traceback.format_exc()

(_stdout_buffer.getvalue(), _error)
`;

  try {
    const result = await pyodide.runPythonAsync(pythonRunner);
    const [stdoutText, errorText] = result.toJs();

    if (errorText) {
      output.textContent = `Execution error:\n${errorText}`;
    } else if (stdoutText && stdoutText.trim()) {
      output.textContent = stdoutText.trim();
    } else {
      output.textContent = "Code ran successfully with no output.";
    }
  } catch (error) {
    output.textContent = `Execution error:\n${error}`;
  }
}

toggleLabButton.addEventListener("click", () => {
  setPanelOpen(!labPanel.classList.contains("open"));
});

closeLabButton.addEventListener("click", () => setPanelOpen(false));

runButton.addEventListener("click", async () => {
  output.textContent = "Preparing runtime...";
  const ready = await ensurePyodideRuntime();

  if (!ready) {
    return;
  }

  output.textContent = "Running code...";
  await runPythonIsolated(codeEditor.value);
});

clearButton.addEventListener("click", () => {
  output.textContent = "";
});

renderExamples();
loadExample(currentExampleId);
