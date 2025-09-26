// JS/visual_inventory_logic.js
import { ROOMS_SHEET, ROOMS_HEADERS, ASSET_SHEET, ASSET_HEADERS, SPATIAL_LAYOUT_SHEET, SPATIAL_LAYOUT_HEADERS } from './state.js';
import { getState } from './store.js';
import * as api from './sheetsService.js';
import { toggleModal, showMessage } from './ui.js';
import { filterData } from './filterService.js';

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

// --- DRAG STATE & GLOBAL UI ---
let dragGhost = null;
let globalTooltip = null;

// --- INITIALIZATION ---
function setupAndBindVisualInventory() {
    if (viListenersInitialized) return true;

    vi.roomSelector = document.getElementById('room-selector');
    vi.gridContainer = document.getElementById('room-grid-container');
    vi.createRoomBtn = document.getElementById('create-room-btn');
    vi.breadcrumbContainer = document.getElementById('breadcrumb-container');
    vi.roomModal = document.getElementById('room-modal');
    vi.roomForm = document.getElementById('room-form');
    vi.contentsModal = document.getElementById('contents-modal');
    vi.radialMenu = document.getElementById('radial-menu');
    vi.radialRename = document.getElementById('radial-rename-use');
    vi.radialFlip = document.getElementById('radial-flip-use');
    vi.radialRotate = document.getElementById('radial-rotate-use');
    vi.radialResize = document.getElementById('radial-resize-use');
    vi.radialOpen = document.getElementById('radial-open-use');
    vi.radialDelete = document.getElementById('radial-delete-use');
    vi.unplacedAssetSearch = document.getElementById('unplaced-asset-search');
    vi.unplacedAssetsList = document.getElementById('unplaced-assets-list');

    const criticalElements = [vi.gridContainer, vi.roomSelector, vi.createRoomBtn, vi.roomModal, vi.roomForm, vi.contentsModal, vi.radialMenu, vi.unplacedAssetSearch, vi.unplacedAssetsList];
    if (criticalElements.some(el => !el)) {
        console.error("Fatal Error: A critical VI DOM element is missing.");
        return false;
    }

    if (!document.getElementById('inventory-global-tooltip')) {
        globalTooltip = document.createElement('div');
        globalTooltip.id = 'inventory-global-tooltip';
        document.body.appendChild(globalTooltip);
    } else {
        globalTooltip = document.getElementById('inventory-global-tooltip');
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

    vi.roomForm.addEventListener('submit', handleRoomFormSubmit);
    vi.roomSelector.addEventListener('change', handleRoomSelection);
    vi.unplacedAssetSearch.addEventListener('input', () => renderUnplacedAssets());


    document.querySelectorAll('.toolbar-item').forEach(item => {
        item.addEventListener('dragstart', handleToolbarDragStart);
    });

    vi.gridContainer.addEventListener('dragover', handleGridDragOver);
    vi.gridContainer.addEventListener('drop', handleGridDrop);

    vi.gridContainer.addEventListener('click', (e) => {
        if (e.target === vi.gridContainer || e.target.id === 'room-grid') {
            selectObject(null);
        }
    });

    document.addEventListener('click', (e) => {
        if (vi.radialMenu && !vi.radialMenu.contains(e.target) && !e.target.closest('.visual-object')) {
            hideRadialMenu();
        }
    });

    vi.radialMenu.addEventListener('mouseenter', () => clearTimeout(hideMenuTimeout));
    vi.radialMenu.addEventListener('mouseleave', () => hideMenuTimeout = setTimeout(hideRadialMenu, 500));

    vi.radialRename.addEventListener('click', () => { handleRename(viState.activeRadialInstanceId); hideRadialMenu(); });
    vi.radialFlip.addEventListener('click', () => { handleFlip(viState.activeRadialInstanceId); hideRadialMenu(); });
    vi.radialRotate.addEventListener('click', () => { handleRotate(viState.activeRadialInstanceId); hideRadialMenu(); });
    vi.radialResize.addEventListener('click', () => { handleResize(viState.activeRadialInstanceId); hideRadialMenu(); });
    vi.radialOpen.addEventListener('click', () => { handleOpen(viState.activeRadialInstanceId); hideRadialMenu(); });
    vi.radialDelete.addEventListener('click', async () => { await handleDelete(viState.activeRadialInstanceId); hideRadialMenu(); });

    viListenersInitialized = true;
    return true;
}

export function initVisualInventory() {
    if (!setupAndBindVisualInventory()) return;

    populateRoomSelector();
    renderUnplacedAssets();
    const lastRoom = localStorage.getItem('lastActiveRoomId');
    const { allRooms } = getState();
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

function renderUnplacedAssets() {
    if (!vi.unplacedAssetsList) return;

    const { spatialLayoutData, allAssets } = getState();
    const placedAssetReferenceIDs = new Set(spatialLayoutData.map(item => item.ReferenceID));
    const unplacedAssets = allAssets.filter(asset => !placedAssetReferenceIDs.has(asset.AssetID));

    const searchTerm = vi.unplacedAssetSearch.value;
    const searchFields = ['AssetName', 'AssetType', 'IDCode'];

    const filteredAssets = filterData(unplacedAssets, searchTerm, searchFields);

    vi.unplacedAssetsList.innerHTML = ''; // Clear current list

    if (filteredAssets.length === 0) {
        vi.unplacedAssetsList.innerHTML = `<p class="text-xs text-gray-500 px-2">No unplaced assets found.</p>`;
        return;
    }

    filteredAssets.forEach(asset => {
        const itemEl = document.createElement('div');
        itemEl.className = 'toolbar-item bg-white border text-sm p-2';
        itemEl.setAttribute('draggable', 'true');
        itemEl.textContent = asset.AssetName || 'Unnamed Asset';

        itemEl.addEventListener('dragstart', (e) => {
             const data = {
                type: 'new-object',
                assetType: asset.AssetType || 'Container',
                name: asset.AssetName,
                width: 1, // Default width
                height: 1, // Default height
                referenceId: asset.AssetID // IMPORTANT: Reference the existing asset
            };
            e.dataTransfer.setData('application/json', JSON.stringify(data));
        });

        vi.unplacedAssetsList.appendChild(itemEl);
    });
}


// --- DRAG AND DROP HANDLERS ---
function handleObjectDragStart(e, objectData) {
    e.stopPropagation();
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'move', instanceId: objectData.InstanceID }));
    e.dataTransfer.effectAllowed = 'move';

    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);

    dragGhost = e.target.cloneNode(true);
    const styles = window.getComputedStyle(e.target);
    dragGhost.style.width = styles.width;
    dragGhost.style.height = styles.height;
    dragGhost.classList.add('dragging-ghost');
    document.body.appendChild(dragGhost);

    dragGhost.style.left = `${e.pageX}px`;
    dragGhost.style.top = `${e.pageY}px`;

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

    const snapX = Math.floor(x / cellWidth) * cellWidth + rect.left;
    const snapY = Math.floor(y / cellHeight) * cellHeight + rect.top;

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

    const rowData = ROOMS_HEADERS.map(header => roomData[header] || '');
    await api.appendSheetValues(ROOMS_SHEET, [rowData]);

    toggleModal(vi.roomModal, false);
    // Dispatch event to notify main app that data has changed
    window.dispatchEvent(new CustomEvent('datachanged'));
}

function handleRoomSelection(e) {
    if (e.target.value) {
        const { allRooms } = getState();
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
    cleanupDrag();
    if (!e.dataTransfer.getData('application/json') || !document.getElementById('room-grid')) return;

    const data = JSON.parse(e.dataTransfer.getData('application/json'));
    const gridEl = document.getElementById('room-grid');
    const rect = gridEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const gridTemplateCols = getComputedStyle(gridEl).gridTemplateColumns.split(' ');
    const cellWidth = rect.width / gridTemplateCols.length;
    const gridX = Math.min(gridTemplateCols.length - (data.width || 1) + 1, Math.max(0, Math.floor(x / cellWidth)));

    const gridTemplateRows = getComputedStyle(gridEl).gridTemplateRows.split(' ');
    const cellHeight = rect.height / gridTemplateRows.length;
    const gridY = Math.min(gridTemplateRows.length - (data.height || 1) + 1, Math.max(0, Math.floor(y / cellHeight)));

    if (data.type === 'new-object') {
        await handleToolbarDrop(data, gridX, gridY);
    } else if (data.type === 'move') {
        const { spatialLayoutData } = getState();
        const instance = spatialLayoutData.find(i => i.InstanceID === data.instanceId);
        if (instance) {
            instance.PosX = gridX;
            instance.PosY = gridY;
            await updateObjectInSheet(instance);
            renderGrid();
        }
    }
}

async function handleToolbarDrop(data, gridX, gridY) {
    if (!viState.activeParentId) {
        showMessage("Cannot add an object without a selected room or container.");
        return;
    }

    let assetIdToUse = data.referenceId;

    // If the item doesn't have a referenceId, it's a new asset from the top toolbar.
    // We need to create a new entry for it in the 'Asset' sheet.
    if (!assetIdToUse) {
        const newAsset = {
            AssetID: `ASSET-${Date.now()}`,
            AssetName: data.name,
            AssetType: data.assetType,
            Condition: "New",
        };
        assetIdToUse = newAsset.AssetID;
        const newAssetRow = ASSET_HEADERS.map(h => newAsset[h] || '');
        await api.appendSheetValues(ASSET_SHEET, [newAssetRow]);
    }

    // Create the new instance in the spatial layout sheet, referencing the asset.
    const newInstance = {
        InstanceID: `INST-${Date.now()}`,
        ReferenceID: assetIdToUse,
        ParentID: viState.activeParentId,
        PosX: gridX,
        PosY: gridY,
        Width: data.width,
        Height: data.height,
        Orientation: data.assetType === 'Door' ? 'East' : 'Horizontal',
        ShelfRows: data.shelfRows,
        ShelfCols: data.shelfCols,
    };

    const newInstanceRow = SPATIAL_LAYOUT_HEADERS.map(h => newInstance[h] || '');
    await api.appendSheetValues(SPATIAL_LAYOUT_SHEET, [newInstanceRow]);

    window.dispatchEvent(new CustomEvent('datachanged'));
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
        const { allRooms } = getState();
        parentObject = allRooms.find(r => r.RoomID === viState.activeParentId);
        if (!parentObject) return;
        gridWidth = parentObject.GridWidth;
        gridHeight = parentObject.GridHeight;
    } else {
        const { spatialLayoutData } = getState();
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

    setTimeout(() => {
        const rect = roomGrid.getBoundingClientRect();
        const cellWidth = rect.width / gridWidth;
        const cellHeight = rect.height / gridHeight;
        roomGrid.style.backgroundSize = `${cellWidth}px ${cellHeight}px`;
    }, 0);
    const { spatialLayoutData } = getState();
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

    const typeClassMap = { 'Shelf': 'shelf', 'Container': 'container', 'Wall': 'wall', 'Door': 'door' };
    const typeClass = typeClassMap[assetInfo.AssetType] || 'asset-item';
    objEl.classList.add(typeClass);

    const isDoor = assetInfo.AssetType === 'Door';
    const isRotatable = assetInfo.AssetType !== 'Wall';

    let width = objectData.Width;
    let height = objectData.Height;
    if (isRotatable && !isDoor && objectData.Orientation === 'Vertical') {
        [width, height] = [height, width];
    }

    objEl.style.gridColumn = `${parseInt(objectData.PosX) + 1} / span ${width}`;
    objEl.style.gridRow = `${parseInt(objectData.PosY) + 1} / span ${height}`;

    if (typeClass === 'shelf' || typeClass === 'container') {
        objEl.addEventListener('mouseenter', (e) => showTooltip(e, objectData));
        objEl.addEventListener('mouseleave', hideTooltip);
    } else if (isDoor) {
        objEl.innerHTML = `<svg viewBox="0 0 500 500"><path d="M500,500h-95.21c.22-62.74-17.01-124.74-49.41-178.11-49.99-82.35-134.38-140.31-229.69-156.99-10.12-1.77-20.32-2.86-30.48-4.27v339.37H0v-28.91l.88-.75c.24-.02.44.46.58.46h61.92l.34-313.3c.24-.71.76-.83,1.42-.95,1.93-.35,7.04-.26,9.34-.26,25.01.06,53.35,4.68,77.52,10.94,139.42,36.08,243.83,158.82,254.8,303.02l93.2.84v28.91Z"/></svg>`;
        const svg = objEl.querySelector('svg');
        if (objectData.Orientation === 'North') svg.style.transform = 'rotate(270deg)';
        if (objectData.Orientation === 'South') svg.style.transform = 'rotate(90deg)';
        if (objectData.Orientation === 'West') svg.style.transform = 'scaleX(-1)';
    } else if(typeClass !== 'wall') {
        objEl.innerHTML = `<span class="truncate">${assetInfo.AssetName}</span>`;
    }

    objEl.addEventListener('dragstart', (e) => handleObjectDragStart(e, objectData));
    objEl.addEventListener('dragend', cleanupDrag);
    objEl.addEventListener('click', (e) => { e.stopPropagation(); selectObject(objectData.InstanceID); });
    objEl.addEventListener('dblclick', (e) => {
        if (typeClass === 'shelf' || typeClass === 'container') {
            e.stopPropagation();
            navigateTo(objectData.InstanceID, assetInfo.AssetName);
        }
    });
    objEl.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showRadialMenu(e.clientX, e.clientY, objectData.InstanceID); });
    parentGrid.appendChild(objEl);
}

// --- TOOLTIP ---
function showTooltip(event, objectData) {
    const assetInfo = getAssetByRefId(objectData.ReferenceID);
    if (!assetInfo || !globalTooltip) return;

    const { spatialLayoutData } = getState();
    const childCount = spatialLayoutData.filter(obj => obj.ParentID === objectData.InstanceID).length;
    globalTooltip.innerHTML = `<strong>${assetInfo.AssetName}</strong><br>Assets: ${childCount}`;
    globalTooltip.style.display = 'block';

    const rect = event.target.getBoundingClientRect();
    const tooltipRect = globalTooltip.getBoundingClientRect();
    let top = rect.top - tooltipRect.height - 10;
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

    if (top < 0) top = rect.bottom + 10;
    if (left < 0) left = 5;
    if (left + tooltipRect.width > window.innerWidth) left = window.innerWidth - tooltipRect.width - 5;

    globalTooltip.style.left = `${left}px`;
    globalTooltip.style.top = `${top}px`;
}

function hideTooltip() {
    if (globalTooltip) globalTooltip.style.display = 'none';
}

// --- UI POPULATION & HELPERS ---
function populateRoomSelector() {
    if (!vi.roomSelector) return;
    const currentValue = vi.roomSelector.value;
    vi.roomSelector.innerHTML = '<option value="">-- Select a Room --</option>';
    const { allRooms } = getState();
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
    const { allAssets } = getState();
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
    if (objEl) objEl.classList.add('selected');
}

async function updateObjectInSheet(updatedInstance) {
    const rowData = SPATIAL_LAYOUT_HEADERS.map(header => updatedInstance[header] || '');
    await api.updateSheetValues(`${SPATIAL_LAYOUT_SHEET}!A${updatedInstance.rowIndex}`, [rowData]);
}

// --- RADIAL MENU ---
function showRadialMenu(x, y, instanceId) {
    clearTimeout(hideMenuTimeout);
    viState.activeRadialInstanceId = instanceId;

    const { spatialLayoutData } = getState();
    const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
    const asset = instance ? getAssetByRefId(instance.ReferenceID) : null;
    if (!asset) return;

    const isContainer = asset.AssetType === 'Shelf' || asset.AssetType === 'Container';
    const isDoor = asset.AssetType === 'Door';
    const isWall = asset.AssetType === 'Wall';

    vi.radialRename.classList.toggle('hidden', isDoor || isWall);
    vi.radialFlip.classList.toggle('hidden', !isDoor);
    vi.radialOpen.classList.toggle('hidden', !isContainer);
    vi.radialRotate.classList.toggle('hidden', isWall);

    vi.radialMenu.style.left = `${x}px`;
    vi.radialMenu.style.top = `${y}px`;
    vi.radialMenu.classList.remove('hidden');

    setTimeout(() => vi.radialMenu.classList.add('visible'), 10);
}

function hideRadialMenu() {
    if (vi.radialMenu) {
        vi.radialMenu.classList.remove('visible');
        setTimeout(() => vi.radialMenu.classList.add('hidden'), 200);
    }
    viState.activeRadialInstanceId = null;
    clearTimeout(hideMenuTimeout);
}

async function handleRename(instanceId) {
    if (!instanceId) return;
    const { spatialLayoutData, allAssets } = getState();
    const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (!instance) return;
    const asset = allAssets.find(a => a.AssetID === instance.ReferenceID);
    if (!asset) return;
    const newName = prompt("Enter new name:", asset.AssetName);
    if (newName && newName.trim() && newName.trim() !== asset.AssetName) {
        asset.AssetName = newName.trim();
        const rowData = ASSET_HEADERS.map(h => asset[h] || '');
        await api.updateSheetValues(`${ASSET_SHEET}!A${asset.rowIndex}`, [rowData]);
        window.dispatchEvent(new CustomEvent('datachanged'));
    }
}

async function handleFlip(instanceId) {
    if (!instanceId) return;
    const { spatialLayoutData } = getState();
    const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (instance) {
        const flipMap = { 'East': 'West', 'West': 'East', 'North': 'South', 'South': 'North' };
        instance.Orientation = flipMap[instance.Orientation] || 'East';
        await updateObjectInSheet(instance);
        renderGrid();
    }
}

async function handleRotate(instanceId) {
    if (!instanceId) return;
    const { spatialLayoutData } = getState();
    const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (!instance) return;
    const asset = getAssetByRefId(instance.ReferenceID);
    if (!asset) return;
    if (asset.AssetType === 'Door') {
        const rotateMap = { 'East': 'South', 'South': 'West', 'West': 'North', 'North': 'East' };
        instance.Orientation = rotateMap[instance.Orientation] || 'South';
    } else {
        instance.Orientation = instance.Orientation === 'Horizontal' ? 'Vertical' : 'Horizontal';
    }
    await updateObjectInSheet(instance);
    renderGrid();
    setTimeout(() => selectObject(instanceId), 50);
}

function handleOpen(instanceId) {
    if (!instanceId) return;
    const { spatialLayoutData } = getState();
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
    const { spatialLayoutData, allAssets, sheetIds } = getState();
    const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (!instance) return;

    // Directly delete without confirmation
    const asset = allAssets.find(a => a.AssetID === instance.ReferenceID);
    if (asset) {
        const sheetId = sheetIds[ASSET_SHEET];
        await api.batchUpdateSheet({ requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: asset.rowIndex - 1, endIndex: asset.rowIndex } } }] });
    }
    const layoutSheetId = sheetIds[SPATIAL_LAYOUT_SHEET];
    await api.batchUpdateSheet({ requests: [{ deleteDimension: { range: { sheetId: layoutSheetId, dimension: "ROWS", startIndex: instance.rowIndex - 1, endIndex: instance.rowIndex } } }] });
    window.dispatchEvent(new CustomEvent('datachanged'));
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

    const { spatialLayoutData } = getState();
    const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (!instance) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let startWidth = parseInt(instance.Width);
    let startHeight = parseInt(instance.Height);
    let startPosX = parseInt(instance.PosX);
    let startPosY = parseInt(instance.PosY);

    const gridEl = document.getElementById('room-grid');
    const rect = gridEl.getBoundingClientRect();
    const gridTemplateCols = getComputedStyle(gridEl).gridTemplateColumns.split(' ');
    const cellWidth = rect.width / gridTemplateCols.length;
    const gridTemplateRows = getComputedStyle(gridEl).gridTemplateRows.split(' ');
    const cellHeight = rect.height / gridTemplateRows.length;

    function doDrag(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const dx_cells = Math.round(dx / cellWidth);
        const dy_cells = Math.round(dy / cellHeight);

        let newWidth = startWidth, newHeight = startHeight, newPosX = startPosX, newPosY = startPosY;

        if (direction === 'e') newWidth = Math.max(1, startWidth + dx_cells);
        if (direction === 's') newHeight = Math.max(1, startHeight + dy_cells);
        if (direction === 'w') {
            newWidth = Math.max(1, startWidth - dx_cells);
            if(newWidth !== startWidth) newPosX = startPosX + dx_cells;
        }
        if (direction === 'n') {
            newHeight = Math.max(1, startHeight - dy_cells);
            if(newHeight !== startHeight) newPosY = startPosY + dy_cells;
        }

        instance.Width = newWidth;
        instance.Height = newHeight;
        instance.PosX = newPosX;
        instance.PosY = newPosY;

        const objEl = document.querySelector(`[data-instance-id="${instanceId}"]`);
        if(objEl) {
            objEl.style.gridColumn = `${newPosX + 1} / span ${newWidth}`;
            objEl.style.gridRow = `${newPosY + 1} / span ${newHeight}`;
        }
    }

    function stopDrag() {
        document.removeEventListener('mousemove', doDrag);
        document.removeEventListener('mouseup', stopDrag);
        updateObjectInSheet(instance);
        setTimeout(() => createObjectResizeHandles(document.querySelector(`[data-instance-id="${instanceId}"]`), instanceId), 50);
    }

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
}

