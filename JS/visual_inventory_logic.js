// JS/visual_inventory_logic.js
import { SITES_SHEET, ROOMS_SHEET, ASSET_SHEET, SPATIAL_LAYOUT_SHEET, ASSET_HEADER_MAP, SPATIAL_LAYOUT_HEADER_MAP, ROOMS_HEADER_MAP } from './state.js';
import { getState } from './store.js';
import * as api from './sheetsService.js';
import { toggleModal, showMessage, dom, populateSelect } from './ui.js';
import { filterData } from './filterService.js';
import * as selectors from './selectors.js';

// --- STATE ---
let viState = {
    activeSiteId: null,
    activeRoomId: null,
    activeParentId: null,
    breadcrumbs: [],
    selectedInstanceId: null,
    activeRadialInstanceId: null,
};

// --- DOM REFERENCES & FLAGS ---
let viListenersInitialized = false;
let hideMenuTimeout; // Variable to manage the hide timer

// --- DRAG STATE & GLOBAL UI ---
let dragGhost = null;
let globalTooltip = null;

// --- INITIALIZATION ---
function setupAndBindVisualInventory() {
    if (viListenersInitialized) return true;

    if (!dom.viSiteSelector) {
        console.error("Fatal Error: A critical VI DOM element is missing. UI not initialized correctly.");
        return false;
    }

    if (!document.getElementById('inventory-global-tooltip')) {
        globalTooltip = document.createElement('div');
        globalTooltip.id = 'inventory-global-tooltip';
        document.body.appendChild(globalTooltip);
    } else {
        globalTooltip = document.getElementById('inventory-global-tooltip');
    }

    dom.createRoomBtn.addEventListener('click', () => {
        if (!viState.activeSiteId) {
            showMessage("Please select a site before adding a room.");
            return;
        }
        dom.roomForm.reset();
        document.getElementById('room-id-hidden').value = '';
        toggleModal(dom.roomModal, true);
    });
    
    dom.roomModal.querySelector('.modal-backdrop').addEventListener('click', () => toggleModal(dom.roomModal, false));
    dom.roomModal.querySelector('#cancel-room-btn').addEventListener('click', () => toggleModal(dom.roomModal, false));
    dom.contentsModal.querySelector('.modal-backdrop').addEventListener('click', () => toggleModal(dom.contentsModal, false));
    dom.contentsModal.querySelector('.modal-close-btn').addEventListener('click', () => toggleModal(dom.contentsModal, false));

    dom.roomForm.addEventListener('submit', handleRoomFormSubmit);
    dom.viSiteSelector.addEventListener('change', handleSiteSelection);
    dom.roomSelector.addEventListener('change', handleRoomSelection);
    dom.unplacedAssetSearch.addEventListener('input', () => renderUnplacedAssets(viState.activeSiteId));

    document.querySelectorAll('.toolbar-item').forEach(item => {
        item.addEventListener('dragstart', handleToolbarDragStart);
    });

    dom.gridContainer.addEventListener('dragover', handleGridDragOver);
    dom.gridContainer.addEventListener('drop', handleGridDrop);
    dom.gridContainer.addEventListener('click', (e) => {
        if (e.target === dom.gridContainer || e.target.id === 'room-grid') {
            selectObject(null);
        }
    });

    document.addEventListener('click', (e) => {
        if (dom.radialMenu && !dom.radialMenu.contains(e.target) && !e.target.closest('.visual-object')) {
            hideRadialMenu();
        }
    });

    dom.radialMenu.addEventListener('mouseenter', () => clearTimeout(hideMenuTimeout));
    dom.radialMenu.addEventListener('mouseleave', () => hideMenuTimeout = setTimeout(hideRadialMenu, 500));

    dom.radialRenameUse.addEventListener('click', () => { handleRename(viState.activeRadialInstanceId); hideRadialMenu(); });
    dom.radialFlipUse.addEventListener('click', () => { handleFlip(viState.activeRadialInstanceId); hideRadialMenu(); });
    dom.radialRotateUse.addEventListener('click', () => { handleRotate(viState.activeRadialInstanceId); hideRadialMenu(); });
    dom.radialResizeUse.addEventListener('click', () => { handleResize(viState.activeRadialInstanceId); hideRadialMenu(); });
    dom.radialOpenUse.addEventListener('click', () => { handleOpen(viState.activeRadialInstanceId); hideRadialMenu(); });
    dom.radialDeleteUse.addEventListener('click', async () => { await handleDelete(viState.activeRadialInstanceId); hideRadialMenu(); });

    viListenersInitialized = true;
    return true;
}

export function initVisualInventory() {
    if (!setupAndBindVisualInventory()) return;

    populateSelect(dom.viSiteSelector, getState().allSites, 'SiteID', 'SiteName', { initialOptionText: '-- Select a Site --' });
    renderUnplacedAssets(null); // Initially render all unplaced assets

    const lastSiteId = localStorage.getItem('lastActiveViSiteId');
    if (lastSiteId && getState().allSites.some(s => s.SiteID === lastSiteId)) {
        dom.viSiteSelector.value = lastSiteId;
        handleSiteSelection({ target: { value: lastSiteId } }); // Simulate selection
        
        const lastRoomId = localStorage.getItem('lastActiveRoomId');
        if (lastRoomId && dom.roomSelector.querySelector(`option[value="${lastRoomId}"]`)) {
            dom.roomSelector.value = lastRoomId;
            handleRoomSelection({ target: { value: lastRoomId } }); // Simulate selection
        }
    } else {
        renderGrid(); // Render empty state
    }
}

function renderUnplacedAssets(siteId) {
    if (!dom.unplacedAssetsList) return;

    const state = getState();
    const placedAssetReferenceIDs = new Set(state.spatialLayoutData.map(item => item.ReferenceID));
    let unplacedAssets = state.allAssets.filter(asset => !placedAssetReferenceIDs.has(asset.AssetID));
    
    // If a site is selected, filter unplaced assets to those whose original (deprecated) site matches
    // This provides a transitional way to find assets for a site before they get a proper ParentObjectID
    if (siteId) {
        const site = selectors.selectSitesById(state.allSites).get(siteId);
        if (site) {
            unplacedAssets = unplacedAssets.filter(asset => asset.Site === site.SiteName);
        }
    }

    const searchTerm = dom.unplacedAssetSearch.value;
    const searchFields = ['AssetName', 'AssetType', 'IDCode'];
    const filteredAssets = filterData(unplacedAssets, searchTerm, searchFields);

    dom.unplacedAssetsList.innerHTML = '';
    if (filteredAssets.length === 0) {
        dom.unplacedAssetsList.innerHTML = `<p class="text-xs text-gray-500 px-2">No unplaced assets found.</p>`;
        return;
    }

    filteredAssets.forEach(asset => {
        const itemEl = document.createElement('div');
        itemEl.className = 'toolbar-item bg-white border text-sm p-2 rounded-md';
        itemEl.setAttribute('draggable', 'true');
        itemEl.textContent = asset.AssetName || 'Unnamed Asset';
        itemEl.addEventListener('dragstart', (e) => {
             const data = { type: 'new-object', assetType: 'Container', name: asset.AssetName, width: 1, height: 1, referenceId: asset.AssetID };
            e.dataTransfer.setData('application/json', JSON.stringify(data));
        });
        dom.unplacedAssetsList.appendChild(itemEl);
    });
}

// --- DRAG AND DROP ---
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
    const cellWidth = rect.width / gridEl.style.gridTemplateColumns.split(' ').length;
    const cellHeight = rect.height / gridEl.style.gridTemplateRows.split(' ').length;
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
        SiteID: viState.activeSiteId,
        GridWidth: document.getElementById('grid-width').value,
        GridHeight: document.getElementById('grid-height').value,
    };
    const rowData = await api.prepareRowData(ROOMS_SHEET, roomData, ROOMS_HEADER_MAP);
    await api.appendSheetValues(ROOMS_SHEET, [rowData]);
    toggleModal(dom.roomModal, false);
    window.dispatchEvent(new CustomEvent('datachanged'));
}

function handleSiteSelection(e) {
    const siteId = e.target.value;
    viState.activeSiteId = siteId;
    localStorage.setItem('lastActiveViSiteId', siteId);

    const roomsForSite = selectors.selectRoomsBySiteId(getState(), siteId);
    populateSelect(dom.roomSelector, roomsForSite, 'RoomID', 'RoomName', { initialOptionText: '-- Select a Room --' });
    
    dom.roomSelector.disabled = !siteId;
    dom.createRoomBtn.disabled = !siteId;
    dom.createRoomBtn.classList.toggle('opacity-50', !siteId);
    
    viState.activeRoomId = null;
    viState.activeParentId = null;
    viState.breadcrumbs = [];
    renderBreadcrumbs();
    renderGrid();
    renderUnplacedAssets(siteId);
}

function handleRoomSelection(e) {
    const roomId = e.target.value;
    if (roomId) {
        const room = selectors.selectRoomsById(getState().allRooms).get(roomId);
        if (room) navigateTo(room.RoomID, room.RoomName);
    } else {
        viState.activeParentId = null;
        viState.breadcrumbs = [];
        renderBreadcrumbs();
        renderGrid();
    }
}

function handleToolbarDragStart(e) {
    const item = e.target;
    const data = {
        type: 'new-object', assetType: item.dataset.assetType, name: item.dataset.name,
        width: parseInt(item.dataset.width), height: parseInt(item.dataset.height),
        shelfRows: parseInt(item.dataset.shelfRows) || null, shelfCols: parseInt(item.dataset.shelfCols) || null,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(data));
}

async function handleGridDrop(e) {
    e.preventDefault();
    cleanupDrag();
    const data = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
    const gridEl = document.getElementById('room-grid');
    if (!data || !gridEl) return;

    const rect = gridEl.getBoundingClientRect();
    const cellWidth = rect.width / gridEl.style.gridTemplateColumns.split(' ').length;
    const cellHeight = rect.height / gridEl.style.gridTemplateRows.split(' ').length;
    const gridX = Math.floor((e.clientX - rect.left) / cellWidth);
    const gridY = Math.floor((e.clientY - rect.top) / cellHeight);

    if (data.type === 'new-object') await handleToolbarDrop(data, gridX, gridY);
    else if (data.type === 'move') {
        const instance = getState().spatialLayoutData.find(i => i.InstanceID === data.instanceId);
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

    const newInstanceData = {
        InstanceID: `INST-${Date.now()}`, ParentID: viState.activeParentId, PosX: gridX, PosY: gridY,
        Width: data.width, Height: data.height, ReferenceID: data.referenceId,
        Orientation: data.assetType === 'Door' ? 'East' : 'Horizontal',
        ShelfRows: data.shelfRows, ShelfCols: data.shelfCols,
    };
    
    if (!newInstanceData.ReferenceID) {
        const newAsset = { AssetID: `ASSET-${Date.now()}`, AssetName: data.name, AssetType: data.assetType, ParentObjectID: viState.activeParentId };
        newInstanceData.ReferenceID = newAsset.AssetID;
        const newAssetRow = await api.prepareRowData(ASSET_SHEET, newAsset, ASSET_HEADER_MAP);
        await api.appendSheetValues(ASSET_SHEET, [newAssetRow]);
    } else {
        // If we are placing an existing asset, update its ParentObjectID
        const asset = selectors.selectAssetsById(getState().allAssets).get(newInstanceData.ReferenceID);
        if(asset) {
            asset.ParentObjectID = viState.activeParentId;
            const rowData = await api.prepareRowData(ASSET_SHEET, asset, ASSET_HEADER_MAP);
            await api.updateSheetValues(`${ASSET_SHEET}!A${asset.rowIndex}`, [rowData]);
        }
    }
    
    const newInstanceRow = await api.prepareRowData(SPATIAL_LAYOUT_SHEET, newInstanceData, SPATIAL_LAYOUT_HEADER_MAP);
    await api.appendSheetValues(SPATIAL_LAYOUT_SHEET, [newInstanceRow]);

    window.dispatchEvent(new CustomEvent('datachanged'));
}

// --- NAVIGATION & RENDERING ---
function navigateTo(id, name) {
    if (!id) return;
    if (id.startsWith('ROOM-')) {
        viState.activeRoomId = id;
        viState.activeParentId = id;
        viState.breadcrumbs = [{ id, name }];
    } else {
        viState.activeParentId = id;
        const existingIndex = viState.breadcrumbs.findIndex(b => b.id === id);
        viState.breadcrumbs = existingIndex > -1 ? viState.breadcrumbs.slice(0, existingIndex + 1) : [...viState.breadcrumbs, { id, name }];
    }
    localStorage.setItem('lastActiveRoomId', viState.activeRoomId);
    selectObject(null);
    renderGrid();
    renderBreadcrumbs();
}

function renderBreadcrumbs() {
    dom.breadcrumbContainer.innerHTML = viState.breadcrumbs.map((crumb, index) => 
        index < viState.breadcrumbs.length - 1
            ? `<span><a href="#" data-id="${crumb.id}" data-name="${crumb.name}" class="hover:underline text-indigo-600">${crumb.name}</a> / </span>`
            : `<span class="font-semibold text-gray-700">${crumb.name}</span>`
    ).join('');
    dom.breadcrumbContainer.querySelectorAll('a').forEach(a => a.onclick = (e) => {
        e.preventDefault();
        navigateTo(e.target.dataset.id, e.target.dataset.name);
    });
}

function renderGrid() {
    selectObject(null);
    if (!viState.activeParentId) {
        dom.gridContainer.innerHTML = `<div id="room-grid" class="flex items-center justify-center h-full"><p class="text-gray-500">Please select a site and room to begin.</p></div>`;
        return;
    }
    dom.gridContainer.innerHTML = '<div id="room-grid"></div>';
    const roomGrid = document.getElementById('room-grid');
    const state = getState();
    const assetsById = selectors.selectAssetsById(state.allAssets);

    let gridWidth = 20, gridHeight = 15;
    if (viState.activeParentId.startsWith('ROOM-')) {
        const room = selectors.selectRoomsById(state.allRooms).get(viState.activeParentId);
        if (room) { gridWidth = room.GridWidth || 20; gridHeight = room.GridHeight || 15; }
    } else {
        const parentInstance = state.spatialLayoutData.find(o => o.InstanceID === viState.activeParentId);
        if (parentInstance) {
            gridWidth = parentInstance.Orientation === 'Vertical' ? parentInstance.ShelfRows : parentInstance.ShelfCols;
            gridHeight = parentInstance.Orientation === 'Vertical' ? parentInstance.ShelfCols : parentInstance.ShelfRows;
        }
    }

    roomGrid.style.gridTemplateColumns = `repeat(${gridWidth}, minmax(40px, 1fr))`;
    roomGrid.style.gridTemplateRows = `repeat(${gridHeight}, minmax(40px, 1fr))`;
    
    setTimeout(() => { // Defer background size calculation
        const rect = roomGrid.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            roomGrid.style.backgroundSize = `${rect.width / gridWidth}px ${rect.height / gridHeight}px`;
        }
    }, 0);

    state.spatialLayoutData.filter(obj => obj.ParentID === viState.activeParentId).forEach(obj => renderObject(obj, roomGrid, assetsById));
}

function renderObject(objectData, parentGrid, assetsById) {
    const assetInfo = assetsById.get(objectData.ReferenceID);
    if (!assetInfo) return;

    const objEl = document.createElement('div');
    objEl.className = 'visual-object flex items-center justify-center p-1 select-none';
    objEl.dataset.instanceId = objectData.InstanceID;
    objEl.setAttribute('draggable', 'true');
    const typeClass = { 'Shelf': 'shelf', 'Container': 'container', 'Wall': 'wall', 'Door': 'door' }[assetInfo.AssetType] || 'asset-item';
    objEl.classList.add(typeClass);

    let width = objectData.Width, height = objectData.Height;
    if (assetInfo.AssetType !== 'Wall' && assetInfo.AssetType !== 'Door' && objectData.Orientation === 'Vertical') {
        [width, height] = [height, width];
    }
    objEl.style.gridColumn = `${parseInt(objectData.PosX) + 1} / span ${width}`;
    objEl.style.gridRow = `${parseInt(objectData.PosY) + 1} / span ${height}`;

    if (typeClass === 'shelf' || typeClass === 'container') {
        objEl.addEventListener('mouseenter', (e) => showTooltip(e, objectData, assetsById));
        objEl.addEventListener('mouseleave', hideTooltip);
    }
    
    if (assetInfo.AssetType === 'Door') {
        objEl.innerHTML = `<svg viewBox="0 0 500 500"><path d="M500,500h-95.21c.22-62.74-17.01-124.74-49.41-178.11-49.99-82.35-134.38-140.31-229.69-156.99-10.12-1.77-20.32-2.86-30.48-4.27v339.37H0v-28.91l.88-.75c.24-.02.44.46.58.46h61.92l.34-313.3c.24-.71.76-.83,1.42-.95,1.93-.35,7.04-.26,9.34-.26,25.01.06,53.35,4.68,77.52,10.94,139.42,36.08,243.83,158.82,254.8,303.02l93.2.84v28.91Z"/></svg>`;
        const svg = objEl.querySelector('svg');
        if (objectData.Orientation === 'North') svg.style.transform = 'rotate(270deg)';
        if (objectData.Orientation === 'South') svg.style.transform = 'rotate(90deg)';
        if (objectData.Orientation === 'West') svg.style.transform = 'scaleX(-1)';
    } else if(typeClass !== 'wall') {
        objEl.innerHTML = `<span class="truncate pointer-events-none">${assetInfo.AssetName}</span>`;
    }

    objEl.addEventListener('dragstart', (e) => handleObjectDragStart(e, objectData));
    objEl.addEventListener('dragend', cleanupDrag);
    objEl.addEventListener('click', (e) => { e.stopPropagation(); selectObject(objectData.InstanceID); });
    objEl.addEventListener('dblclick', (e) => {
        if (['shelf', 'container'].includes(typeClass)) {
            e.stopPropagation(); navigateTo(objectData.InstanceID, assetInfo.AssetName);
        }
    });
    objEl.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showRadialMenu(e.clientX, e.clientY, objectData.InstanceID); });
    parentGrid.appendChild(objEl);
}

// --- TOOLTIP & UI HELPERS ---
function showTooltip(event, objectData, assetsById) {
    const assetInfo = assetsById.get(objectData.ReferenceID);
    if (!assetInfo || !globalTooltip) return;
    const childCount = getState().spatialLayoutData.filter(obj => obj.ParentID === objectData.InstanceID).length;
    globalTooltip.innerHTML = `<strong>${assetInfo.AssetName}</strong><br>Contains: ${childCount} items`;
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

// --- OBJECT MANIPULATION & SELECTION ---
function selectObject(instanceId) {
    document.querySelectorAll('.resize-handle').forEach(el => el.remove());
    document.querySelectorAll('.visual-object.selected').forEach(el => el.classList.remove('selected'));
    viState.selectedInstanceId = instanceId;
    if (!instanceId) return;
    const objEl = document.querySelector(`[data-instance-id="${instanceId}"]`);
    if (objEl) objEl.classList.add('selected');
}

async function updateObjectInSheet(updatedInstance) {
    const rowData = await api.prepareRowData(SPATIAL_LAYOUT_SHEET, updatedInstance, SPATIAL_LAYOUT_HEADER_MAP);
    await api.updateSheetValues(`${SPATIAL_LAYOUT_SHEET}!A${updatedInstance.rowIndex}`, [rowData]);
}

// --- RADIAL MENU ACTIONS ---
function showRadialMenu(x, y, instanceId) {
    clearTimeout(hideMenuTimeout);
    viState.activeRadialInstanceId = instanceId;
    const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId);
    const asset = instance ? selectors.selectAssetsById(getState().allAssets).get(instance.ReferenceID) : null;
    if (!asset) return;
    const isContainer = ['Shelf', 'Container'].includes(asset.AssetType);
    dom.radialRenameUse.classList.toggle('hidden', asset.AssetType === 'Door' || asset.AssetType === 'Wall');
    dom.radialFlipUse.classList.toggle('hidden', asset.AssetType !== 'Door');
    dom.radialOpenUse.classList.toggle('hidden', !isContainer);
    dom.radialRotateUse.classList.toggle('hidden', asset.AssetType === 'Wall');
    dom.radialResizeUse.classList.toggle('hidden', asset.AssetType === 'Door');
    dom.radialMenu.style.left = `${x}px`;
    dom.radialMenu.style.top = `${y}px`;
    dom.radialMenu.classList.remove('hidden');
    setTimeout(() => dom.radialMenu.classList.add('visible'), 10);
}

function hideRadialMenu() {
    if (dom.radialMenu) {
        dom.radialMenu.classList.remove('visible');
        setTimeout(() => dom.radialMenu.classList.add('hidden'), 200);
    }
    viState.activeRadialInstanceId = null;
    clearTimeout(hideMenuTimeout);
}

async function handleRename(instanceId) {
    const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId);
    const asset = instance ? selectors.selectAssetsById(getState().allAssets).get(instance.ReferenceID) : null;
    if (!asset) return;
    const newName = prompt("Enter new name:", asset.AssetName);
    if (newName && newName.trim() && newName.trim() !== asset.AssetName) {
        asset.AssetName = newName.trim();
        const rowData = await api.prepareRowData(ASSET_SHEET, asset, ASSET_HEADER_MAP);
        await api.updateSheetValues(`${ASSET_SHEET}!A${asset.rowIndex}`, [rowData]);
        window.dispatchEvent(new CustomEvent('datachanged'));
    }
}

async function handleFlip(instanceId) {
    const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (instance) {
        const flipMap = { 'East': 'West', 'West': 'East', 'North': 'South', 'South': 'North' };
        instance.Orientation = flipMap[instance.Orientation] || 'East';
        await updateObjectInSheet(instance);
        renderGrid();
    }
}

async function handleRotate(instanceId) {
    const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (!instance) return;
    const asset = selectors.selectAssetsById(getState().allAssets).get(instance.ReferenceID);
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
    const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (instance) {
        const assetInfo = selectors.selectAssetsById(getState().allAssets).get(instance.ReferenceID);
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
    const { spatialLayoutData, sheetIds, allAssets } = getState();
    const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (!instance) return;
    if (!confirm("Are you sure you want to delete this object? This cannot be undone.")) return;

    const asset = selectors.selectAssetsById(allAssets).get(instance.ReferenceID);
    const requests = [];
    const layoutSheetId = sheetIds[SPATIAL_LAYOUT_SHEET];
    if (layoutSheetId && instance.rowIndex) {
        requests.push({ deleteDimension: { range: { sheetId: layoutSheetId, dimension: "ROWS", startIndex: instance.rowIndex - 1, endIndex: instance.rowIndex } } });
    }

    // Only delete the underlying asset if it's NOT a structural type like a Shelf or Container
    if (asset && !['Shelf', 'Container', 'Wall', 'Door'].includes(asset.AssetType)) {
        const assetSheetId = sheetIds[ASSET_SHEET];
        if (assetSheetId && asset.rowIndex) {
            requests.push({ deleteDimension: { range: { sheetId: assetSheetId, dimension: "ROWS", startIndex: asset.rowIndex - 1, endIndex: asset.rowIndex } } });
        }
    }
    
    if (requests.length > 0) {
        await api.batchUpdateSheet({ requests });
        window.dispatchEvent(new CustomEvent('datachanged'));
    }
}

// ... (Rest of the file, including resize logic, is unchanged)
function createObjectResizeHandles(objEl, instanceId) {
    document.querySelectorAll('.resize-handle').forEach(el => el.remove());
    ['n', 's', 'e', 'w'].forEach(dir => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${dir}`;
        objEl.appendChild(handle);
        handle.addEventListener('mousedown', (e) => initResize(e, instanceId, dir));
    });
}

function initResize(e, instanceId, direction) {
    e.preventDefault();
    e.stopPropagation();

    const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (!instance) return;

    const startX = e.clientX, startY = e.clientY;
    let startWidth = parseInt(instance.Width), startHeight = parseInt(instance.Height);
    let startPosX = parseInt(instance.PosX), startPosY = parseInt(instance.PosY);

    const gridEl = document.getElementById('room-grid');
    const rect = gridEl.getBoundingClientRect();
    const cellWidth = rect.width / gridEl.style.gridTemplateColumns.split(' ').length;
    const cellHeight = rect.height / gridEl.style.gridTemplateRows.split(' ').length;

    function doDrag(e) {
        const dx_cells = Math.round((e.clientX - startX) / cellWidth);
        const dy_cells = Math.round((e.clientY - startY) / cellHeight);

        let newWidth = startWidth, newHeight = startHeight, newPosX = startPosX, newPosY = startPosY;

        if (direction === 'e') newWidth = Math.max(1, startWidth + dx_cells);
        if (direction === 's') newHeight = Math.max(1, startHeight + dy_cells);
        if (direction === 'w') {
            newWidth = Math.max(1, startWidth - dx_cells);
            newPosX = startPosX + dx_cells;
        }
        if (direction === 'n') {
            newHeight = Math.max(1, startHeight - dy_cells);
            newPosY = startPosY + dy_cells;
        }
        
        const objEl = document.querySelector(`[data-instance-id="${instanceId}"]`);
        if(objEl) {
            objEl.style.gridColumn = `${newPosX + 1} / span ${newWidth}`;
            objEl.style.gridRow = `${newPosY + 1} / span ${newHeight}`;
            instance.Width = newWidth; instance.Height = newHeight;
            instance.PosX = newPosX; instance.PosY = newPosY;
        }
    }

    function stopDrag() {
        document.removeEventListener('mousemove', doDrag);
        document.removeEventListener('mouseup', stopDrag);
        updateObjectInSheet(instance).then(() => {
            selectObject(instanceId);
            const objEl = document.querySelector(`[data-instance-id="${instanceId}"]`);
            if (objEl) createObjectResizeHandles(objEl, instanceId);
        });
    }

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
}
