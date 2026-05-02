const STORAGE_KEY = "fyp-research-studio-v1";
const FILE_DB_NAME = "fyp-research-files";
const FILE_DB_STORE = "paper-files";

// --- IndexedDB helpers for large file storage ---
function openFileDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FILE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_DB_STORE)) {
        db.createObjectStore(FILE_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveFileData(paperId, fileDataUrl) {
  const db = await openFileDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_DB_STORE, "readwrite");
    tx.objectStore(FILE_DB_STORE).put(fileDataUrl, paperId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadFileData(paperId) {
  const db = await openFileDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_DB_STORE, "readonly");
    const req = tx.objectStore(FILE_DB_STORE).get(paperId);
    req.onsuccess = () => resolve(req.result || "");
    req.onerror = () => reject(req.error);
  });
}

async function deleteFileData(paperId) {
  const db = await openFileDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_DB_STORE, "readwrite");
    tx.objectStore(FILE_DB_STORE).delete(paperId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const state = {
  papers: [],
  tasks: [],
  nodes: [],
  links: [],
  terms: [],
  reports: [],
  selectedPaperId: null,
  selectedReportId: null,
  paperListView: 'list',
  selectedNodeForLink: null,
  draggedTaskId: null,
  draggedNodeId: null,
  canvasTransform: { x: 0, y: 0, scale: 1 },
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

function setPaperViewMode(mode) {
  state.paperListView = mode === 'grid' ? 'grid' : 'list';
  document.querySelectorAll('#paper-view-toggle button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === state.paperListView);
  });
  const layout = document.querySelector('.research-layout');
  if (layout) {
    layout.classList.toggle('grid-view', state.paperListView === 'grid');
  }
  renderPapers();
}

function showPaperDetailDialog(paper) {
  const detailDialog = document.querySelector('#paper-detail-dialog');
  if (!detailDialog) return;

  const content = detailDialog.querySelector('.paper-detail-dialog-content');
  content.innerHTML = `
    <div class="paper-detail-dialog-header">
      <h3>${paper.title}</h3>
      <button type="button" id="close-paper-detail-dialog" class="ghost-btn">Close</button>
    </div>
    <div class="paper-detail-dialog-body">
      <p><strong>Authors:</strong> ${paper.authors}</p>
      <p><strong>Year:</strong> ${paper.year}</p>
      ${paper.labels && paper.labels.length > 0 ? `<div class="paper-labels" style="margin: 0.75rem 0">${paper.labels.map(l => `<span class="paper-label">${l}</span>`).join('')}</div>` : ''}
      <p><strong>Problem Gap:</strong> ${paper.gap}</p>
      <p><strong>Solution Ideas:</strong> ${paper.solution}</p>
      <label>
        Research notes
        <textarea id="detail-notes-dialog" rows="8">${paper.notes || ''}</textarea>
      </label>
      <div class="detail-actions paper-detail-dialog-actions">
        <button id="edit-paper-dialog-btn" class="ghost-btn">Edit</button>
        <button id="save-notes-dialog-btn" class="primary-btn">Save Notes</button>
        <button id="delete-paper-dialog-btn" class="danger-btn">Delete Paper</button>
        ${paper.fileName ? '<button id="open-file-dialog-btn" class="ghost-btn">Open in Browser</button> <button id="download-file-dialog-btn" class="ghost-btn">Download</button>' : ''}
      </div>
    </div>
  `;

  const detailNotes = detailDialog.querySelector('#detail-notes-dialog');

  detailDialog.querySelector('#close-paper-detail-dialog').addEventListener('click', () => {
    detailDialog.close();
  });

  detailDialog.querySelector('#save-notes-dialog-btn').addEventListener('click', () => {
    paper.notes = detailNotes.value.trim();
    saveState();
    detailDialog.close();
  });

  detailDialog.querySelector('#edit-paper-dialog-btn').addEventListener('click', () => {
    window.editingPaperId = paper.id;
    const form = document.querySelector('#paper-form');
    form.title.value = paper.title;
    form.authors.value = paper.authors;
    form.year.value = paper.year;
    form.labels.value = paper.labels ? paper.labels.join(', ') : '';
    form.gap.value = paper.gap;
    form.solution.value = paper.solution;
    document.querySelector('#current-file-display').textContent = paper.fileName
      ? `Current file: ${paper.fileName} (Upload a new file to replace)`
      : 'No file currently attached';
    document.querySelector('#paper-dialog h3').textContent = 'Edit Research Paper';
    detailDialog.close();
    document.querySelector('#paper-dialog').showModal();
  });

  detailDialog.querySelector('#delete-paper-dialog-btn').addEventListener('click', async () => {
    if (paper.fileName) {
      try { await deleteFileData(paper.id); } catch (e) { console.warn('Could not delete file data:', e); }
    }
    state.papers = state.papers.filter((item) => item.id !== paper.id);
    state.selectedPaperId = null;
    saveState();
    renderPapers();
    detailDialog.close();
  });

  const openBtn = detailDialog.querySelector('#open-file-dialog-btn');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      const mime = paper.fileDataUrl.match(/:(.*?);/)[1];
      const viewerDialog = document.querySelector('#viewer-dialog');
      document.querySelector('#viewer-title').textContent = paper.fileName || 'Document';
      const contentDiv = document.querySelector('#viewer-content');
      if (mime.startsWith('image/')) {
        contentDiv.innerHTML = `<img src="${paper.fileDataUrl}" style="width:100%; height:100%; object-fit:contain; background:#0f172a;" />`;
      } else {
        const blob = dataUrlToBlob(paper.fileDataUrl);
        const url = URL.createObjectURL(blob);
        contentDiv.innerHTML = `<iframe src="${url}" style="width:100%; height:100%; border:none;"></iframe>`;
        contentDiv.dataset.objectUrl = url;
      }
      detailDialog.close();
      viewerDialog.showModal();
    });
  }

  const downloadBtn = detailDialog.querySelector('#download-file-dialog-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const blob = dataUrlToBlob(paper.fileDataUrl);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = paper.fileName;
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }

  detailDialog.showModal();
}

function saveState() {
  // Strip fileDataUrl from papers before saving to localStorage (they go to IndexedDB)
  const papersForStorage = state.papers.map(p => {
    const { fileDataUrl, ...rest } = p;
    return rest;
  });
  const persistable = {
    papers: papersForStorage,
    tasks: state.tasks,
    nodes: state.nodes,
    links: state.links,
    terms: state.terms,
    reports: state.reports,
    paperListView: state.paperListView,
    canvasTransform: state.canvasTransform,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  } catch (e) {
    console.error("Failed to save state to localStorage:", e);
  }
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
    state.terms = Array.isArray(parsed.terms) ? parsed.terms : [];
    state.reports = Array.isArray(parsed.reports) ? parsed.reports : [];
    state.paperListView = parsed.paperListView === 'grid' ? 'grid' : 'list';
    state.canvasTransform = parsed.canvasTransform || { x: 0, y: 0, scale: 1 };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// Restore file data from IndexedDB into in-memory state
async function loadFileDataForPapers() {
  for (const paper of state.papers) {
    if (paper.fileName) {
      try {
        paper.fileDataUrl = await loadFileData(paper.id);
      } catch (e) {
        console.warn(`Could not load file data for paper ${paper.id}:`, e);
        paper.fileDataUrl = "";
      }
    }
  }
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
  if (tabId === "nodes") {
    renderLinks();
  }
}

function renderPapers() {
  const paperList = document.querySelector("#paper-list");
  const searchInput = document.querySelector("#paper-search");
  const query = searchInput ? searchInput.value.toLowerCase() : "";
  paperList.innerHTML = "";
  paperList.classList.toggle('grid', state.paperListView === 'grid');

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
        if (state.paperListView === 'grid') {
          showPaperDetailDialog(paper);
        }
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

  detail.querySelector("#delete-paper-btn").addEventListener("click", async () => {
    // Clean up file data from IndexedDB
    if (paper.fileName) {
      try { await deleteFileData(paper.id); } catch (e) { console.warn("Could not delete file data:", e); }
    }

    state.papers = state.papers.filter((item) => item.id !== paper.id);
    state.selectedPaperId = null;

    // Cascade delete to paper nodes
    const nodesToDelete = state.nodes.filter(n => n.type === 'paper' && n.paperId === paper.id);
    const deletedNodeIds = nodesToDelete.map(n => n.id);
    state.nodes = state.nodes.filter(n => !(n.type === 'paper' && n.paperId === paper.id));
    state.links = state.links.filter(l => !deletedNodeIds.includes(l.from) && !deletedNodeIds.includes(l.to));
    if (deletedNodeIds.includes(state.selectedNodeForLink)) {
      state.selectedNodeForLink = null;
    }

    saveState();
    renderPapers();
    renderNodes();
    renderLinks();
    renderTerms();
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
        const blob = dataUrlToBlob(paper.fileDataUrl);
        const url = URL.createObjectURL(blob);
        contentDiv.innerHTML = `<iframe src="${url}" style="width:100%; height:100%; border:none;"></iframe>`;
        contentDiv.dataset.objectUrl = url;
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

function renderTerms() {
  const termList = document.querySelector("#term-list");
  const searchInput = document.querySelector("#term-search");
  if (!termList) return;

  const query = searchInput ? searchInput.value.toLowerCase() : "";
  termList.innerHTML = "";

  const filteredTerms = state.terms.filter(term => {
    const textToSearch = `${term.name} ${term.description}`.toLowerCase();
    return textToSearch.includes(query);
  });

  if (filteredTerms.length === 0) {
    if (state.terms.length === 0) {
      termList.innerHTML = '<p class="empty-state" style="grid-column: 1 / -1;">No terms yet. Add your first definition.</p>';
    } else {
      termList.innerHTML = '<p class="empty-state" style="grid-column: 1 / -1;">No matching terms found.</p>';
    }
  } else {
    for (const term of filteredTerms) {
      const card = document.createElement("article");
      card.className = "term-card glass-panel";
      card.style.padding = "1rem";

      let citationHtml = "";
      if (term.paperId) {
        const paper = state.papers.find(p => p.id === term.paperId);
        if (paper) {
          citationHtml = `<div style="font-size: 0.8rem; color: var(--primary-color); margin-top: 0.5rem;">📖 Cited: ${paper.title}</div>`;
        }
      }

      card.innerHTML = `
        <h4 style="margin-top: 0;">${term.name}</h4>
        <p style="font-size: 0.9rem; margin-bottom: 0;">${term.description}</p>
        ${citationHtml}
        <div class="task-actions" style="display:flex; gap:0.5rem; margin-top:0.75rem;">
          <button class="ghost-btn edit-term-btn" style="padding:0.25rem 0.5rem; font-size:0.8rem;">Edit</button>
          <button class="ghost-btn delete-term-btn" style="padding:0.25rem 0.5rem; font-size:0.8rem;">Delete</button>
        </div>
      `;

      card.querySelector(".edit-term-btn").addEventListener("click", () => {
        window.editingTermId = term.id;
        const form = document.querySelector("#term-form");
        form.name.value = term.name;
        form.description.value = term.description;

        const paperSelect = document.querySelector("#term-paper-select");
        paperSelect.innerHTML = '<option value="">None</option>';
        state.papers.forEach(p => {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.title;
          paperSelect.appendChild(opt);
        });
        form.paperId.value = term.paperId || "";

        document.querySelector("#term-dialog h3").textContent = "Edit Term";
        document.querySelector("#term-dialog").showModal();
      });

      card.querySelector(".delete-term-btn").addEventListener("click", () => {
        state.terms = state.terms.filter((item) => item.id !== term.id);
        saveState();
        renderTerms();
      });

      termList.appendChild(card);
    }
  }
}

function setupKanbanDropzones() {
  // Handled by pointer events in renderTasks
}

function applyCanvasTransform() {
  const canvas = document.querySelector("#node-board-canvas");
  if (canvas) {
    canvas.style.transform = `translate(${state.canvasTransform.x}px, ${state.canvasTransform.y}px) scale(${state.canvasTransform.scale})`;
  }
}

const nodeResizeObserver = new ResizeObserver(() => {
  const nodesPanel = document.querySelector("#nodes");
  if (nodesPanel && nodesPanel.classList.contains("active")) {
    renderLinks();
  }
});

function renderNodes() {
  const canvas = document.querySelector("#node-board-canvas");
  const existingNodes = canvas.querySelectorAll(".map-node");
  existingNodes.forEach((nodeEl) => nodeEl.remove());

  nodeResizeObserver.disconnect();

  for (const node of state.nodes) {
    const nodeEl = document.createElement("article");
    nodeEl.className = `map-node ${node.type === 'paper' ? 'paper-node' : ''}`;
    if (state.selectedNodeForLink === node.id) nodeEl.classList.add("link-source");
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;
    nodeEl.dataset.nodeId = node.id;

    let typeBadge = node.type === 'paper' ? `<span class="node-badge paper-badge">📄 Paper</span>` : `<span class="node-badge general-badge">📝 Note</span>`;

    nodeEl.innerHTML = `
      <div class="node-header">${typeBadge}</div>
      <h4>${node.title}</h4>
      <p>${node.content}</p>
      <div class="node-actions" style="display: none;">
        <button class="ghost-btn edit-btn">Edit</button>
        <button class="ghost-btn link-btn">Link</button>
        <button class="ghost-btn delete-btn">Delete</button>
      </div>
    `;

    nodeEl.addEventListener("pointerdown", (e) => {
      if (e.target.closest('button')) return;

      const rect = nodeEl.getBoundingClientRect();
      const isResize = e.clientX - rect.left > rect.width - 20 && e.clientY - rect.top > rect.height - 20;
      if (isResize) return; // Allow default resize behavior

      e.preventDefault();
      nodeEl.setPointerCapture(e.pointerId);
      state.draggedNodeId = node.id;

      const boardRect = document.querySelector("#node-board").getBoundingClientRect();

      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      let moved = false;
      const startX = e.clientX;
      const startY = e.clientY;

      function onPointerMove(moveEvent) {
        if (state.draggedNodeId !== node.id) return;

        if (Math.abs(moveEvent.clientX - startX) > 3 || Math.abs(moveEvent.clientY - startY) > 3) {
          moved = true;
        }

        const newX = (moveEvent.clientX - boardRect.left - state.canvasTransform.x - offsetX) / state.canvasTransform.scale;
        const newY = (moveEvent.clientY - boardRect.top - state.canvasTransform.y - offsetY) / state.canvasTransform.scale;

        node.x = newX;
        node.y = newY;

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

          if (!moved) {
            const actions = nodeEl.querySelector(".node-actions");
            if (actions.style.display === "none") {
              actions.style.display = "flex";
            } else {
              actions.style.display = "none";
            }
          }
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

    nodeEl.querySelector(".edit-btn").addEventListener("click", () => {
      window.editingNodeId = node.id;
      const form = document.querySelector("#node-form");
      form.type.value = node.type;
      const typeSelect = document.querySelector("#node-type-select");
      if (typeSelect) typeSelect.dispatchEvent(new Event("change"));

      if (node.type === "paper") {
        form.paperId.value = node.paperId || "";
      } else {
        form.title.value = node.title;
        form.content.value = node.content;
      }

      document.querySelector("#node-dialog h3").textContent = "Edit Node";
      document.querySelector("#node-dialog").showModal();
    });

    nodeEl.querySelector(".delete-btn").addEventListener("click", () => {
      state.nodes = state.nodes.filter((item) => item.id !== node.id);
      state.links = state.links.filter((item) => item.from !== node.id && item.to !== node.id);
      if (state.selectedNodeForLink === node.id) state.selectedNodeForLink = null;
      saveState();
      renderNodes();
      renderLinks();
    });

    nodeResizeObserver.observe(nodeEl);
    canvas.appendChild(nodeEl);
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

  layer.removeAttribute("viewBox");
}

function setupCanvasPanZoom() {
  const board = document.querySelector("#node-board");
  if (!board) return;

  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let initialTx = 0;
  let initialTy = 0;

  board.addEventListener("pointerdown", (e) => {
    if (e.target.closest('.map-node') || e.target.closest('button')) return;

    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    initialTx = state.canvasTransform.x;
    initialTy = state.canvasTransform.y;
    board.setPointerCapture(e.pointerId);
  });

  board.addEventListener("pointermove", (e) => {
    if (!isPanning) return;
    state.canvasTransform.x = initialTx + (e.clientX - startX);
    state.canvasTransform.y = initialTy + (e.clientY - startY);
    applyCanvasTransform();
  });

  board.addEventListener("pointerup", (e) => {
    if (!isPanning) return;
    isPanning = false;
    board.releasePointerCapture(e.pointerId);
    saveState();
  });

  board.addEventListener("wheel", (e) => {
    e.preventDefault();

    const boardRect = board.getBoundingClientRect();
    const mouseX = e.clientX - boardRect.left;
    const mouseY = e.clientY - boardRect.top;

    const zoomIntensity = 0.001;
    const delta = e.deltaY * zoomIntensity;

    let newScale = state.canvasTransform.scale * (1 - delta);
    newScale = Math.min(Math.max(0.1, newScale), 5); // clamp scale

    const ratio = 1 - newScale / state.canvasTransform.scale;
    state.canvasTransform.x += (mouseX - state.canvasTransform.x) * ratio;
    state.canvasTransform.y += (mouseY - state.canvasTransform.y) * ratio;
    state.canvasTransform.scale = newScale;

    applyCanvasTransform();
    saveState();
  }, { passive: false });
}

function centerView() {
  if (state.nodes.length === 0) {
    state.canvasTransform = { x: 0, y: 0, scale: 1 };
  } else {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + 200); // approx node width
      maxY = Math.max(maxY, n.y + 100); // approx node height
    });

    const boardRect = document.querySelector("#node-board").getBoundingClientRect();
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    const cx = minX + contentWidth / 2;
    const cy = minY + contentHeight / 2;

    state.canvasTransform = {
      scale: 1,
      x: boardRect.width / 2 - cx,
      y: boardRect.height / 2 - cy
    };
  }
  applyCanvasTransform();
  saveState();
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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function setupDialogs() {
  const paperDialog = document.querySelector("#paper-dialog");
  const paperForm = document.querySelector("#paper-form");
  const fileInput = document.querySelector("#paper-file-input");
  const taskDialog = document.querySelector("#task-dialog");
  const taskForm = document.querySelector("#task-form");
  const termDialog = document.querySelector("#term-dialog");
  const termForm = document.querySelector("#term-form");
  const termPaperSelect = document.querySelector("#term-paper-select");

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
      const contentDiv = document.querySelector("#viewer-content");
      if (contentDiv.dataset.objectUrl) {
        URL.revokeObjectURL(contentDiv.dataset.objectUrl);
        delete contentDiv.dataset.objectUrl;
      }
      contentDiv.innerHTML = "";
      viewerDialog.close();
    });
  }

  paperForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
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
            await saveFileData(paper.id, fileDataUrl);
          }

          // Sync associated paper nodes
          state.nodes.forEach(n => {
            if (n.type === 'paper' && n.paperId === paper.id) {
              n.title = paper.title;
              n.content = `Authors: ${paper.authors}\nYear: ${paper.year}`;
            }
          });
        }
        window.editingPaperId = null;
      } else {
        const newPaper = {
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
        };
        state.papers.unshift(newPaper);
        state.selectedPaperId = newPaper.id;
        if (fileDataUrl) {
          await saveFileData(newPaper.id, fileDataUrl);
        }
      }
      saveState();
      renderPapers();
      renderNodes();
      renderLinks();
      renderTerms();
      paperForm.reset();
      paperDialog.close();
    } catch (err) {
      console.error("Error saving paper:", err);
      alert("Failed to save paper: " + err.message);
    }
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

  window.editingTermId = null;
  const addTermBtn = document.querySelector("#add-term-btn");
  if (addTermBtn) {
    addTermBtn.addEventListener("click", () => {
      window.editingTermId = null;
      termForm.reset();

      termPaperSelect.innerHTML = '<option value="">None</option>';
      state.papers.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.title;
        termPaperSelect.appendChild(opt);
      });

      document.querySelector("#term-dialog h3").textContent = "Add Term";
      termDialog.showModal();
    });
  }
  const cancelTermBtn = document.querySelector("#cancel-term-btn");
  if (cancelTermBtn) cancelTermBtn.addEventListener("click", () => termDialog.close());

  if (termForm) {
    termForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(termForm);

      if (window.editingTermId) {
        const term = state.terms.find((t) => t.id === window.editingTermId);
        if (term) {
          term.name = String(data.get("name") || "").trim();
          term.description = String(data.get("description") || "").trim();
          term.paperId = data.get("paperId") || null;
        }
        window.editingTermId = null;
      } else {
        state.terms.push({
          id: createId("term"),
          name: String(data.get("name") || "").trim(),
          description: String(data.get("description") || "").trim(),
          paperId: data.get("paperId") || null,
        });
      }
      saveState();
      renderTerms();
      termForm.reset();
      termDialog.close();
    });
  }

  const nodeDialog = document.querySelector("#node-dialog");
  const nodeForm = document.querySelector("#node-form");
  const typeSelect = document.querySelector("#node-type-select");
  const generalFields = document.querySelector("#general-node-fields");
  const paperFields = document.querySelector("#paper-node-fields");
  const paperSelect = document.querySelector("#node-paper-select");

  if (typeSelect) {
    typeSelect.addEventListener("change", () => {
      if (typeSelect.value === "paper") {
        generalFields.style.display = "none";
        paperFields.style.display = "flex";
        document.querySelector("#node-title-input").removeAttribute("required");

        paperSelect.innerHTML = state.papers.length ? '' : '<option value="">No papers available</option>';
        state.papers.forEach(p => {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.title;
          paperSelect.appendChild(opt);
        });
      } else {
        generalFields.style.display = "flex";
        paperFields.style.display = "none";
        document.querySelector("#node-title-input").setAttribute("required", "required");
      }
    });
  }

  window.editingNodeId = null;
  document.querySelector("#add-node-btn").addEventListener("click", () => {
    window.editingNodeId = null;
    nodeForm.reset();
    if (typeSelect) typeSelect.dispatchEvent(new Event("change"));
    document.querySelector("#node-dialog h3").textContent = "Add Node";
    nodeDialog.showModal();
  });
  document.querySelector("#cancel-node-btn").addEventListener("click", () => nodeDialog.close());

  nodeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(nodeForm);
    const type = data.get("type") || "general";
    let title = "";
    let content = "";
    let paperId = null;

    if (type === "paper") {
      paperId = data.get("paperId");
      if (!paperId) {
        alert("Please select a paper first");
        return;
      }
      const paper = state.papers.find(p => p.id === paperId);
      if (paper) {
        title = paper.title;
        content = `Authors: ${paper.authors}\nYear: ${paper.year}`;
      } else {
        title = "Unknown Paper";
      }
    } else {
      title = String(data.get("title") || "").trim();
      content = String(data.get("content") || "").trim();
    }

    if (window.editingNodeId) {
      const node = state.nodes.find(n => n.id === window.editingNodeId);
      if (node) {
        node.type = type;
        node.paperId = paperId;
        node.title = title;
        node.content = content;
      }
      window.editingNodeId = null;
    } else {
      state.nodes.push({
        id: createId("node"),
        type,
        paperId,
        title,
        content,
        x: 24 + (state.nodes.length % 4) * 170,
        y: 24 + (state.nodes.length % 3) * 110,
      });
    }

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

  const centerBtn = document.querySelector("#center-view-btn");
  if (centerBtn) {
    centerBtn.addEventListener("click", centerView);
  }

  const fullscreenBtn = document.querySelector("#fullscreen-btn");
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      const nodesPanel = document.querySelector("#nodes");
      if (!document.fullscreenElement) {
        nodesPanel.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable fullscreen mode: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    });
  }
}

function setupNodeTools() {
  // Handled in setupDialogs
}

function setupBackupButtons() {
  document.querySelector("#export-state-btn").addEventListener("click", async () => {
    // Include file data from IndexedDB in the backup
    const papersWithFiles = await Promise.all(state.papers.map(async (p) => {
      if (p.fileName) {
        try {
          const fileDataUrl = await loadFileData(p.id);
          return { ...p, fileDataUrl };
        } catch { return { ...p }; }
      }
      return { ...p };
    }));
    const backup = {
      papers: papersWithFiles,
      tasks: state.tasks,
      nodes: state.nodes,
      links: state.links,
      terms: state.terms,
      reports: state.reports,
      canvasTransform: state.canvasTransform,
    };
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
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
      // Restore file data to IndexedDB and strip from localStorage
      for (const paper of parsed.papers) {
        if (paper.fileDataUrl) {
          await saveFileData(paper.id, paper.fileDataUrl);
        }
      }
      // Strip fileDataUrl before saving to localStorage
      const papersForStorage = parsed.papers.map(p => {
        const { fileDataUrl, ...rest } = p;
        return rest;
      });
      parsed.papers = papersForStorage;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      loadState();
      await loadFileDataForPapers();
      renderPapers();
      renderTasks();
      renderNodes();
      renderLinks();
      renderTerms();
    } catch (e) {
      console.error("Import error:", e);
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

// --- Reports & Findings Module ---
const SECTION_TYPES = {
  custom: "Custom", title: "Title Page", background: "Project Background",
  problem: "Problem Statement", objectives: "Objectives", scope: "Scope",
  literature: "Literature Review", methodology: "Methodology",
  findings: "Findings & Results", discussion: "Discussion",
  conclusion: "Conclusion", references: "References", appendix: "Appendix",
};

const SECTION_PLACEHOLDERS = {
  title: "Enter your project title, student name, supervisor, university, date...",
  background: "Describe the context and background of your project...",
  problem: "What problem does your project address? Why is it important?",
  objectives: "List the objectives of your project...\n\n1. \n2. \n3. ",
  scope: "Define the boundaries and limitations of your project...",
  literature: "Summarize and analyze existing research relevant to your project...",
  methodology: "Describe the methods and approaches used in your research...",
  findings: "Present your findings and results...",
  discussion: "Interpret your results and discuss their implications...",
  conclusion: "Summarize your findings and suggest future work...",
  references: "List all references in proper format...\n\n[1] \n[2] ",
  appendix: "Include supplementary materials here...",
  custom: "Start writing...",
};

let reportSaveTimers = {};
let activeEditor = null;
let activeCitation = null;
let savedRange = null;

function renderReportList() {
  const listEl = document.querySelector("#report-list");
  const searchInput = document.querySelector("#report-search");
  if (!listEl) return;
  const query = searchInput ? searchInput.value.toLowerCase() : "";
  listEl.innerHTML = "";

  const filtered = state.reports.filter(r => r.title.toLowerCase().includes(query));
  if (filtered.length === 0) {
    listEl.innerHTML = `<p class="empty-state">${state.reports.length === 0 ? "No reports yet. Create your first one." : "No matching reports."}</p>`;
    return;
  }

  for (const report of filtered) {
    const item = document.createElement("div");
    item.className = `report-list-item${report.id === state.selectedReportId ? " active" : ""}`;
    const secCount = report.sections ? report.sections.length : 0;
    const updated = report.updatedAt ? new Date(report.updatedAt).toLocaleDateString() : "";
    item.innerHTML = `
      <h4>${report.title}</h4>
      <div class="report-meta">
        <span>${updated}</span>
        <span class="report-sections-count">${secCount} section${secCount !== 1 ? "s" : ""}</span>
      </div>
      <button class="report-delete-btn" title="Delete report">×</button>
    `;
    item.addEventListener("click", (e) => {
      if (e.target.closest(".report-delete-btn")) return;
      state.selectedReportId = report.id;
      renderReportList();
      renderReportEditor();
    });
    item.querySelector(".report-delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm(`Delete "${report.title}"?`)) return;
      state.reports = state.reports.filter(r => r.id !== report.id);
      if (state.selectedReportId === report.id) state.selectedReportId = null;
      saveState();
      renderReportList();
      renderReportEditor();
    });
    listEl.appendChild(item);
  }
}

function renderReportEditor() {
  const editorEl = document.querySelector("#report-editor");
  if (!editorEl) return;
  const report = state.reports.find(r => r.id === state.selectedReportId);
  if (!report) {
    editorEl.className = "report-editor-empty";
    editorEl.innerHTML = `<div class="report-empty-state"><div class="report-empty-icon">📝</div><h3>Select or create a report</h3><p>Your drafts for chapters, proposals, and findings live here.</p></div>`;
    return;
  }
  editorEl.className = "report-editor-active";
  const lastSaved = report.updatedAt ? new Date(report.updatedAt).toLocaleString() : "Never";
  editorEl.innerHTML = `
    <div class="report-editor-toolbar">
      <h3>${report.title}</h3>
      <div class="report-editor-toolbar-actions">
        <span class="report-last-saved"><span class="save-dot"></span> Saved: ${lastSaved}</span>
        <button class="ghost-btn" id="rename-report-btn" style="padding:0.35rem 0.7rem;font-size:0.85rem;">Rename</button>
        <button class="primary-btn" id="add-section-btn" style="padding:0.35rem 0.7rem;font-size:0.85rem;">+ Section</button>
      </div>
    </div>
    ${report.description ? `<div class="report-editor-desc">${report.description}</div>` : ""}
    <div class="report-sections-container" id="report-sections-container"></div>
  `;

  const container = editorEl.querySelector("#report-sections-container");
  if (!report.sections || report.sections.length === 0) {
    container.innerHTML = `<p class="empty-state">No sections yet. Click "+ Section" to add one.</p>`;
  } else {
    for (let i = 0; i < report.sections.length; i++) {
      container.appendChild(createSectionCard(report, report.sections[i], i));
    }
  }

  editorEl.querySelector("#add-section-btn").addEventListener("click", () => {
    const form = document.querySelector("#section-form");
    form.reset();
    document.querySelector("#section-dialog h3").textContent = "Add Section";
    document.querySelector("#section-type-select").dispatchEvent(new Event("change"));
    document.querySelector("#section-dialog").showModal();
  });

  editorEl.querySelector("#rename-report-btn").addEventListener("click", () => {
    const newTitle = prompt("Rename report:", report.title);
    if (newTitle && newTitle.trim()) {
      report.title = newTitle.trim();
      report.updatedAt = Date.now();
      saveState();
      renderReportList();
      renderReportEditor();
    }
  });
}

function createSectionCard(report, section, index) {
  const card = document.createElement("div");
  card.className = `report-section-card${section.collapsed ? " collapsed" : ""}`;
  card.draggable = true;
  card.dataset.sectionIndex = index;
  const wordCount = section.content ? section.content.trim().split(/\s+/).filter(w => w).length : 0;
  const typeLabel = SECTION_TYPES[section.type] || section.type;
  const placeholder = SECTION_PLACEHOLDERS[section.type] || "Start writing...";

  card.innerHTML = `
    <div class="section-header">
      <div class="section-header-left">
        <span class="section-drag-handle">☰</span>
        <span class="section-type-badge">${typeLabel}</span>
        <span class="section-title-display">${section.title}</span>
      </div>
      <div class="section-header-actions">
        <button class="section-cite-btn" title="Add citation">Cite</button>
        <button class="section-collapse-btn" title="Collapse/Expand">▼</button>
        <button class="section-rename-btn" title="Rename">✎</button>
        <button class="section-delete-btn" title="Delete">×</button>
      </div>
    </div>
    <div class="section-body">
      <div class="section-editor" contenteditable="true" placeholder="${placeholder}">${section.content || ""}</div>
    </div>
    <div class="section-footer">
      <span class="section-word-count">${wordCount} word${wordCount !== 1 ? "s" : ""}</span>
      <span class="section-save-indicator">✓ Saved</span>
    </div>
  `;

  // Auto-save on input with debounce
  const editor = card.querySelector(".section-editor");
  const wordCountEl = card.querySelector(".section-word-count");
  const saveIndicator = card.querySelector(".section-save-indicator");
  editor.addEventListener("input", () => {
    section.content = editor.innerHTML;
    const text = editor.innerText || "";
    const wc = text.trim().split(/\s+/).filter(w => w).length;
    wordCountEl.textContent = `${wc} word${wc !== 1 ? "s" : ""}`;
    clearTimeout(reportSaveTimers[section.id]);
    reportSaveTimers[section.id] = setTimeout(() => {
      report.updatedAt = Date.now();
      saveState();
      saveIndicator.classList.add("visible");
      setTimeout(() => saveIndicator.classList.remove("visible"), 1500);
      const savedSpan = document.querySelector(".report-last-saved");
      if (savedSpan) savedSpan.innerHTML = `<span class="save-dot"></span> Saved: ${new Date(report.updatedAt).toLocaleString()}`;
    }, 600);
  });

  // Handle citation clicks
  editor.addEventListener("click", (e) => {
    const citation = e.target.closest(".citation-link");
    if (citation) {
      openCitationDetail(citation);
    }
  });

  // Prevent rich text pasting
  editor.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  });

  card.querySelector(".section-cite-btn").addEventListener("mousedown", () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      savedRange = selection.getRangeAt(0);
    }
  });

  card.querySelector(".section-cite-btn").addEventListener("click", () => {
    openCitationPicker(editor);
  });

  card.querySelector(".section-collapse-btn").addEventListener("click", () => {
    section.collapsed = !section.collapsed;
    card.classList.toggle("collapsed", section.collapsed);
    saveState();
  });

  card.querySelector(".section-rename-btn").addEventListener("click", () => {
    const newTitle = prompt("Section title:", section.title);
    if (newTitle && newTitle.trim()) {
      section.title = newTitle.trim();
      report.updatedAt = Date.now();
      saveState();
      renderReportEditor();
    }
  });

  card.querySelector(".section-delete-btn").addEventListener("click", () => {
    if (!confirm(`Delete section "${section.title}"?`)) return;
    report.sections = report.sections.filter(s => s.id !== section.id);
    report.updatedAt = Date.now();
    saveState();
    renderReportEditor();
  });

  // Drag-to-reorder
  card.addEventListener("dragstart", (e) => {
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));
  card.addEventListener("dragover", (e) => { e.preventDefault(); card.classList.add("drag-over"); });
  card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    card.classList.remove("drag-over");
    const fromIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
    const toIdx = index;
    if (fromIdx === toIdx || isNaN(fromIdx)) return;
    const [moved] = report.sections.splice(fromIdx, 1);
    report.sections.splice(toIdx, 0, moved);
    report.updatedAt = Date.now();
    saveState();
    renderReportEditor();
  });

  return card;
}

function setupReportDialogs() {
  const reportDialog = document.querySelector("#report-dialog");
  const reportForm = document.querySelector("#report-form");
  const sectionDialog = document.querySelector("#section-dialog");
  const sectionForm = document.querySelector("#section-form");
  const sectionTypeSelect = document.querySelector("#section-type-select");
  const customTitleLabel = document.querySelector("#section-custom-title-label");
  if (!reportDialog) return;

  document.querySelector("#add-report-btn").addEventListener("click", () => {
    reportForm.reset();
    document.querySelector("#report-dialog h3").textContent = "New Report";
    reportDialog.showModal();
  });
  document.querySelector("#cancel-report-btn").addEventListener("click", () => reportDialog.close());

  reportForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(reportForm);
    const newReport = {
      id: createId("report"),
      title: String(data.get("title") || "").trim(),
      description: String(data.get("description") || "").trim(),
      sections: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.reports.unshift(newReport);
    state.selectedReportId = newReport.id;
    saveState();
    renderReportList();
    renderReportEditor();
    reportForm.reset();
    reportDialog.close();
  });

  if (sectionTypeSelect) {
    sectionTypeSelect.addEventListener("change", () => {
      const isCustom = sectionTypeSelect.value === "custom";
      customTitleLabel.style.display = isCustom ? "flex" : "flex";
      const input = customTitleLabel.querySelector("input");
      if (!isCustom) input.value = SECTION_TYPES[sectionTypeSelect.value] || "";
    });
  }

  document.querySelector("#cancel-section-btn").addEventListener("click", () => sectionDialog.close());

  sectionForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const report = state.reports.find(r => r.id === state.selectedReportId);
    if (!report) return;
    const data = new FormData(sectionForm);
    const type = data.get("type") || "custom";
    let title = String(data.get("customTitle") || "").trim();
    if (!title) title = SECTION_TYPES[type] || "Untitled Section";
    if (!report.sections) report.sections = [];
    report.sections.push({
      id: createId("sec"),
      type,
      title,
      content: "",
      collapsed: false,
    });
    report.updatedAt = Date.now();
    saveState();
    renderReportList();
    renderReportEditor();
    sectionForm.reset();
    sectionDialog.close();
  });
}

function setupCitationLogic() {
  const pickerDialog = document.querySelector("#citation-picker-dialog");
  const detailDialog = document.querySelector("#citation-detail-dialog");
  const searchInput = document.querySelector("#citation-search");
  const paperList = document.querySelector("#citation-paper-list");
  
  if (!pickerDialog) return;

  searchInput.addEventListener("input", () => renderCitationPapers(searchInput.value));

  document.querySelector("#close-citation-picker").addEventListener("click", () => pickerDialog.close());
  document.querySelector("#close-citation-detail").addEventListener("click", () => detailDialog.close());

  document.querySelector("#remove-citation-btn").addEventListener("click", () => {
    if (activeCitation) {
      const editor = activeCitation.closest(".section-editor");
      activeCitation.remove();
      if (editor) editor.dispatchEvent(new Event("input"));
      detailDialog.close();
      activeCitation = null;
    }
  });
}

function renderCitationPapers(query = "") {
  const paperList = document.querySelector("#citation-paper-list");
  paperList.innerHTML = "";
  const filtered = state.papers.filter(p => 
    p.title.toLowerCase().includes(query.toLowerCase()) || 
    p.authors.toLowerCase().includes(query.toLowerCase())
  );

  if (filtered.length === 0) {
    paperList.innerHTML = `<p class="empty-state">No papers found.</p>`;
    return;
  }

  filtered.forEach(paper => {
    const item = document.createElement("div");
    item.className = "report-list-item";
    item.innerHTML = `
      <h4>${paper.title}</h4>
      <div class="report-meta">
        <span>${paper.authors} (${paper.year})</span>
      </div>
    `;
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      console.log("Paper item clicked:", paper.title);
      insertCitation(paper);
    });
    paperList.appendChild(item);
  });
}

function openCitationPicker(editor) {
  console.log("Opening citation picker for editor:", editor);
  activeEditor = editor;
  
  // If range wasn't captured by mousedown, try one last time
  if (!savedRange) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      savedRange = selection.getRangeAt(0);
    }
  }

  document.querySelector("#citation-search").value = "";
  renderCitationPapers();
  const dialog = document.querySelector("#citation-picker-dialog");
  if (dialog) dialog.showModal();
}

function insertCitation(paper) {
  console.log("Attempting to insert citation for:", paper.title);
  const pickerDialog = document.querySelector("#citation-picker-dialog");
  if (pickerDialog) pickerDialog.close();

  if (!activeEditor) {
    console.error("Citation Error: No active editor found.");
    return;
  }

  const author = paper.authors && paper.authors.trim() 
    ? paper.authors.split(",")[0].trim().split(" ").pop() 
    : "Unknown";
  const citationHtml = `<span class="citation-link" contenteditable="false" data-paper-id="${paper.id}">(${author}, ${paper.year})</span>&nbsp;`;
  
  activeEditor.focus();
  
  let inserted = false;
  if (savedRange) {
    try {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedRange);
      inserted = document.execCommand("insertHTML", false, citationHtml);
    } catch (e) {
      console.warn("execCommand insertHTML failed:", e);
    }
  }

  if (!inserted) {
    console.log("Using fallback insertion (append)");
    activeEditor.innerHTML += citationHtml;
  }
  
  activeEditor.dispatchEvent(new Event("input"));
  savedRange = null;
}

function openCitationDetail(citationEl) {
  activeCitation = citationEl;
  const paperId = citationEl.dataset.paperId;
  const paper = state.papers.find(p => p.id === paperId);
  const content = document.querySelector("#citation-detail-content");
  
  if (paper) {
    content.innerHTML = `
      <p><strong>Title:</strong> ${paper.title}</p>
      <p><strong>Authors:</strong> ${paper.authors}</p>
      <p><strong>Year:</strong> ${paper.year}</p>
      <p><strong>Labels:</strong> ${paper.labels ? paper.labels.join(", ") : "None"}</p>
    `;
  } else {
    content.innerHTML = `<p>Paper details not found. It may have been deleted.</p>`;
  }
  
  document.querySelector("#citation-detail-dialog").showModal();
}

window.addEventListener("resize", renderLinks);

window.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  loadState();
  await loadFileDataForPapers();
  setupDialogs();
  setupReportDialogs();
  setupCitationLogic();
  setupKanbanDropzones();
  setupCanvasPanZoom();
  setupNodeBoardDnD();
  setupNodeTools();
  setupBackupButtons();
  renderPapers();
  renderTasks();
  renderNodes();
  renderLinks();
  renderTerms();
  renderReportList();
  renderReportEditor();
  applyCanvasTransform();
  renderDashboard();
  setupPomodoro();

  const searchInput = document.querySelector("#paper-search");
  if (searchInput) {
    searchInput.addEventListener("input", renderPapers);
  }

  const viewToggle = document.querySelectorAll('#paper-view-toggle button');
  viewToggle.forEach((button) => {
    button.addEventListener('click', () => setPaperViewMode(button.dataset.view));
  });
  setPaperViewMode(state.paperListView);

  const termSearchInput = document.querySelector("#term-search");
  if (termSearchInput) {
    termSearchInput.addEventListener("input", renderTerms);
  }

  const reportSearchInput = document.querySelector("#report-search");
  if (reportSearchInput) {
    reportSearchInput.addEventListener("input", renderReportList);
  }
});
