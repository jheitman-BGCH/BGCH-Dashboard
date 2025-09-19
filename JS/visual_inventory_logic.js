// JS/visual_inventory_logic.js

// --- STATE ---
let viState = {
    activeRoomId: null,
    activeParentId: null,
    breadcrumbs: [],
    selectedInstanceId: null,
};

// --- DOM REFERENCES & FLAGS ---
let vi = {};
let viListenersInitialized = false;

// --- INITIALIZATION ---
function setupAndBindVisualInventory() {
    if (viListenersInitialized) return true;

    vi.roomSelector = document.getElementById('room-selector');
    vi.gridContainer = document.getElementById('room-grid-container');
    vi.createRoomBtn = document.getElementById('create-room-btn');
    vi.roomModal = document.getElementById('room-modal');
    vi.roomForm = document.getElementById('room-form');
    vi.objectToolbar = document.getElementById('object-toolbar');
    vi.breadcrumbContainer = document.getElementById('breadcrumb-container');
    vi.contentsModal = document.getElementById('contents-modal');
    vi.radialMenu = document.getElementById('radial-menu');

    const criticalElements = [vi.gridContainer, vi.roomSelector, vi.createRoomBtn, vi.roomModal, vi.roomForm, vi.contentsModal, vi.radialMenu];
    if (criticalElements.some(el => !el)) {
        console.error("Fatal Error: A critical VI DOM element is missing.");
        return false;
    }

    vi.createRoomBtn.addEventListener('click', () => {
        vi.roomForm.reset();
        document.getElementById('room-id-hidden').value = '';
        toggleModal(vi.roomModal, true);
    });

    vi.roomModal.querySelector('.modal-backdrop').addEventListener('click', () => toggleModal(vi.roomModal, false));
    vi.roomModal.querySelector('#cancel-room-btn').addEventListener('click', () => toggleModal(vi.roomModal, false));
    vi.contentsModal.querySelector('.modal-backdrop').addEventListener('click', () => toggleModal(vi.contentsModal, false));
    vi.contentsModal.querySelector('.modal-close-btn').addEventListener('click', () => toggleModal(vi.contentsModal, false));

    vi.roomForm.addEventListener('submit', async (e) => {
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
    });

    vi.roomSelector.addEventListener('change', (e) => {
        if (e.target.value) {
            const room = allRooms.find(r => r.RoomID === e.target.value);
            if (room) {
                navigateTo(room.RoomID, room.RoomName);
            }
        } else {
            viState.activeParentId = null;
            renderGrid();
        }
    });

    document.querySelectorAll('.toolbar-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
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
        });
    });
    
    vi.gridContainer.addEventListener('dragover', (e) => e.preventDefault());
    vi.gridContainer.addEventListener('drop', handleGridDrop);
    
    vi.gridContainer.addEventListener('click', (e) => {
        if (e.target === vi.gridContainer || e.target === vi.roomGrid) {
            selectObject(null);
        }
        hideRadialMenu();
    });

    document.addEventListener('click', (e) => {
        if (vi.radialMenu && !vi.radialMenu.contains(e.target) && !e.target.closest('.visual-object')) {
            hideRadialMenu();
        }
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
        if (room) {
            navigateTo(room.RoomID, room.RoomName);
        }
    } else if (allRooms.length > 0) {
        vi.roomSelector.value = allRooms[0].RoomID;
        navigateTo(allRooms[0].RoomID, allRooms[0].RoomName);
    } else {
        renderGrid();
    }
}

function navigateTo(id, name) {
    if (!id) {
        console.error("navigateTo was called with an undefined ID. Aborting navigation.");
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
    selectObject(null);

    if (!viState.activeParentId) {
        vi.gridContainer.innerHTML = '<div id="room-grid" class="flex items-center justify-center h-full"><p class="text-gray-500">Please select or create a room to begin.</p></div>';
        return;
    }

    vi.gridContainer.innerHTML = '<div id="room-grid"></div>';
    vi.roomGrid = document.getElementById('room-grid');

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
        gridWidth = parentObject.Orientation === 'Vertical' ? parentObject.ShelfRows : parentObject.ShelfCols;
        gridHeight = parentObject.Orientation === 'Vertical' ? parentObject.ShelfCols : parentObject.ShelfRows;
    }

    vi.roomGrid.style.gridTemplateColumns = `repeat(${gridWidth}, minmax(40px, 1fr))`;
    vi.roomGrid.style.gridTemplateRows = `repeat(${gridHeight}, minmax(40px, 1fr))`;

    const childObjects = spatialLayoutData.filter(obj => obj.ParentID === viState.activeParentId);
    childObjects.forEach(obj => renderObject(obj, vi.roomGrid));
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
    objEl.innerHTML = `<span class="truncate object-name">${assetInfo.AssetName}</span>`;

    objEl.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'move', instanceId: objectData.InstanceID }));
        e.stopPropagation();
    });

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
        showRadialMenu(e.clientX, e.clientY, objectData.InstanceID);
    });

    parentGrid.appendChild(objEl);
}

function populateRoomSelector() {
    if (!vi.roomSelector) return;
    const currentValue = vi.roomSelector.value;
    vi.roomSelector.innerHTML = '<option value="">-- Select a Room --</option>';
    allRooms.forEach(room => {
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

async function handleGridDrop(e) {
    e.preventDefault();
    if (!e.dataTransfer.getData('application/json') || !vi.roomGrid) return;
    
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

function selectObject(instanceId) {
    document.querySelectorAll('.resize-handle').forEach(el => el.remove());
    document.querySelectorAll('.visual-object.selected').forEach(el => el.classList.remove('selected'));

    viState.selectedInstanceId = instanceId;

    if (!instanceId) return;

    const objEl = vi.roomGrid.querySelector(`[data-instance-id="${instanceId}"]`);
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

function createResizeHandles(objEl, instanceId) {
    const handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
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

    const objEl = vi.roomGrid.querySelector(`[data-instance-id="${instanceId}"]`);
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = parseInt(instance.Width);
    const startHeight = parseInt(instance.Height);
    const startPosX = parseInt(instance.PosX);
    const startPosY = parseInt(instance.PosY);
    
    const rect = vi.roomGrid.getBoundingClientRect();
    const cellWidth = rect.width / vi.roomGrid.style.gridTemplateColumns.split(' ').length;
    const cellHeight = rect.height / vi.roomGrid.style.gridTemplateRows.split(' ').length;

    function doDrag(e) {
        const dx = Math.round((e.clientX - startX) / cellWidth);
        const dy = Math.round((e.clientY - startY) / cellHeight);

        let newWidth = startWidth, newHeight = startHeight, newPosX = startPosX, newPosY = startPosY;

        if (direction.includes('e')) newWidth = Math.max(1, startWidth + dx);
        if (direction.includes('w')) {
            newWidth = Math.max(1, startWidth - dx);
            newPosX = startPosX + dx;
        }
        if (direction.includes('s')) newHeight = Math.max(1, startHeight + dy);
        if (direction.includes('n')) {
            newHeight = Math.max(1, startHeight - dy);
            newPosY = startPosY + dy;
        }
        
        if (newWidth !== instance.Width || newHeight !== instance.Height || newPosX !== instance.PosX || newPosY !== instance.PosY) {
            instance.Width = newWidth;
            instance.Height = newHeight;
            instance.PosX = newPosX;
            instance.PosY = newPosY;
            
            objEl.style.gridColumn = `${newPosX + 1} / span ${newWidth}`;
            objEl.style.gridRow = `${newPosY + 1} / span ${newHeight}`;
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

// --- RADIAL MENU ---
let activeRadialInstanceId = null;

function showRadialMenu(x, y, instanceId) {
    activeRadialInstanceId = instanceId;
    vi.radialMenu.style.left = `${x}px`;
    vi.radialMenu.style.top = `${y}px`;
    vi.radialMenu.classList.remove('hidden');
    setTimeout(() => vi.radialMenu.classList.add('visible'), 10);

    const buttonIds = ['rename', 'rotate', 'open', 'resize', 'delete'];
    buttonIds.forEach(id => {
        const btn = document.getElementById(`radial-${id}`);
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
    });

    document.getElementById('radial-rename').onclick = () => { handleRename(activeRadialInstanceId); hideRadialMenu(); };
    document.getElementById('radial-rotate').onclick = () => { handleRotate(activeRadialInstanceId); hideRadialMenu(); };
    document.getElementById('radial-open').onclick = () => { handleOpen(activeRadialInstanceId); hideRadialMenu(); };
    document.getElementById('radial-resize').onclick = () => { handleResize(activeRadialInstanceId); hideRadialMenu(); };
    document.getElementById('radial-delete').onclick = () => { handleDelete(activeRadialInstanceId); hideRadialMenu(); };
}

function hideRadialMenu() {
    if (vi.radialMenu) {
        vi.radialMenu.classList.remove('visible');
        setTimeout(() => vi.radialMenu.classList.add('hidden'), 200);
    }
    activeRadialInstanceId = null;
}

async function handleRename(instanceId) {
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
    const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (instance) {
        instance.Orientation = instance.Orientation === 'Horizontal' ? 'Vertical' : 'Horizontal';
        await updateObjectInStateAndSheet(instance);
        renderGrid();
    }
}

function handleOpen(instanceId) {
    const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (instance) {
        const assetInfo = getAssetByRefId(instance.ReferenceID);
        if (assetInfo) {
            navigateTo(instance.InstanceID, assetInfo.AssetName);
        }
    }
}

function handleResize(instanceId) {
    selectObject(instanceId);
    const objEl = vi.roomGrid.querySelector(`[data-instance-id="${instanceId}"]`);
    if (objEl) {
        createResizeHandles(objEl, instanceId);
    }
    showMessage("Use the handles to resize the object.", "info");
}

async function handleDelete(instanceId) {
    if (confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
        const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
        if (instance) {
            spatialLayoutData = spatialLayoutData.filter(i => i.InstanceID !== instanceId);
            await deleteRowFromSheet(SPATIAL_LAYOUT_SHEET, instance.rowIndex);
            
            const asset = allAssets.find(a => a.AssetID === instance.ReferenceID);
            if(asset && (asset.AssetType === 'Shelf' || asset.AssetType === 'Container')) {
                 await deleteRowFromSheet(ASSET_SHEET, asset.rowIndex);
            }
            
            await loadAllSheetData();
        }
    }
}

