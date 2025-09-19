// JS/visual_inventory_logic.js

// --- STATE ---
let viState = {
    activeRoomId: null,
    activeParentId: null,
    breadcrumbs: [],
    selectedInstanceId: null,
    activeRadialInstanceId: null,
};

// --- DOM REFERENCES & FLAGS ---
let vi = {};
let viListenersInitialized = false;
let hideMenuTimeout; // Variable to manage the hide timer

// --- DRAG STATE ---
let dragGhost = null;

// --- INITIALIZATION ---
function setupAndBindVisualInventory() {
    if (viListenersInitialized) return true;

    // Main VI elements
    vi.roomSelector = document.getElementById('room-selector');
    vi.gridContainer = document.getElementById('room-grid-container');
    vi.createRoomBtn = document.getElementById('create-room-btn');
    vi.breadcrumbContainer = document.getElementById('breadcrumb-container');
    
    // Modals
    vi.roomModal = document.getElementById('room-modal');
    vi.roomForm = document.getElementById('room-form');
    vi.contentsModal = document.getElementById('contents-modal');
    
    // Radial Menu
    vi.radialMenu = document.getElementById('radial-menu');

    const criticalElements = [vi.gridContainer, vi.roomSelector, vi.createRoomBtn, vi.roomModal, vi.roomForm, vi.contentsModal, vi.radialMenu];
    if (criticalElements.some(el => !el)) {
        console.error("Fatal Error: A critical VI DOM element is missing.");
        return false;
    }

    // --- Event Listeners Setup ---
    vi.createRoomBtn.addEventListener('click', () => {
        vi.roomForm.reset();
        document.getElementById('room-id-hidden').value = '';
        toggleModal(vi.roomModal, true);
    });

    vi.roomModal.querySelector('.modal-backdrop').addEventListener('click', () => toggleModal(vi.roomModal, false));
    vi.roomModal.querySelector('#cancel-room-btn').addEventListener('click', () => toggleModal(vi.roomModal, false));
    vi.contentsModal.querySelector('.modal-backdrop').addEventListener('click', () => toggleModal(vi.contentsModal, false));
    vi.contentsModal.querySelector('.modal-close-btn').addEventListener('click', () => toggleModal(vi.contentsModal, false));

    vi.roomForm.addEventListener('submit', handleRoomFormSubmit);
    vi.roomSelector.addEventListener('change', handleRoomSelection);

    document.querySelectorAll('.toolbar-item').forEach(item => {
        item.addEventListener('dragstart', handleToolbarDragStart);
    });
    
    vi.gridContainer.addEventListener('dragover', handleGridDragOver); // Modified
    vi.gridContainer.addEventListener('drop', handleGridDrop);
    
    vi.gridContainer.addEventListener('click', (e) => {
        if (e.target === vi.gridContainer || e.target.id === 'room-grid') {
            selectObject(null);
        }
    });

    // Global listener to hide the radial menu
    document.addEventListener('click', (e) => {
        if (vi.radialMenu && !vi.radialMenu.contains(e.target) && !e.target.closest('.visual-object')) {
            hideRadialMenu();
        }
    });
    
    // Add hover listeners for the fade-out effect
    vi.radialMenu.addEventListener('mouseenter', () => {
        clearTimeout(hideMenuTimeout); // Cancel hiding if the mouse re-enters
    });

    vi.radialMenu.addEventListener('mouseleave', () => {
        // Start a timer to hide the menu after a short delay
        hideMenuTimeout = setTimeout(hideRadialMenu, 500); // 500ms delay
    });

    // Bind Radial Menu Buttons
    vi.radialMenu.querySelector('#radial-rename-use').addEventListener('click', () => { handleRename(viState.activeRadialInstanceId); hideRadialMenu(); });
    vi.radialMenu.querySelector('#radial-rotate-use').addEventListener('click', () => { handleRotate(viState.activeRadialInstanceId); hideRadialMenu(); });
    vi.radialMenu.querySelector('#radial-resize-use').addEventListener('click', () => { handleResize(viState.activeRadialInstanceId); hideRadialMenu(); });
    vi.radialMenu.querySelector('#radial-open-use').addEventListener('click', () => { handleOpen(viState.activeRadialInstanceId); hideRadialMenu(); });
    vi.radialMenu.querySelector('#radial-delete-use').addEventListener('click', async () => { 
        await handleDelete(viState.activeRadialInstanceId); 
        hideRadialMenu();
    });

    viListenersInitialized = true;
    return true;
}

function initVisualInventory() {
    if (!setupAndBindVisualInventory()) return;

    populateRoomSelector();
    const lastRoom = localStorage.getItem('lastActiveRoomId');
    if (lastRoom && allRooms.some(r => r.RoomID === lastRoom)) {
        vi.roomSelector.value = lastRoom;
        const room = allRooms.find(r => r.RoomID === lastRoom);
        if (room) navigateTo(room.RoomID, room.RoomName);
    } else if (allRooms.length > 0) {
        vi.roomSelector.value = allRooms[0].RoomID;
        navigateTo(allRooms[0].RoomID, allRooms[0].RoomName);
    } else {
        renderGrid();
    }
}

// --- DRAG AND DROP HANDLERS ---
function handleObjectDragStart(e, objectData) {
    e.stopPropagation();
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'move', instanceId: objectData.InstanceID }));
    e.dataTransfer.effectAllowed = 'move';

    // Hide default ghost image
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // 1x1 transparent gif
    e.dataTransfer.setDragImage(img, 0, 0);

    // Create custom ghost
    dragGhost = e.target.cloneNode(true);
    // Copy computed styles for accurate size
    const styles = window.getComputedStyle(e.target);
    dragGhost.style.width = styles.width;
    dragGhost.style.height = styles.height;
    dragGhost.classList.add('dragging-ghost');
    document.body.appendChild(dragGhost);
    
    // Position ghost initially based on cursor
    dragGhost.style.left = `${e.pageX}px`;
    dragGhost.style.top = `${e.pageY}px`;

    // Make original element semi-transparent
    setTimeout(() => e.target.classList.add('dragging-source'), 0);
}

function handleGridDragOver(e) {
    e.preventDefault();
    if (!dragGhost) return;
    
    const gridEl = document.getElementById('room-grid');
    if (!gridEl) return;

    const rect = gridEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const gridTemplateCols = getComputedStyle(gridEl).gridTemplateColumns.split(' ');
    const cellWidth = rect.width / gridTemplateCols.length;
    const gridTemplateRows = getComputedStyle(gridEl).gridTemplateRows.split(' ');
    const cellHeight = rect.height / gridTemplateRows.length;

    // Snap ghost to grid
    const snapX = Math.floor(x / cellWidth) * cellWidth + rect.left + window.scrollX;
    const snapY = Math.floor(y / cellHeight) * cellHeight + rect.top + window.scrollY;

    dragGhost.style.left = `${snapX}px`;
    dragGhost.style.top = `${snapY}px`;
}

function cleanupDrag() {
    if (dragGhost) {
        dragGhost.remove();
        dragGhost = null;
    }
    document.querySelectorAll('.dragging-source').forEach(el => el.classList.remove('dragging-source'));
}

// --- EVENT HANDLERS ---
async function handleRoomFormSubmit(e) {
    e.preventDefault();
    const roomData = {
        RoomID: `ROOM-${Date.now()}`,
        RoomName: document.getElementById('room-name').value,
        GridWidth: document.getElementById('grid-width').value,
        GridHeight: document.getElementById('grid-height').value,
    };
    const newRowIndex = await appendRowToSheet(ROOMS_SHEET, ROOMS_HEADERS, roomData);
    if (newRowIndex) {
        roomData.rowIndex = newRowIndex;
        allRooms.push(roomData);
        populateRoomSelector();
        vi.roomSelector.value = roomData.RoomID;
        navigateTo(roomData.RoomID, roomData.RoomName);
    }
    toggleModal(vi.roomModal, false);
}

function handleRoomSelection(e) {
    if (e.target.value) {
        const room = allRooms.find(r => r.RoomID === e.target.value);
        if (room) navigateTo(room.RoomID, room.RoomName);
    } else {
        viState.activeParentId = null;
        renderGrid();
    }
}

function handleToolbarDragStart(e) {
    const item = e.target;
    const data = {
        type: 'new-object',
        assetType: item.dataset.assetType,
        name: item.dataset.name,
        width: parseInt(item.dataset.width),
        height: parseInt(item.dataset.height),
        shelfRows: parseInt(item.dataset.shelfRows) || null,
        shelfCols: parseInt(item.dataset.shelfCols) || null,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(data));
}

async function handleGridDrop(e) {
    e.preventDefault();
    cleanupDrag(); // Remove custom ghost on drop
    if (!e.dataTransfer.getData('application/json') || !document.getElementById('room-grid')) return;
    
    const data = JSON.parse(e.dataTransfer.getData('application/json'));
    const gridEl = document.getElementById('room-grid');
    const rect = gridEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const gridTemplateCols = getComputedStyle(gridEl).gridTemplateColumns.split(' ');
    const cellWidth = rect.width / gridTemplateCols.length;
    const gridX = Math.min(gridTemplateCols.length, Math.max(0, Math.floor(x / cellWidth)));

    const gridTemplateRows = getComputedStyle(gridEl).gridTemplateRows.split(' ');
    const cellHeight = rect.height / gridTemplateRows.length;
    const gridY = Math.min(gridTemplateRows.length, Math.max(0, Math.floor(y / cellHeight)));
    
    if (data.type === 'new-object') {
        await handleToolbarDrop(data, gridX, gridY);
    } else if (data.type === 'move') {
        const instance = spatialLayoutData.find(i => i.InstanceID === data.instanceId);
        if (instance) {
            instance.PosX = gridX;
            instance.PosY = gridY;
            await updateObjectInStateAndSheet(instance);
            renderGrid();
        }
    }
}

async function handleToolbarDrop(data, gridX, gridY) {
    if (!viState.activeParentId) {
        showMessage("Cannot add an object without a selected room or container.");
        return;
    }
    const newAsset = {
        AssetID: `ASSET-${Date.now()}`,
        AssetName: data.name,
        AssetType: data.assetType,
        Condition: "New",
    };
    await appendRowToSheet(ASSET_SHEET, ASSET_HEADERS, newAsset);
    allAssets.push(newAsset);

    const newInstance = {
        InstanceID: `INST-${Date.now()}`,
        ReferenceID: newAsset.AssetID,
        ParentID: viState.activeParentId,
        PosX: gridX,
        PosY: gridY,
        Width: data.width,
        Height: data.height,
        Orientation: "Horizontal",
        ShelfRows: data.shelfRows,
        ShelfCols: data.shelfCols,
    };
    const newRowIndex = await appendRowToSheet(SPATIAL_LAYOUT_SHEET, SPATIAL_LAYOUT_HEADERS, newInstance);
    if(newRowIndex) {
        newInstance.rowIndex = newRowIndex;
        spatialLayoutData.push(newInstance);
        renderGrid();
    } else {
        await loadAllSheetData();
    }
}

// --- NAVIGATION & RENDERING ---
function navigateTo(id, name) {
    if (!id) {
        console.error("navigateTo was called with an undefined ID.");
        return;
    }
    
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
    selectObject(null);
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
            crumbEl.appendChild(document.createTextNode(' / '));
        } else {
            crumbEl.textContent = crumb.name;
            crumbEl.className = 'font-semibold text-gray-700';
        }
        vi.breadcrumbContainer.appendChild(crumbEl);
    });
}

function renderGrid() {
    if (!vi.gridContainer) return;
    selectObject(null);

    if (!viState.activeParentId) {
        vi.gridContainer.innerHTML = '<div id="room-grid" class="flex items-center justify-center h-full"><p class="text-gray-500">Please select or create a room to begin.</p></div>';
        return;
    }

    vi.gridContainer.innerHTML = '<div id="room-grid"></div>';
    const roomGrid = document.getElementById('room-grid');

    let parentObject;
    let gridWidth, gridHeight;

    if (viState.activeParentId.startsWith('ROOM-')) {
        parentObject = allRooms.find(r => r.RoomID === viState.activeParentId);
        if (!parentObject) return;
        gridWidth = parentObject.GridWidth;
        gridHeight = parentObject.GridHeight;
    } else {
        parentObject = spatialLayoutData.find(o => o.InstanceID === viState.activeParentId);
        if (!parentObject) return;
        const assetInfo = getAssetByRefId(parentObject.ReferenceID);
        if (!assetInfo || !['Shelf', 'Container'].includes(assetInfo.AssetType)) {
            gridWidth = 10;
            gridHeight = 10;
        } else {
            gridWidth = parentObject.Orientation === 'Vertical' ? parentObject.ShelfRows : parentObject.ShelfCols;
            gridHeight = parentObject.Orientation === 'Vertical' ? parentObject.ShelfCols : parentObject.ShelfRows;
        }
    }

    roomGrid.style.gridTemplateColumns = `repeat(${gridWidth}, minmax(40px, 1fr))`;
    roomGrid.style.gridTemplateRows = `repeat(${gridHeight}, minmax(40px, 1fr))`;

    const childObjects = spatialLayoutData.filter(obj => obj.ParentID === viState.activeParentId);
    childObjects.forEach(obj => renderObject(obj, roomGrid));
}

function renderObject(objectData, parentGrid) {
    const assetInfo = getAssetByRefId(objectData.ReferenceID);
    if (!assetInfo) return;

    const objEl = document.createElement('div');
    objEl.className = 'visual-object flex items-center justify-center p-1 select-none';
    objEl.dataset.instanceId = objectData.InstanceID;
    objEl.setAttribute('draggable', 'true');

    const typeClass = assetInfo.AssetType === 'Shelf' ? 'shelf' : (assetInfo.AssetType === 'Container' ? 'container' : 'asset-item');
    objEl.classList.add(typeClass);

    const width = objectData.Orientation === 'Vertical' ? objectData.Height : objectData.Width;
    const height = objectData.Orientation === 'Vertical' ? objectData.Width : objectData.Height;

    objEl.style.gridColumn = `${parseInt(objectData.PosX) + 1} / span ${width}`;
    objEl.style.gridRow = `${parseInt(objectData.PosY) + 1} / span ${height}`;
    
    // Hide name on unit, show in tooltip on hover for containers/shelves
    if (typeClass === 'shelf' || typeClass === 'container') {
        const childCount = spatialLayoutData.filter(obj => obj.ParentID === objectData.InstanceID).length;
        const tooltip = document.createElement('div');
        tooltip.className = 'inventory-tooltip';
        tooltip.innerHTML = `<strong>${assetInfo.AssetName}</strong><br>Assets: ${childCount}`;
        objEl.appendChild(tooltip);
    } else {
        objEl.innerHTML = `<span class="truncate">${assetInfo.AssetName}</span>`;
    }

    objEl.addEventListener('dragstart', (e) => handleObjectDragStart(e, objectData));
    objEl.addEventListener('dragend', cleanupDrag);

    objEl.addEventListener('click', (e) => {
        e.stopPropagation();
        selectObject(objectData.InstanceID);
    });

    objEl.addEventListener('dblclick', (e) => {
        if (typeClass === 'shelf' || typeClass === 'container') {
            e.stopPropagation();
            navigateTo(objectData.InstanceID, assetInfo.AssetName);
        }
    });
    
    objEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeClass === 'shelf' || typeClass === 'container') {
            showRadialMenu(e.clientX, e.clientY, objectData.InstanceID);
        }
    });

    parentGrid.appendChild(objEl);
}

// --- UI POPULATION & HELPERS ---
function populateRoomSelector() {
    if (!vi.roomSelector) return;
    const currentValue = vi.roomSelector.value;
    vi.roomSelector.innerHTML = '<option value="">-- Select a Room --</option>';
    allRooms.sort((a,b) => a.RoomName.localeCompare(b.RoomName)).forEach(room => {
        const option = document.createElement('option');
        option.value = room.RoomID;
        option.textContent = room.RoomName;
        vi.roomSelector.appendChild(option);
    });
    if ([...vi.roomSelector.options].some(opt => opt.value === currentValue)) {
        vi.roomSelector.value = currentValue;
    }
}

function getAssetByRefId(refId) {
    return allAssets.find(a => a.AssetID === refId);
}

// --- OBJECT MANIPULATION & SELECTION ---
function selectObject(instanceId) {
    document.querySelectorAll('.resize-handle').forEach(el => el.remove());
    document.querySelectorAll('.visual-object.selected').forEach(el => el.classList.remove('selected'));

    viState.selectedInstanceId = instanceId;
    if (!instanceId) return;

    const roomGrid = document.getElementById('room-grid');
    const objEl = roomGrid?.querySelector(`[data-instance-id="${instanceId}"]`);
    if (objEl) {
        objEl.classList.add('selected');
    }
}

async function updateObjectInStateAndSheet(updatedInstance) {
    const index = spatialLayoutData.findIndex(i => i.InstanceID === updatedInstance.InstanceID);
    if (index > -1) {
        spatialLayoutData[index] = updatedInstance;
        await updateRowInSheet(SPATIAL_LAYOUT_SHEET, updatedInstance.rowIndex, SPATIAL_LAYOUT_HEADERS, updatedInstance);
    }
}

// --- RADIAL MENU ---
function showRadialMenu(x, y, instanceId) {
    clearTimeout(hideMenuTimeout); // Prevent the menu from hiding immediately if it was in the process of fading out
    viState.activeRadialInstanceId = instanceId;
    vi.radialMenu.style.left = `${x}px`;
    vi.radialMenu.style.top = `${y}px`;
    vi.radialMenu.classList.remove('hidden');
    
    setTimeout(() => {
        vi.radialMenu.classList.add('visible');
    }, 10);
}

function hideRadialMenu() {
    if (vi.radialMenu) {
        vi.radialMenu.classList.remove('visible');
        setTimeout(() => {
            vi.radialMenu.classList.add('hidden');
        }, 200); // Wait for transition to finish before hiding
    }
    viState.activeRadialInstanceId = null;
    clearTimeout(hideMenuTimeout); // Ensure any pending timeouts are cleared
}

async function handleRename(instanceId) {
    if (!instanceId) return;
    const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (!instance) return;

    const asset = allAssets.find(a => a.AssetID === instance.ReferenceID);
    if (!asset) return;

    const newName = prompt("Enter new name for the object:", asset.AssetName);
    if (newName && newName.trim() !== '' && newName.trim() !== asset.AssetName) {
        asset.AssetName = newName.trim();
        await updateRowInSheet(ASSET_SHEET, asset.rowIndex, ASSET_HEADERS, asset);
        await loadAllSheetData();
    }
}

async function handleRotate(instanceId) {
    if (!instanceId) return;
    const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (instance) {
        instance.Orientation = instance.Orientation === 'Horizontal' ? 'Vertical' : 'Horizontal';
        await updateObjectInStateAndSheet(instance);
        renderGrid();
        setTimeout(() => selectObject(instanceId), 50);
    }
}

function handleOpen(instanceId) {
    if (!instanceId) return;
    const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (instance) {
        const assetInfo = getAssetByRefId(instance.ReferenceID);
        if (assetInfo) navigateTo(instance.InstanceID, assetInfo.AssetName);
    }
}

function handleResize(instanceId) {
    if (!instanceId) return;
    selectObject(instanceId);
    const objEl = document.querySelector(`[data-instance-id="${instanceId}"]`);
    if(objEl) createObjectResizeHandles(objEl, instanceId);
    showMessage("Use the handles to resize the object.", "info");
}

async function handleDelete(instanceId) {
    if (!instanceId) return;
    const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (!instance) return;

    if (confirm('Are you sure you want to permanently delete this item and its asset record? This cannot be undone.')) {
        spatialLayoutData = spatialLayoutData.filter(i => i.InstanceID !== instanceId);
        
        const asset = allAssets.find(a => a.AssetID === instance.ReferenceID);
        if (asset) {
            allAssets = allAssets.filter(a => a.AssetID !== instance.ReferenceID);
            await deleteRowFromSheet(ASSET_SHEET, asset.rowIndex);
        }

        await deleteRowFromSheet(SPATIAL_LAYOUT_SHEET, instance.rowIndex);
        
        renderGrid();
    }
}

function createObjectResizeHandles(objEl, instanceId) {
    document.querySelectorAll('.resize-handle').forEach(el => el.remove());
    const handles = ['n', 's', 'e', 'w'];
    handles.forEach(dir => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${dir}`;
        objEl.appendChild(handle);
        handle.addEventListener('mousedown', (e) => initResize(e, instanceId, dir));
    });
}

function initResize(e, instanceId, direction) {
    e.preventDefault();
    e.stopPropagation();
    
    const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (!instance) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = parseInt(instance.Width);
    const startHeight = parseInt(instance.Height);
    
    const gridEl = document.getElementById('room-grid');
    const rect = gridEl.getBoundingClientRect();
    const cellWidth = rect.width / gridEl.style.gridTemplateColumns.split(' ').length;
    const cellHeight = rect.height / gridEl.style.gridTemplateRows.split(' ').length;

    function doDrag(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        const orientation = instance.Orientation || 'Horizontal';
        const w_prop = orientation === 'Horizontal' ? 'Width' : 'Height';
        const h_prop = orientation === 'Horizontal' ? 'Height' : 'Width';
        const start_w = orientation === 'Horizontal' ? startWidth : startHeight;
        const start_h = orientation === 'Horizontal' ? startHeight : startWidth;
        const dx_cells = Math.round(dx / cellWidth);
        const dy_cells = Math.round(dy / cellHeight);

        if (direction === 'e') instance[w_prop] = Math.max(1, start_w + dx_cells);
        if (direction === 'w') instance[w_prop] = Math.max(1, start_w - dx_cells);
        if (direction === 's') instance[h_prop] = Math.max(1, start_h + dy_cells);
        if (direction === 'n') instance[h_prop] = Math.max(1, start_h - dy_cells);
        
        const objEl = document.querySelector(`[data-instance-id="${instanceId}"]`);
        if(objEl) {
            const width = instance.Orientation === 'Vertical' ? instance.Height : instance.Width;
            const height = instance.Orientation === 'Vertical' ? instance.Width : instance.Height;
            objEl.style.gridColumnEnd = `span ${width}`;
            objEl.style.gridRowEnd = `span ${height}`;
        }
    }

    function stopDrag() {
        document.removeEventListener('mousemove', doDrag);
        document.removeEventListener('mouseup', stopDrag);
        updateObjectInStateAndSheet(instance);
    }

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
}
