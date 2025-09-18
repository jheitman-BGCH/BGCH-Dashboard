// JS/visual_inventory_logic.js

// --- STATE ---
let viState = {
    activeRoomId: null,
    activeParentId: null, // Can be a Room ID or an Instance ID
    breadcrumbs: [],
};

// --- DOM REFERENCES ---
const vi = {
    roomSelector: document.getElementById('room-selector'),
    roomGrid: document.getElementById('room-grid'),
    gridContainer: document.getElementById('room-grid-container'),
    createRoomBtn: document.getElementById('create-room-btn'),
    roomModal: document.getElementById('room-modal'),
    roomForm: document.getElementById('room-form'),
    objectToolbar: document.getElementById('object-toolbar'),
    breadcrumbContainer: document.getElementById('breadcrumb-container'),
};

// --- INITIALIZATION ---
function initVisualInventory() {
    console.log("Initializing Visual Inventory...");
    populateRoomSelector();
    setupVisualInventoryEventListeners();
    // Render the last selected room if it exists, otherwise prompt to select one.
    const lastRoom = localStorage.getItem('lastActiveRoomId');
    if (lastRoom && allRooms.some(r => r["Room ID"] === lastRoom)) {
        vi.roomSelector.value = lastRoom;
        navigateTo(lastRoom, allRooms.find(r => r["Room ID"] === lastRoom)["Room Name"]);
    } else {
        renderGrid(); // This will show the "Please select a room" message
    }
}

// --- NAVIGATION & RENDERING ---
function navigateTo(id, name) {
    if (id.startsWith('ROOM-')) {
        // Navigating to a top-level room
        viState.activeRoomId = id;
        viState.activeParentId = id;
        viState.breadcrumbs = [{ id, name }];
    } else {
        // Navigating into a container/shelf
        viState.activeParentId = id;
        // Find the index of this item in breadcrumbs to handle going "back"
        const existingIndex = viState.breadcrumbs.findIndex(b => b.id === id);
        if (existingIndex > -1) {
            viState.breadcrumbs = viState.breadcrumbs.slice(0, existingIndex + 1);
        } else {
            viState.breadcrumbs.push({ id, name });
        }
    }
    localStorage.setItem('lastActiveRoomId', viState.activeRoomId);
    renderGrid();
    renderBreadcrumbs();
}

function renderBreadcrumbs() {
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
    vi.roomGrid.innerHTML = ''; // Clear previous state

    if (!viState.activeParentId) {
        vi.gridContainer.innerHTML = '<div class="flex items-center justify-center h-full"><p class="text-gray-500">Please select or create a room to begin.</p></div>';
        return;
    }

    let parentObject;
    let gridWidth, gridHeight;

    if (viState.activeParentId.startsWith('ROOM-')) {
        parentObject = allRooms.find(r => r["Room ID"] === viState.activeParentId);
        if (!parentObject) return;
        gridWidth = parentObject["Grid Width"];
        gridHeight = parentObject["Grid Height"];
    } else {
        // It's a container or shelf
        parentObject = spatialLayoutData.find(o => o["Instance ID"] === viState.activeParentId);
        if (!parentObject) return;
        const assetInfo = getAssetByRefId(parentObject["Reference ID"]);
        if (!assetInfo || assetInfo["Asset Type"] !== 'Shelf') {
             // For containers, we can imagine a simple 10x10 grid or just list items.
             // For now, let's make it a default grid.
             gridWidth = 10;
             gridHeight = 10;
        } else {
            // It's a shelf
            gridWidth = parentObject.Orientation === 'Vertical' ? parentObject["Shelf Rows"] : parentObject["Shelf Cols"];
            gridHeight = parentObject.Orientation === 'Vertical' ? parentObject["Shelf Cols"] : parentObject["Shelf Rows"];
        }
    }

    vi.roomGrid.style.gridTemplateColumns = `repeat(${gridWidth}, minmax(40px, 1fr))`;
    vi.roomGrid.style.gridTemplateRows = `repeat(${gridHeight}, minmax(40px, 1fr))`;

    // Render child objects
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

    // Add class based on type
    const typeClass = assetInfo["Asset Type"] === 'Shelf' ? 'shelf' : (assetInfo["Asset Type"] === 'Container' ? 'container' : 'asset-item');
    objEl.classList.add(typeClass);

    const width = objectData.Orientation === 'Vertical' ? objectData.Height : objectData.Width;
    const height = objectData.Orientation === 'Vertical' ? objectData.Width : objectData.Height;
    
    objEl.style.gridColumn = `${objectData["Pos X"] + 1} / span ${width}`;
    objEl.style.gridRow = `${objectData["Pos Y"] + 1} / span ${height}`;
    objEl.innerHTML = `<span class="truncate">${assetInfo["Asset Name"]}</span>`;

    // Event Listeners for the object
    objEl.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'move', instanceId: objectData["Instance ID"] }));
        e.stopPropagation();
    });

    objEl.addEventListener('click', (e) => {
        if (typeClass === 'shelf' || typeClass === 'container') {
             e.stopPropagation();
             navigateTo(objectData["Instance ID"], assetInfo["Asset Name"]);
        }
    });

    parentGrid.appendChild(objEl);
}

// --- UI POPULATION & HELPERS ---
function populateRoomSelector() {
    const currentValue = vi.roomSelector.value;
    vi.roomSelector.innerHTML = '<option value="">-- Select a Room --</option>';
    allRooms.forEach(room => {
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

// --- EVENT LISTENERS ---
function setupVisualInventoryEventListeners() {
    vi.createRoomBtn.addEventListener('click', () => {
        vi.roomForm.reset();
        document.getElementById('room-id-hidden').value = '';
        toggleModal(vi.roomModal, true);
    });

    vi.roomModal.querySelector('.modal-backdrop').onclick = () => toggleModal(vi.roomModal, false);
    vi.roomModal.querySelector('#cancel-room-btn').onclick = () => toggleModal(vi.roomModal, false);

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
        await loadAllSheetData();
        vi.roomSelector.value = roomData["Room ID"];
        navigateTo(roomData["Room ID"], roomData["Room Name"]);
    });

    vi.roomSelector.addEventListener('change', (e) => {
        if (e.target.value) {
            const room = allRooms.find(r => r["Room ID"] === e.target.value);
            navigateTo(room["Room ID"], room["Room Name"]);
        } else {
            viState.activeParentId = null;
            renderGrid();
        }
    });

    // Toolbar Drag Handlers
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

    // Grid Drop Handlers
    vi.gridContainer.addEventListener('dragover', (e) => {
        e.preventDefault(); // Necessary to allow dropping
    });

    vi.gridContainer.addEventListener('drop', async (e) => {
        e.preventDefault();
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        
        const rect = vi.roomGrid.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const gridTemplateCols = getComputedStyle(vi.roomGrid).gridTemplateColumns.split(' ');
        const gridTemplateRows = getComputedStyle(vi.roomGrid).gridTemplateRows.split(' ');
        const cellWidth = rect.width / gridTemplateCols.length;
        const cellHeight = rect.height / gridTemplateRows.length;
        const gridX = Math.min(gridTemplateCols.length - 1, Math.max(0, Math.floor(x / cellWidth)));
        const gridY = Math.min(gridTemplateRows.length - 1, Math.max(0, Math.floor(y / cellHeight)));
        
        if (data.type === 'new') {
            await handleNewObjectDrop(data, gridX, gridY);
        } else if (data.type === 'move') {
            // TODO: Implement move logic
            console.log(`Move item ${data.instanceId} to ${gridX},${gridY}`);
        }
    });
}

async function handleNewObjectDrop(data, gridX, gridY) {
    if (!viState.activeParentId) {
        showMessage("Cannot add an object without a selected room or container.");
        return;
    }

    // 1. Create a new Asset record for the shelf/container itself
    const newAsset = {
        "Asset ID": `ASSET-${Date.now()}`,
        "Asset Name": data.name,
        "Asset Type": data.assetType,
        "Condition": "New", // Default value
    };
    await appendRowToSheet(ASSET_SHEET, ASSET_HEADERS, newAsset);
    
    // 2. Create the Spatial Layout instance for the new asset
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
    await appendRowToSheet(SPATIAL_LAYOUT_SHEET, SPATIAL_LAYOUT_HEADERS, newInstance);
    
    // 3. Refresh data and re-render
    await loadAllSheetData();
    renderGrid();
}
