const STORAGE_KEY = "fyp-research-studio-v1";

const state = {
  papers: [],
  tasks: [],
  nodes: [],
  links: [],
  selectedPaperId: null,
  selectedNodeForLink: null,
  draggedTaskId: null,
  draggedNodeId: null,
};

const pomodoro = {
  timeLeft: 25 * 60,
  timerId: null,
  isRunning: false
};

function renderDashboard() {
  const statPapers = document.getElementById('stat-papers');
  const statTodo = document.getElementById('stat-todo');
  const statDoing = document.getElementById('stat-doing');
  const statDone = document.getElementById('stat-done');

  if (statPapers) statPapers.textContent = state.papers.length;
  if (statTodo) statTodo.textContent = state.tasks.filter(t => t.status === 'todo').length;
  if (statDoing) statDoing.textContent = state.tasks.filter(t => t.status === 'doing').length;
  if (statDone) statDone.textContent = state.tasks.filter(t => t.status === 'done').length;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function saveState() {
  const persistable = {
    papers: state.papers,
    tasks: state.tasks,
    nodes: state.nodes,
    links: state.links,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.papers = Array.isArray(parsed.papers) ? parsed.papers : [];
    state.tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    state.nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    state.links = Array.isArray(parsed.links) ? parsed.links : [];
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
}

function renderPapers() {
  const paperList = document.querySelector("#paper-list");
  const searchInput = document.querySelector("#paper-search");
  const query = searchInput ? searchInput.value.toLowerCase() : "";
  paperList.innerHTML = "";

  const filteredPapers = state.papers.filter(paper => {
    const textToSearch = `${paper.title} ${paper.authors} ${paper.labels ? paper.labels.join(" ") : ""}`.toLowerCase();
    return textToSearch.includes(query);
  });

  if (filteredPapers.length === 0) {
    if (state.papers.length === 0) {
      paperList.innerHTML = '<p class="empty-state">No papers yet. Add your first one.</p>';
    } else {
      paperList.innerHTML = '<p class="empty-state">No matching papers found.</p>';
    }
  } else {
    for (const paper of filteredPapers) {
      const item = document.createElement("article");
      item.className = "paper-item";
      if (paper.id === state.selectedPaperId) item.classList.add("selected");
      
      const labelsHtml = paper.labels && paper.labels.length > 0
        ? `<div class="paper-labels">${paper.labels.map(l => `<span class="paper-label">${l}</span>`).join('')}</div>`
        : "";

      item.innerHTML = `
        <h4>${paper.title}</h4>
        <p>${paper.authors} (${paper.year})</p>
        <small>${paper.fileName ? `Attached: ${paper.fileName}` : "No attachment"}</small>
        ${labelsHtml}
      `;
      item.addEventListener("click", () => {
        state.selectedPaperId = paper.id;
        renderPapers();
      });
      paperList.appendChild(item);
    }
  }

  renderPaperDetail();
  renderDashboard();
}

function renderPaperDetail() {
  const detail = document.querySelector("#paper-detail");
  const paper = state.papers.find((item) => item.id === state.selectedPaperId);
  if (!paper) {
    detail.className = "empty-state";
    detail.textContent = "Select a paper to review abstract, findings, and your notes.";
    return;
  }

  detail.className = "paper-detail";
  detail.innerHTML = `
    <h3>${paper.title}</h3>
    <p><strong>Authors:</strong> ${paper.authors}</p>
    <p><strong>Year:</strong> ${paper.year}</p>
    ${paper.labels && paper.labels.length > 0 ? `<div class="paper-labels" style="margin-bottom:0.5rem">${paper.labels.map(l => `<span class="paper-label">${l}</span>`).join('')}</div>` : ""}
    <p><strong>Problem Gap:</strong> ${paper.gap}</p>
    <p><strong>Solution Ideas:</strong> ${paper.solution}</p>
    <label>
      Research notes
      <textarea id="detail-notes" rows="8">${paper.notes || ""}</textarea>
    </label>
    <div class="detail-actions">
      <button id="edit-paper-btn" class="ghost-btn">Edit Paper</button>
      <button id="save-notes-btn">Save Notes</button>
      <button id="delete-paper-btn" class="danger-btn">Delete Paper</button>
      ${paper.fileName ? '<button id="open-file-btn" class="ghost-btn">Open in Browser</button> <button id="download-file-btn" class="ghost-btn">Download</button>' : ""}
    </div>
  `;

  const notesField = detail.querySelector("#detail-notes");
  detail.querySelector("#save-notes-btn").addEventListener("click", () => {
    paper.notes = notesField.value.trim();
    saveState();
  });

  detail.querySelector("#edit-paper-btn").addEventListener("click", () => {
    window.editingPaperId = paper.id;
    const form = document.querySelector("#paper-form");
    form.title.value = paper.title;
    form.authors.value = paper.authors;
    form.year.value = paper.year;
    form.labels.value = paper.labels ? paper.labels.join(", ") : "";
    form.gap.value = paper.gap;
    form.solution.value = paper.solution;
    
    const fileDisplay = document.querySelector("#current-file-display");
    if (paper.fileName) {
      fileDisplay.textContent = `Current file: ${paper.fileName} (Upload a new file to replace)`;
    } else {
      fileDisplay.textContent = "No file currently attached";
    }

    document.querySelector("#paper-dialog h3").textContent = "Edit Research Paper";
    document.querySelector("#paper-dialog").showModal();
  });

  detail.querySelector("#delete-paper-btn").addEventListener("click", () => {
    state.papers = state.papers.filter((item) => item.id !== paper.id);
    state.selectedPaperId = null;
    saveState();
    renderPapers();
  });

  const openBtn = detail.querySelector("#open-file-btn");
  if (openBtn) {
    openBtn.addEventListener("click", () => {
      const mime = paper.fileDataUrl.match(/:(.*?);/)[1];
      const viewerDialog = document.querySelector("#viewer-dialog");
      document.querySelector("#viewer-title").textContent = paper.fileName || "Document";
      
      const contentDiv = document.querySelector("#viewer-content");
      if (mime.startsWith('image/')) {
        contentDiv.innerHTML = `<img src="${paper.fileDataUrl}" style="width:100%; height:100%; object-fit:contain; background:#0f172a;" />`;
      } else {
        contentDiv.innerHTML = `<embed src="${paper.fileDataUrl}" type="${mime}" style="width:100%; height:100%; border:none;"></embed>`;
      }
      
      viewerDialog.showModal();
    });
  }

  const downloadBtn = detail.querySelector("#download-file-btn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      const blob = dataUrlToBlob(paper.fileDataUrl);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = paper.fileName;
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }
}

function renderTasks() {
  const lists = {
    todo: document.querySelector("#todo-list"),
    doing: document.querySelector("#doing-list"),
    done: document.querySelector("#done-list"),
  };

  for (const list of Object.values(lists)) {
    list.innerHTML = "";
  }

  for (const task of state.tasks) {
    const card = document.createElement("article");
    card.className = `task-card priority-${task.priority}`;
    card.dataset.taskId = task.id;
    card.innerHTML = `
      <h4>${task.title}</h4>
      <p>${task.description || "No description."}</p>
      <small>Priority: ${task.priority}</small>
      <div class="task-actions" style="display:flex; gap:0.5rem; margin-top:0.75rem;">
        <button class="ghost-btn edit-task-btn" style="padding:0.25rem 0.5rem; font-size:0.8rem;">Edit</button>
        <button class="ghost-btn delete-task-btn" style="padding:0.25rem 0.5rem; font-size:0.8rem;">Delete</button>
      </div>
    `;

    card.addEventListener("pointerdown", (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      
      const rect = card.getBoundingClientRect();
      const clone = card.cloneNode(true);
      clone.style.position = "fixed";
      clone.style.left = `${rect.left}px`;
      clone.style.top = `${rect.top}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.height = `${rect.height}px`;
      clone.style.pointerEvents = "none";
      clone.style.zIndex = "9999";
      clone.style.opacity = "0.8";
      clone.style.margin = "0";
      document.body.appendChild(clone);
      
      card.style.opacity = "0.4";
      state.draggedTaskId = task.id;

      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      let currentTargetCol = null;

      function onPointerMove(moveEvent) {
        clone.style.left = `${moveEvent.clientX - offsetX}px`;
        clone.style.top = `${moveEvent.clientY - offsetY}px`;
        
        const elemBelow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const col = elemBelow ? elemBelow.closest('.kanban-column') : null;
        
        if (currentTargetCol !== col) {
          if (currentTargetCol) currentTargetCol.classList.remove("drop-target");
          currentTargetCol = col;
          if (currentTargetCol) currentTargetCol.classList.add("drop-target");
        }
      }

      function onPointerUp(upEvent) {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        
        clone.remove();
        card.style.opacity = "1";
        
        if (currentTargetCol) {
          currentTargetCol.classList.remove("drop-target");
          const newStatus = currentTargetCol.dataset.status;
          if (task.status !== newStatus) {
            task.status = newStatus;
            saveState();
            renderTasks();
          }
        }
        state.draggedTaskId = null;
      }

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    });

    card.querySelector(".edit-task-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      window.editingTaskId = task.id;
      const form = document.querySelector("#task-form");
      form.title.value = task.title;
      form.description.value = task.description;
      form.priority.value = task.priority;
      document.querySelector("#task-dialog h3").textContent = "Edit Kanban Task";
      document.querySelector("#task-dialog").showModal();
    });

    card.querySelector(".delete-task-btn").addEventListener("click", () => {
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      saveState();
      renderTasks();
    });
    lists[task.status].appendChild(card);
  }
  renderDashboard();
}

function setupKanbanDropzones() {
  // Handled by pointer events in renderTasks
}

function renderNodes() {
  const board = document.querySelector("#node-board");
  const existingNodes = board.querySelectorAll(".map-node");
  existingNodes.forEach((nodeEl) => nodeEl.remove());

  for (const node of state.nodes) {
    const nodeEl = document.createElement("article");
    nodeEl.className = "map-node";
    if (state.selectedNodeForLink === node.id) nodeEl.classList.add("link-source");
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;
    nodeEl.dataset.nodeId = node.id;
    nodeEl.innerHTML = `
      <h4>${node.title}</h4>
      <p>${node.content}</p>
      <div class="node-actions">
        <button class="ghost-btn link-btn">Link</button>
        <button class="ghost-btn delete-btn">Delete</button>
      </div>
    `;

    nodeEl.addEventListener("pointerdown", (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      nodeEl.setPointerCapture(e.pointerId);
      state.draggedNodeId = node.id;

      const rect = nodeEl.getBoundingClientRect();
      const boardRect = document.querySelector("#node-board").getBoundingClientRect();
      
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      function onPointerMove(moveEvent) {
        if (state.draggedNodeId !== node.id) return;
        const newX = moveEvent.clientX - boardRect.left - offsetX;
        const newY = moveEvent.clientY - boardRect.top - offsetY;
        
        node.x = Math.max(8, Math.min(newX, boardRect.width - nodeEl.offsetWidth));
        node.y = Math.max(8, Math.min(newY, boardRect.height - nodeEl.offsetHeight));
        
        nodeEl.style.left = `${node.x}px`;
        nodeEl.style.top = `${node.y}px`;
        renderLinks();
      }

      function onPointerUp(upEvent) {
        if (state.draggedNodeId === node.id) {
          state.draggedNodeId = null;
          nodeEl.releasePointerCapture(upEvent.pointerId);
          nodeEl.removeEventListener("pointermove", onPointerMove);
          nodeEl.removeEventListener("pointerup", onPointerUp);
          saveState();
        }
      }

      nodeEl.addEventListener("pointermove", onPointerMove);
      nodeEl.addEventListener("pointerup", onPointerUp);
    });

    nodeEl.querySelector(".link-btn").addEventListener("click", () => {
      if (state.selectedNodeForLink === node.id) {
        state.selectedNodeForLink = null;
      } else if (!state.selectedNodeForLink) {
        state.selectedNodeForLink = node.id;
      } else {
        const from = state.selectedNodeForLink;
        const to = node.id;
        if (from !== to) {
          const existingIndex = state.links.findIndex(l => l.from === from && l.to === to);
          if (existingIndex !== -1) {
            state.links.splice(existingIndex, 1);
          } else {
            state.links.push({ id: createId("link"), from, to });
          }
        }
        state.selectedNodeForLink = null;
        saveState();
      }
      renderNodes();
      renderLinks();
    });

    nodeEl.querySelector(".delete-btn").addEventListener("click", () => {
      state.nodes = state.nodes.filter((item) => item.id !== node.id);
      state.links = state.links.filter((item) => item.from !== node.id && item.to !== node.id);
      if (state.selectedNodeForLink === node.id) state.selectedNodeForLink = null;
      saveState();
      renderNodes();
      renderLinks();
    });

    board.appendChild(nodeEl);
  }
}

function renderLinks() {
  const layer = document.querySelector("#link-layer");
  layer.innerHTML = `
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#5b8def"></polygon>
      </marker>
    </defs>
  `;
  const boardRect = document.querySelector("#node-board").getBoundingClientRect();

  for (const link of state.links) {
    const source = state.nodes.find((node) => node.id === link.from);
    const target = state.nodes.find((node) => node.id === link.to);
    if (!source || !target) continue;

    const sourceEl = document.querySelector(`[data-node-id="${source.id}"]`);
    const targetEl = document.querySelector(`[data-node-id="${target.id}"]`);
    const sourceWidth = sourceEl ? sourceEl.offsetWidth : 200;
    const targetWidth = targetEl ? targetEl.offsetWidth : 200;
    const sourceHeight = sourceEl ? sourceEl.offsetHeight : 80;
    const targetHeight = targetEl ? targetEl.offsetHeight : 80;

    let x1, y1, x2, y2;

    if (source.x + sourceWidth + 10 < target.x) {
      x1 = source.x + sourceWidth;
      y1 = source.y + sourceHeight / 2;
      x2 = target.x - 6;
      y2 = target.y + targetHeight / 2;
    } else if (source.x > target.x + targetWidth + 10) {
      x1 = source.x;
      y1 = source.y + sourceHeight / 2;
      x2 = target.x + targetWidth + 6;
      y2 = target.y + targetHeight / 2;
    } else if (source.y + sourceHeight + 10 < target.y) {
      x1 = source.x + sourceWidth / 2;
      y1 = source.y + sourceHeight;
      x2 = target.x + targetWidth / 2;
      y2 = target.y - 6;
    } else {
      x1 = source.x + sourceWidth / 2;
      y1 = source.y;
      x2 = target.x + targetWidth / 2;
      y2 = target.y + targetHeight + 6;
    }

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    line.setAttribute("stroke", "#5b8def");
    line.setAttribute("stroke-width", "3");
    line.setAttribute("marker-end", "url(#arrowhead)");
    layer.appendChild(line);
  }

  layer.setAttribute("viewBox", `0 0 ${boardRect.width} ${boardRect.height}`);
}

function setupNodeBoardDnD() {
  // Handled by pointer events in renderNodes
}

function dataUrlToBlob(dataUrl) {
  const [header, content] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function setupDialogs() {
  const paperDialog = document.querySelector("#paper-dialog");
  const paperForm = document.querySelector("#paper-form");
  const fileInput = document.querySelector("#paper-file-input");
  const taskDialog = document.querySelector("#task-dialog");
  const taskForm = document.querySelector("#task-form");

  window.editingPaperId = null;
  document.querySelector("#add-paper-btn").addEventListener("click", () => {
    window.editingPaperId = null;
    paperForm.reset();
    document.querySelector("#current-file-display").textContent = "";
    document.querySelector("#paper-dialog h3").textContent = "Add Research Paper";
    paperDialog.showModal();
  });
  document.querySelector("#cancel-paper-btn").addEventListener("click", () => paperDialog.close());

  const viewerDialog = document.querySelector("#viewer-dialog");
  if (viewerDialog) {
    document.querySelector("#close-viewer-btn").addEventListener("click", () => {
      document.querySelector("#viewer-content").innerHTML = "";
      viewerDialog.close();
    });
  }

  paperForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(paperForm);
    let fileDataUrl = "";
    let fileName = "";

    const file = fileInput.files[0];
    if (file) {
      fileName = file.name;
      fileDataUrl = await fileToDataUrl(file);
    }

    const rawLabels = String(data.get("labels") || "").trim();
    const labels = rawLabels ? rawLabels.split(",").map(l => l.trim()).filter(l => l) : [];

    if (window.editingPaperId) {
      const paper = state.papers.find(p => p.id === window.editingPaperId);
      if (paper) {
        paper.title = String(data.get("title") || "").trim();
        paper.authors = String(data.get("authors") || "").trim();
        paper.year = Number(data.get("year"));
        paper.labels = labels;
        paper.gap = String(data.get("gap") || "").trim();
        paper.solution = String(data.get("solution") || "").trim();
        if (fileName) {
          paper.fileName = fileName;
          paper.fileDataUrl = fileDataUrl;
        }
      }
      window.editingPaperId = null;
    } else {
      state.papers.unshift({
        id: createId("paper"),
        title: String(data.get("title") || "").trim(),
        authors: String(data.get("authors") || "").trim(),
        year: Number(data.get("year")),
        labels,
        gap: String(data.get("gap") || "").trim(),
        solution: String(data.get("solution") || "").trim(),
        notes: "",
        fileName,
        fileDataUrl,
      });
      state.selectedPaperId = state.papers[0].id;
    }
    saveState();
    renderPapers();
    paperForm.reset();
    paperDialog.close();
  });

  window.editingTaskId = null;
  document.querySelector("#add-task-btn").addEventListener("click", () => {
    window.editingTaskId = null;
    taskForm.reset();
    document.querySelector("#task-dialog h3").textContent = "Add Kanban Task";
    taskDialog.showModal();
  });
  document.querySelector("#cancel-task-btn").addEventListener("click", () => taskDialog.close());
  taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(taskForm);
    
    if (window.editingTaskId) {
      const task = state.tasks.find((t) => t.id === window.editingTaskId);
      if (task) {
        task.title = String(data.get("title") || "").trim();
        task.description = String(data.get("description") || "").trim();
        task.priority = String(data.get("priority") || "medium");
      }
      window.editingTaskId = null;
    } else {
      state.tasks.push({
        id: createId("task"),
        title: String(data.get("title") || "").trim(),
        description: String(data.get("description") || "").trim(),
        priority: String(data.get("priority") || "medium"),
        status: "todo",
      });
    }
    saveState();
    renderTasks();
    taskForm.reset();
    taskDialog.close();
  });

  const nodeDialog = document.querySelector("#node-dialog");
  const nodeForm = document.querySelector("#node-form");

  document.querySelector("#add-node-btn").addEventListener("click", () => {
    nodeForm.reset();
    nodeDialog.showModal();
  });
  document.querySelector("#cancel-node-btn").addEventListener("click", () => nodeDialog.close());
  
  nodeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(nodeForm);
    const title = String(data.get("title") || "").trim();
    const content = String(data.get("content") || "").trim();
    
    state.nodes.push({
      id: createId("node"),
      title,
      content,
      x: 24 + (state.nodes.length % 4) * 170,
      y: 24 + (state.nodes.length % 3) * 110,
    });
    
    saveState();
    renderNodes();
    renderLinks();
    nodeForm.reset();
    nodeDialog.close();
  });

  document.querySelector("#clear-links-btn").addEventListener("click", () => {
    state.links = [];
    state.selectedNodeForLink = null;
    saveState();
    renderNodes();
    renderLinks();
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setupNodeTools() {
  // Handled in setupDialogs
}

function setupBackupButtons() {
  document.querySelector("#export-state-btn").addEventListener("click", () => {
    const content = localStorage.getItem(STORAGE_KEY) || "{}";
    const blob = new Blob([content], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "fyp-research-studio-backup.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });

  const importTrigger = document.querySelector("#import-state-btn");
  const importInput = document.querySelector("#import-state-file");
  importTrigger.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (
        !Array.isArray(parsed.papers) ||
        !Array.isArray(parsed.tasks) ||
        !Array.isArray(parsed.nodes) ||
        !Array.isArray(parsed.links)
      ) {
        throw new Error("Invalid backup format");
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      loadState();
      renderPapers();
      renderTasks();
      renderNodes();
      renderLinks();
    } catch {
      window.alert("Import failed. Please choose a valid backup JSON file.");
    } finally {
      importInput.value = "";
    }
  });
}

function setupPomodoro() {
  const timerDisplay = document.getElementById('pomodoro-timer');
  const startBtn = document.getElementById('pomodoro-start');
  const pauseBtn = document.getElementById('pomodoro-pause');
  const resetBtn = document.getElementById('pomodoro-reset');
  if (!timerDisplay) return;

  function updateDisplay() {
    const m = Math.floor(pomodoro.timeLeft / 60).toString().padStart(2, '0');
    const s = (pomodoro.timeLeft % 60).toString().padStart(2, '0');
    timerDisplay.textContent = `${m}:${s}`;
  }

  function tick() {
    if (pomodoro.timeLeft > 0) {
      pomodoro.timeLeft--;
      updateDisplay();
    } else {
      clearInterval(pomodoro.timerId);
      pomodoro.isRunning = false;
      alert('Pomodoro session completed!');
    }
  }

  startBtn.addEventListener('click', () => {
    if (!pomodoro.isRunning) {
      pomodoro.isRunning = true;
      pomodoro.timerId = setInterval(tick, 1000);
    }
  });

  pauseBtn.addEventListener('click', () => {
    pomodoro.isRunning = false;
    clearInterval(pomodoro.timerId);
  });

  resetBtn.addEventListener('click', () => {
    pomodoro.isRunning = false;
    clearInterval(pomodoro.timerId);
    pomodoro.timeLeft = 25 * 60;
    updateDisplay();
  });

  updateDisplay();
}

window.addEventListener("resize", renderLinks);

window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  loadState();
  setupDialogs();
  setupKanbanDropzones();
  setupNodeBoardDnD();
  setupNodeTools();
  setupBackupButtons();
  renderPapers();
  renderTasks();
  renderNodes();
  renderLinks();
  renderDashboard();
  setupPomodoro();
  
  const searchInput = document.querySelector("#paper-search");
  if (searchInput) {
    searchInput.addEventListener("input", renderPapers);
  }
});
