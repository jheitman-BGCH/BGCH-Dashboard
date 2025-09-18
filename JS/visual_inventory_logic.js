// JS/visual_inventory_logic.js

// --- STATE ---
let viState = {
    activeRoomId: null,
    activeParentId: null, // Can be a Room ID or an Instance ID
    breadcrumbs: [],
    selectedInstanceId: null,
};

// --- DOM REFERENCES & FLAGS ---
let vi = {};
let viListenersInitialized = false; // Flag to ensure listeners are only attached once

// --- INITIALIZATION ---
function setupAndBindVisualInventory() {
    // This entire setup runs only once.
    if (viListenersInitialized) return true;

    // 1. Find all DOM elements and store them.
    vi.roomSelector = document.getElementById('room-selector');
    vi.gridContainer = document.getElementById('room-grid-container');
    vi.createRoomBtn = document.getElementById('create-room-btn');
    vi.roomModal = document.getElementById('room-modal');
    vi.roomForm = document.getElementById('room-form');
    vi.objectToolbar = document.getElementById('object-toolbar');
    vi.breadcrumbContainer = document.getElementById('breadcrumb-container');

    // 2. Validate that all critical elements were found.
    const criticalElements = [vi.gridContainer, vi.roomSelector, vi.createRoomBtn, vi.roomModal, vi.roomForm];
    if (criticalElements.some(el => !el)) {
        console.error("Fatal Error: A critical VI DOM element is missing. Initialization aborted.");
        return false; // Indicate failure to prevent crashes.
    }

    // 3. If validation passes, attach all event listeners.
    vi.createRoomBtn.addEventListener('click', () => {
        vi.roomForm.reset();
        document.getElementById('room-id-hidden').value = '';
        toggleModal(vi.roomModal, true);
    });

    vi.roomModal.querySelector('.modal-backdrop').addEventListener('click', () => toggleModal(vi.roomModal, false));
    vi.roomModal.querySelector('#cancel-room-btn').addEventListener('click', () => toggleModal(vi.roomModal, false));

    vi.roomForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const roomData = {
            "Room ID": `ROOM-${Date.now()}`,
            "Room Name": document.getElementById('room-name').value,
            "Grid Width": document.getElementById('grid-width').value,
            "Grid Height": document.getElementById('grid-height').value,
            "Notes": document.getElementById('room-notes').value,
        };

        await appendRowToSheet(ROOMS_SHEET, ROOMS_HEADERS, roomData);
        toggleModal(vi.roomModal, false);
        await loadAllSheetData(); // Refresh all data after adding
        vi.roomSelector.value = roomData["Room ID"];
        navigateTo(roomData["Room ID"], roomData["Room Name"]);
    });

    vi.roomSelector.addEventListener('change', (e) => {
        if (e.target.value) {
            const room = allRooms.find(r => r["Room ID"] === e.target.value);
            if (room) {
                navigateTo(room["Room ID"], room["Room Name"]);
            }
        } else {
            viState.activeParentId = null;
            renderGrid();
        }
    });

    document.querySelectorAll('.toolbar-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            const data = {
                type: 'new',
                assetType: item.dataset.assetType,
                name: item.dataset.name,
                width: parseInt(item.dataset.width),
                height: parseInt(item.dataset.height),
                shelfRows: parseInt(item.dataset.shelfRows) || null,
                shelfCols: parseInt(item.dataset.shelfCols) || null,
            };
            e.dataTransfer.setData('application/json', JSON.stringify(data));
        });
    });

    vi.gridContainer.addEventListener('dragover', (e) => {
        e.preventDefault(); // Necessary to allow dropping
    });
    
    // Deselect object when clicking on the grid background
    vi.gridContainer.addEventListener('click', (e) => {
        if (e.target === vi.gridContainer || e.target === vi.roomGrid) {
            selectObject(null); // Pass null to deselect everything
        }
    });


    vi.gridContainer.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (!e.dataTransfer.getData('application/json') || !vi.roomGrid) return;

        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        const rect = vi.roomGrid.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const gridStyle = getComputedStyle(vi.roomGrid);
        const colCount = gridStyle.gridTemplateColumns.split(' ').length;
        const rowCount = gridStyle.gridTemplateRows.split(' ').length;

        const cellWidth = rect.width / colCount;
        const cellHeight = rect.height / rowCount;

        const gridX = Math.min(colCount - 1, Math.max(0, Math.floor(x / cellWidth)));
        const gridY = Math.min(rowCount - 1, Math.max(0, Math.floor(y / cellHeight)));

        if (data.type === 'new') {
            await handleNewObjectDrop(data, gridX, gridY);
        } else if (data.type === 'move') {
            const instance = spatialLayoutData.find(d => d["Instance ID"] === data.instanceId);
            if (instance) {
                const updates = { "Pos X": gridX, "Pos Y": gridY };
                await handleObjectUpdate(data.instanceId, updates);
            }
        }
    });

    viListenersInitialized = true;
    console.log("Visual Inventory event listeners initialized successfully.");
    return true;
}


function initVisualInventory() {
    console.log("Attempting to initialize Visual Inventory...");

    if (!setupAndBindVisualInventory()) {
        return;
    }

    populateRoomSelector();

    const lastRoom = localStorage.getItem('lastActiveRoomId');
    if (lastRoom && allRooms.some(r => r["Room ID"] === lastRoom)) {
        vi.roomSelector.value = lastRoom;
        const room = allRooms.find(r => r["Room ID"] === lastRoom);
        if (room) {
            navigateTo(room["Room ID"], room["Room Name"]);
        }
    } else if (allRooms.length > 0) {
        // Default to the first room if no last room is set
        vi.roomSelector.value = allRooms[0]["Room ID"];
        navigateTo(allRooms[0]["Room ID"], allRooms[0]["Room Name"]);
    }
    else {
        renderGrid(); // Shows "Please select a room"
    }
}

// --- NAVIGATION & RENDERING ---
function navigateTo(id, name) {
    selectObject(null); // Deselect any selected object when navigating
    if (id.startsWith('ROOM-')) {
        viState.activeRoomId = id;
        viState.activeParentId = id;
        viState.breadcrumbs = [{ id, name }];
    } else {
        viState.activeParentId = id;
        const existingIndex = viState.breadcrumbs.findIndex(b => b.id === id);
        if (existingIndex > -1) {
            viState.breadcrumbs = viState.breadcrumbs.slice(0, existingIndex + 1);
        } else {
            viState.breadcrumbs.push({ id, name });
        }
    }
    localStorage.setItem('lastActiveRoomId', viState.activeRoomId);
    if (vi.roomSelector.value !== viState.activeRoomId) {
         vi.roomSelector.value = viState.activeRoomId;
    }
    renderGrid();
    renderBreadcrumbs();
}

function renderBreadcrumbs() {
    if (!vi.breadcrumbContainer) return;
    vi.breadcrumbContainer.innerHTML = '';
    viState.breadcrumbs.forEach((crumb, index) => {
        const crumbEl = document.createElement('span');
        if (index < viState.breadcrumbs.length - 1) {
            const anchor = document.createElement('a');
            anchor.href = '#';
            anchor.textContent = crumb.name;
            anchor.className = 'hover:underline text-indigo-600';
            anchor.onclick = (e) => {
                e.preventDefault();
                navigateTo(crumb.id, crumb.name);
            };
            crumbEl.appendChild(anchor);
            const separator = document.createElement('span');
            separator.textContent = ' / ';
            separator.className = 'mx-2 text-gray-500';
            crumbEl.appendChild(separator);
        } else {
            crumbEl.textContent = crumb.name;
            crumbEl.className = 'font-semibold text-gray-700';
        }
        vi.breadcrumbContainer.appendChild(crumbEl);
    });
}

function renderGrid() {
    if (!vi.gridContainer) return;

    if (!viState.activeParentId) {
        vi.gridContainer.innerHTML = '<div id="room-grid" class="flex items-center justify-center h-full"><p class="text-gray-500">Please select or create a room to begin.</p></div>';
        return;
    }

    vi.gridContainer.innerHTML = '<div id="room-grid"></div>';
    vi.roomGrid = document.getElementById('room-grid');

    let parentObject;
    let gridWidth, gridHeight;

    if (viState.activeParentId.startsWith('ROOM-')) {
        parentObject = allRooms.find(r => r["Room ID"] === viState.activeParentId);
        if (!parentObject) return;
        gridWidth = parentObject["Grid Width"] || 10;
        gridHeight = parentObject["Grid Height"] || 10;
    } else {
        parentObject = spatialLayoutData.find(o => o["Instance ID"] === viState.activeParentId);
        if (!parentObject) return;
        gridWidth = parentObject["Orientation"] === 'Vertical' ? parentObject["Shelf Cols"] : parentObject["Shelf Rows"];
        gridHeight = parentObject["Orientation"] === 'Vertical' ? parentObject["Shelf Rows"] : parentObject["Shelf Cols"];
    }
    
    // --- FIX 1: Correctly size the grid and its visual background ---
    vi.roomGrid.style.gridTemplateColumns = `repeat(${gridWidth}, 1fr)`;
    vi.roomGrid.style.gridTemplateRows = `repeat(${gridHeight}, 1fr)`;
    vi.roomGrid.style.backgroundSize = `calc(100% / ${gridWidth}) calc(100% / ${gridHeight})`;
    // --- END FIX 1 ---

    const childObjects = spatialLayoutData.filter(obj => obj["Parent ID"] === viState.activeParentId);
    childObjects.forEach(obj => renderObject(obj, vi.roomGrid));
}

function renderObject(objectData, parentGrid) {
    const assetInfo = getAssetByRefId(objectData["Reference ID"]);
    if (!assetInfo) return;

    const objEl = document.createElement('div');
    objEl.className = 'visual-object flex items-center justify-center p-1 select-none';
    objEl.dataset.instanceId = objectData["Instance ID"];
    objEl.setAttribute('draggable', 'true');

    if (viState.selectedInstanceId === objectData["Instance ID"]) {
        objEl.classList.add('selected');
        addControlsToObject(objEl, objectData);
    }

    const typeClass = assetInfo["Asset Type"] === 'Shelf' ? 'shelf' : (assetInfo["Asset Type"] === 'Container' ? 'container' : 'asset-item');
    objEl.classList.add(typeClass);

    const isVertical = objectData["Orientation"] === 'Vertical';
    const width = isVertical ? objectData["Height"] : objectData["Width"];
    const height = isVertical ? objectData["Width"] : objectData["Height"];

    objEl.style.gridColumn = `${parseInt(objectData["Pos X"]) + 1} / span ${width}`;
    objEl.style.gridRow = `${parseInt(objectData["Pos Y"]) + 1} / span ${height}`;
    objEl.innerHTML = `<span class="truncate pointer-events-none">${assetInfo["Asset Name"]}</span>`;

    objEl.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'move', instanceId: objectData["Instance ID"] }));
        e.stopPropagation();
    });
    
    // --- FEATURE 3: SELECTION & NAVIGATION ---
    objEl.addEventListener('click', (e) => {
        e.stopPropagation();
        selectObject(objEl, objectData);
    });

    if (typeClass === 'shelf' || typeClass === 'container') {
        objEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            navigateTo(objectData["Instance ID"], assetInfo["Asset Name"]);
        });
    }
    // --- END FEATURE 3 ---

    parentGrid.appendChild(objEl);
}

// --- UI POPULATION & HELPERS ---
function populateRoomSelector() {
    if (!vi.roomSelector) return;
    const currentValue = vi.roomSelector.value;
    vi.roomSelector.innerHTML = '<option value="">-- Select a Room --</option>';
    allRooms.sort((a,b) => a["Room Name"].localeCompare(b["Room Name"])).forEach(room => {
        const option = document.createElement('option');
        option.value = room["Room ID"];
        option.textContent = room["Room Name"];
        vi.roomSelector.appendChild(option);
    });
    vi.roomSelector.value = currentValue;
}

function getAssetByRefId(refId) {
    return allAssets.find(a => a["Asset ID"] === refId);
}

// --- EVENT HANDLERS & ACTIONS ---
async function handleNewObjectDrop(data, gridX, gridY) {
    if (!viState.activeParentId) {
        showMessage("Cannot add an object without a selected room or container.");
        return;
    }

    const newAsset = {
        "Asset ID": `ASSET-${Date.now()}`,
        "Asset Name": data.name,
        "Asset Type": data.assetType,
        "Condition": "New",
    };
    await appendRowToSheet(ASSET_SHEET, ASSET_HEADERS, newAsset);

    const newInstance = {
        "Instance ID": `INST-${Date.now()}`,
        "Reference ID": newAsset["Asset ID"],
        "Parent ID": viState.activeParentId,
        "Pos X": gridX,
        "Pos Y": gridY,
        "Width": data.width,
        "Height": data.height,
        "Orientation": "Horizontal",
        "Shelf Rows": data.shelfRows,
        "Shelf Cols": data.shelfCols,
    };
    const newRowIndex = await appendRowToSheet(SPATIAL_LAYOUT_SHEET, SPATIAL_LAYOUT_HEADERS, newInstance);

    if (newRowIndex) {
        newInstance.rowIndex = newRowIndex;
    } else {
        console.error("Could not determine new row index from API. A full refresh may be needed to move this item again.");
        // Fallback to estimating the row index to prevent immediate errors, though it might be inaccurate.
        newInstance.rowIndex = spatialLayoutData.length > 0 
            ? Math.max(...spatialLayoutData.map(d => d.rowIndex)) + 1
            : 2;
    }


    // --- FIX 2: Update local cache for immediate feedback ---
    allAssets.push(newAsset);
    spatialLayoutData.push(newInstance);
    renderGrid();
    // --- END FIX 2 ---
}

function selectObject(element, data) {
    const previouslySelected = document.querySelector('.visual-object.selected');
    if (previouslySelected) {
        previouslySelected.classList.remove('selected');
        const oldControls = previouslySelected.querySelector('.object-controls');
        if (oldControls) oldControls.remove();
    }

    if (element && data) {
        viState.selectedInstanceId = data["Instance ID"];
        element.classList.add('selected');
        addControlsToObject(element, data);
    } else {
        viState.selectedInstanceId = null;
    }
}

// --- FEATURE 3: OBJECT CONTROLS ---
function addControlsToObject(element, data) {
    const controls = document.createElement('div');
    controls.className = 'object-controls';
    
    // Rotate Button
    const rotateBtn = document.createElement('button');
    rotateBtn.className = 'control-btn rotate-btn';
    rotateBtn.innerHTML = '&#x21bb;'; // Rotate icon
    rotateBtn.title = "Rotate";
    rotateBtn.onclick = async (e) => {
        e.stopPropagation();
        const newOrientation = data["Orientation"] === 'Horizontal' ? 'Vertical' : 'Horizontal';
        await handleObjectUpdate(data["Instance ID"], { "Orientation": newOrientation });
    };

    // Delete Button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'control-btn delete-btn';
    deleteBtn.innerHTML = '&times;'; // 'X' icon
    deleteBtn.title = "Delete";
    deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this item? This cannot be undone.")) {
            await handleObjectDelete(data["Instance ID"]);
        }
    };
    
    // Resizing buttons
    const createResizeBtn = (text, title, dimension, delta) => {
        const btn = document.createElement('button');
        btn.className = `control-btn resize-btn ${title.toLowerCase().replace(' ','-')}`;
        btn.innerHTML = text;
        btn.title = title;
        btn.onclick = async (e) => {
            e.stopPropagation();
            const newValue = Math.max(1, parseInt(data[dimension]) + delta);
            await handleObjectUpdate(data["Instance ID"], { [dimension]: newValue });
        };
        return btn;
    }

    controls.appendChild(rotateBtn);
    controls.appendChild(deleteBtn);
    controls.appendChild(createResizeBtn('-', 'Width Minus', 'Width', -1));
    controls.appendChild(createResizeBtn('+', 'Width Plus', 'Width', 1));
    controls.appendChild(createResizeBtn('-', 'Height Minus', 'Height', -1));
    controls.appendChild(createResizeBtn('+', 'Height Plus', 'Height', 1));

    element.appendChild(controls);
}

async function handleObjectUpdate(instanceId, updates) {
    const instanceIndex = spatialLayoutData.findIndex(d => d["Instance ID"] === instanceId);
    if (instanceIndex === -1) return;

    // Update local data for immediate UI response
    const updatedInstance = { ...spatialLayoutData[instanceIndex], ...updates };
    spatialLayoutData[instanceIndex] = updatedInstance;
    
    // Update the sheet in the background
    await updateRowInSheet(SPATIAL_LAYOUT_SHEET, updatedInstance.rowIndex, SPATIAL_LAYOUT_HEADERS, updatedInstance);
    
    // Re-render the grid from local data
    renderGrid();
}

async function handleObjectDelete(instanceId) {
    const instanceIndex = spatialLayoutData.findIndex(d => d["Instance ID"] === instanceId);
    if (instanceIndex === -1) return;
    
    const instanceToDelete = spatialLayoutData[instanceIndex];

    // Remove from local data
    spatialLayoutData.splice(instanceIndex, 1);
    viState.selectedInstanceId = null;

    // Delete from sheet
    await deleteRowFromSheet(SPATIAL_LAYOUT_SHEET, instanceToDelete.rowIndex);
    
    // Re-render
    renderGrid();
}
// --- END FEATURE 3 ---

