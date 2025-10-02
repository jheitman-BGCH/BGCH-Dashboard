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
    selectedInstanceIds: [], // MODIFIED: Was selectedInstanceId, now an array for multi-select
    activeRadialInstanceId: null,
    unplacedAssetSort: 'asc',
    unplacedAssetGroupBy: 'none',
    clipboard: null, // NEW: For copy/paste functionality
};

// --- DOM REFERENCES & FLAGS ---
let viListenersInitialized = false;
let hideMenuTimeout;

// --- NEW: Drag and Snap State ---
let dragState = {
    isDragging: false,
    primaryElement: null,
    draggedInstances: [], // Holds data for all items being dragged
    offsets: [], // Relative offsets for multi-drag
    snapLines: [] // DOM elements for snap guides
};


// --- EMOJI MAPPING ---
const EMOJI_KEYWORD_MAP = {
    'laptop': '💻', 'macbook': '💻', 'chromebook': '💻', 'computer': '🖥️', 'monitor': '🖥️',
    'screen': '🖥️', 'imac': '🖥️', 'pc': '🖥️', 'server': '🗄️', 'nas': '🗄️', 'chair': '🪑',
    'stool': '🪑', 'seating': '🪑', 'desk': '🗄️', 'table': '🗄️', 'container': '📦', 'box': '📦',
    'shelf': '📚', 'bookshelf': '📚', 'rack': '📚', 'projector': '📽️', 'tablet': '📱',
    'ipad': '📱', 'phone': '☎️', 'tv': '📺', 'television': '📺', 'camera': '📷', 'webcam': '📷',
    'keyboard': '⌨️', 'mouse': '🖱️', 'router': '🌐', 'modem': '🌐', 'switch': '🌐', 'network': '🌐',
    'cable': '🔌', 'adapter': '🔌', 'charger': '🔌', 'printer': '🖨️', 'scanner': '🖨️',
    'headphone': '🎧', 'headset': '🎧', 'speaker': '🔊', 'microphone': '🎤',
};

function getEmojiForAssetType(assetType) {
    if (!assetType) return '📄';
    const lowerAssetType = assetType.toLowerCase();
    for (const keyword in EMOJI_KEYWORD_MAP) {
        if (lowerAssetType.includes(keyword)) return EMOJI_KEYWORD_MAP[keyword];
    }
    return '📄';
}

// --- DRAG STATE & GLOBAL UI ---
let globalTooltip = null;

// --- INITIALIZATION ---

// NEW: Restored handleToolbarDragStart function
function handleToolbarDragStart(e) {
    const target = e.target;
    const data = {
        type: 'new-object',
        assetType: target.dataset.assetType,
        name: target.dataset.name,
        width: parseInt(target.dataset.width || 1),
        height: parseInt(target.dataset.height || 1),
        shelfRows: parseInt(target.dataset.shelfRows || 0),
        shelfCols: parseInt(target.dataset.shelfCols || 0),
        referenceId: null // It's a new structural item, not based on an existing asset
    };
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'copy';
}

function setupAndBindVisualInventory() {
    if (viListenersInitialized) return true;
    if (!dom.viSiteSelector) return false;

    if (!document.getElementById('inventory-global-tooltip')) {
        globalTooltip = document.createElement('div');
        globalTooltip.id = 'inventory-global-tooltip';
        document.body.appendChild(globalTooltip);
    } else {
        globalTooltip = document.getElementById('inventory-global-tooltip');
    }

    // Event Listeners
    dom.createRoomBtn.addEventListener('click', () => {
        if (!viState.activeSiteId) return showMessage("Please select a site before adding a room.");
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
    dom.unplacedGroupBy.addEventListener('change', (e) => {
        viState.unplacedAssetGroupBy = e.target.value;
        renderUnplacedAssets(viState.activeSiteId);
    });
    dom.unplacedSortBtn.addEventListener('click', () => {
        viState.unplacedAssetSort = viState.unplacedAssetSort === 'asc' ? 'desc' : 'asc';
        dom.unplacedSortIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${viState.unplacedAssetSort === 'asc' ? 'M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12' : 'M3 4h13M3 8h9m-9 4h9m-9 4h13M16 8l4 4m0 0l4-4m-4 4v-4'}" />`;
        renderUnplacedAssets(viState.activeSiteId);
    });

    document.querySelectorAll('.toolbar-item').forEach(item => item.addEventListener('dragstart', handleToolbarDragStart));

    dom.gridContainer.addEventListener('dragover', handleGridDragOver);
    dom.gridContainer.addEventListener('drop', handleGridDrop);
    dom.gridContainer.addEventListener('click', (e) => {
        if (e.target === dom.gridContainer || e.target.id === 'room-grid') selectObject(null);
    });

    document.addEventListener('click', (e) => {
        if (dom.radialMenu && !dom.radialMenu.contains(e.target) && !e.target.closest('.visual-object')) hideRadialMenu();
    });

    dom.radialMenu.addEventListener('mouseenter', () => clearTimeout(hideMenuTimeout));
    dom.radialMenu.addEventListener('mouseleave', () => hideMenuTimeout = setTimeout(hideRadialMenu, 500));
    dom.radialRenameUse.addEventListener('click', () => { handleRename(viState.activeRadialInstanceId); hideRadialMenu(); });
    dom.radialFlipUse.addEventListener('click', () => { handleFlip(viState.activeRadialInstanceId); hideRadialMenu(); });
    dom.radialRotateUse.addEventListener('click', () => { handleRotate(viState.activeRadialInstanceId); hideRadialMenu(); });
    dom.radialResizeUse.addEventListener('click', () => { handleResize(viState.activeRadialInstanceId); hideRadialMenu(); });
    dom.radialOpenUse.addEventListener('click', () => { handleOpen(viState.activeRadialInstanceId); hideRadialMenu(); });
    dom.radialDeleteUse.addEventListener('click', async () => { await handleDelete([viState.activeRadialInstanceId]); hideRadialMenu(); });
    
    // NEW: Add keyboard shortcuts listener
    document.addEventListener('keydown', handleKeyDown);

    viListenersInitialized = true;
    return true;
}

export function initVisualInventory() {
    if (!setupAndBindVisualInventory()) return;
    dom.visualInventoryPanel.classList.remove('hidden'); // Ensure panel is visible
    populateSelect(dom.viSiteSelector, getState().allSites, 'SiteID', 'SiteName', { initialOptionText: '-- Select a Site --' });
    renderUnplacedAssets(null);
    const lastSiteId = localStorage.getItem('lastActiveViSiteId');
    if (lastSiteId && getState().allSites.some(s => s.SiteID === lastSiteId)) {
        dom.viSiteSelector.value = lastSiteId;
        handleSiteSelection({ target: { value: lastSiteId } });
        const lastRoomId = localStorage.getItem('lastActiveRoomId');
        if (lastRoomId && dom.roomSelector.querySelector(`option[value="${lastRoomId}"]`)) {
            dom.roomSelector.value = lastRoomId;
            handleRoomSelection({ target: { value: lastRoomId } });
        }
    } else {
        renderGrid();
    }
}

// --- UNPLACED ASSETS ---
function createUnplacedAssetElement(asset) {
    const itemEl = document.createElement('div');
    itemEl.className = 'unplaced-asset-item';
    itemEl.draggable = true;
    itemEl.dataset.assetType = (asset.AssetType || 'unknown').toLowerCase().replace(/\s+/g, '-');
    itemEl.innerHTML = `<span class="unplaced-asset-icon">${getEmojiForAssetType(asset.AssetType)}</span><span class="unplaced-asset-name">${asset.AssetName || 'Unnamed Asset'}</span>`;
    itemEl.title = `${asset.AssetName} (${asset.AssetType})`;
    itemEl.addEventListener('dragstart', (e) => {
        const data = { type: 'new-object', assetType: asset.AssetType, name: asset.AssetName, width: 1, height: 1, referenceId: asset.AssetID };
        e.dataTransfer.setData('application/json', JSON.stringify(data));
    });
    return itemEl;
}

function renderUnplacedAssets(siteId) {
    if (!dom.unplacedAssetsList) return;
    const state = getState();
    const placedAssetReferenceIDs = new Set(state.spatialLayoutData.map(item => item.ReferenceID));
    let unplacedAssets = state.allAssets.filter(asset => !placedAssetReferenceIDs.has(asset.AssetID));
    if (siteId) {
        const site = selectors.selectSitesById(state.allSites).get(siteId);
        if (site) {
            unplacedAssets = unplacedAssets.filter(asset => {
                 const parentId = selectors.selectResolvedAssetParentId(asset, state);
                 const path = selectors.selectFullLocationPath(state, parentId);
                 const assetSite = path.find(p => p.SiteID);
                 return assetSite ? assetSite.SiteID === siteId : asset.Site === site.SiteName;
            });
        }
    }
    const unplacedAssetIds = new Set(unplacedAssets.map(a => a.AssetID));
    let rootUnplacedAssets = unplacedAssets.filter(asset => !unplacedAssetIds.has(selectors.selectResolvedAssetParentId(asset, state)));
    let finalAssets = filterData(rootUnplacedAssets, dom.unplacedAssetSearch.value, ['AssetName', 'AssetType', 'IDCode']);
    finalAssets.sort((a, b) => (a.AssetName || '').localeCompare(b.AssetName || ''));
    if (viState.unplacedAssetSort === 'desc') finalAssets.reverse();

    dom.unplacedAssetsList.innerHTML = '';
    if (finalAssets.length === 0) return dom.unplacedAssetsList.innerHTML = `<p class="text-xs text-gray-500 px-2">No unplaced assets found.</p>`;

    if (viState.unplacedAssetGroupBy === 'assetType') {
        const grouped = finalAssets.reduce((acc, asset) => {
            const type = asset.AssetType || 'Uncategorized';
            if (!acc[type]) acc[type] = [];
            acc[type].push(asset);
            return acc;
        }, {});
        Object.keys(grouped).sort().forEach(groupName => {
            const groupHeader = document.createElement('h4');
            groupHeader.className = 'unplaced-group-header';
            groupHeader.textContent = groupName;
            dom.unplacedAssetsList.appendChild(groupHeader);
            grouped[groupName].forEach(asset => dom.unplacedAssetsList.appendChild(createUnplacedAssetElement(asset)));
        });
    } else {
        finalAssets.forEach(asset => dom.unplacedAssetsList.appendChild(createUnplacedAssetElement(asset)));
    }
}

// --- DRAG AND DROP ---
function handleObjectDragStart(e, objectData) {
    e.stopPropagation();
    const state = getState();
    dragState.isDragging = true;

    // If the dragged item is part of a selection, drag all selected items. Otherwise, just drag the one item.
    const isMultiDragging = viState.selectedInstanceIds.includes(objectData.InstanceID);
    const idsToDrag = isMultiDragging ? viState.selectedInstanceIds : [objectData.InstanceID];
    
    dragState.draggedInstances = idsToDrag.map(id => state.spatialLayoutData.find(i => i.InstanceID === id)).filter(Boolean);
    
    const primaryInstance = dragState.draggedInstances.find(i => i.InstanceID === objectData.InstanceID);
    
    // Calculate offsets from the primary dragged element
    dragState.offsets = dragState.draggedInstances.map(instance => ({
        x: instance.PosX - primaryInstance.PosX,
        y: instance.PosY - primaryInstance.PosY
    }));
    
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'move', instanceId: objectData.InstanceID }));
    e.dataTransfer.effectAllowed = 'move';
    
    // Use a transparent image as drag image to hide the default ghost
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);

    // Create a custom ghost for visual feedback
    const ghostContainer = document.createElement('div');
    ghostContainer.id = 'drag-ghost-container';
    ghostContainer.style.position = 'absolute';
    ghostContainer.style.pointerEvents = 'none';
    ghostContainer.style.zIndex = '1000';
    document.body.appendChild(ghostContainer);
    dragState.primaryElement = ghostContainer;

    dragState.draggedInstances.forEach(instance => {
        const el = document.querySelector(`[data-instance-id="${instance.InstanceID}"]`);
        if(el) {
            const clone = el.cloneNode(true);
            clone.style.position = 'absolute';
            const offset = dragState.offsets.find(o => o.x === instance.PosX - primaryInstance.PosX && o.y === instance.PosY - primaryInstance.PosY);
            clone.style.left = `${offset.x * 40}px`; // Approximate cell width for initial placement
            clone.style.top = `${offset.y * 40}px`;
            ghostContainer.appendChild(clone);
            el.classList.add('dragging-source');
        }
    });

    moveDragGhost(e);
}

function moveDragGhost(e) {
    if (!dragState.primaryElement) return;
    dragState.primaryElement.style.left = `${e.pageX}px`;
    dragState.primaryElement.style.top = `${e.pageY}px`;
}


function handleGridDragOver(e) {
    e.preventDefault();
    if (!dragState.isDragging) return;
    moveDragGhost(e);
    
    // --- Snapping Logic ---
    const gridEl = document.getElementById('room-grid');
    if (!gridEl) return;
    
    const rect = gridEl.getBoundingClientRect();
    const cellWidth = rect.width / gridEl.style.gridTemplateColumns.split(' ').length;
    const cellHeight = rect.height / gridEl.style.gridTemplateRows.split(' ').length;
    
    const primaryInstance = dragState.draggedInstances[0];
    if (!primaryInstance) return;

    let targetX = e.clientX - rect.left - (primaryInstance.Width * cellWidth / 2);
    let targetY = e.clientY - rect.top - (primaryInstance.Height * cellHeight / 2);

    const { finalX, finalY } = calculateSnapping(targetX, targetY, primaryInstance, cellWidth, cellHeight);

    // Adjust ghost position based on snapping
    dragState.primaryElement.style.left = `${finalX + rect.left}px`;
    dragState.primaryElement.style.top = `${finalY + rect.top}px`;
}

function cleanupDrag() {
    dragState.isDragging = false;
    if (dragState.primaryElement) {
        dragState.primaryElement.remove();
        dragState.primaryElement = null;
    }
    dragState.draggedInstances = [];
    dragState.offsets = [];
    hideSnapGuides();
    document.querySelectorAll('.dragging-source').forEach(el => el.classList.remove('dragging-source'));
}

async function handleGridDrop(e) {
    e.preventDefault();
    const gridEl = document.getElementById('room-grid');
    const data = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
    if (!data || !gridEl) {
        cleanupDrag();
        return;
    }

    const rect = gridEl.getBoundingClientRect();
    const cellWidth = rect.width / gridEl.style.gridTemplateColumns.split(' ').length;
    const cellHeight = rect.height / gridEl.style.gridTemplateRows.split(' ').length;
    
    if (data.type === 'new-object') {
        const gridX = Math.floor((e.clientX - rect.left) / cellWidth);
        const gridY = Math.floor((e.clientY - rect.top) / cellHeight);
        await handleToolbarDrop(data, gridX, gridY);
    } else if (data.type === 'move' && dragState.draggedInstances.length > 0) {
        const primaryInstance = dragState.draggedInstances[0];
        const { finalX, finalY } = calculateSnapping(
            e.clientX - rect.left - (primaryInstance.Width * cellWidth / 2),
            e.clientY - rect.top - (primaryInstance.Height * cellHeight / 2),
            primaryInstance, cellWidth, cellHeight
        );
        const finalGridX = Math.round(finalX / cellWidth);
        const finalGridY = Math.round(finalY / cellHeight);

        const updatePromises = dragState.draggedInstances.map((instance, index) => {
            const offset = dragState.offsets[index];
            instance.PosX = finalGridX + offset.x;
            instance.PosY = finalGridY + offset.y;
            return updateObjectInSheet(instance);
        });
        await Promise.all(updatePromises);
        renderGrid();
    }
    cleanupDrag();
}

async function handleToolbarDrop(data, gridX, gridY) {
    if (!viState.activeParentId) return showMessage("Cannot add an object without a selected room or container.");
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

// --- RENDERING & NAVIGATION ---
function renderGrid() {
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
    
    setTimeout(() => {
        const rect = roomGrid.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) roomGrid.style.backgroundSize = `${rect.width / gridWidth}px ${rect.height / gridHeight}px`;
    }, 0);

    state.spatialLayoutData.filter(obj => obj.ParentID === viState.activeParentId).forEach(obj => renderObject(obj, roomGrid, assetsById));
    updateSelectionVisuals();
}

function renderObject(objectData, parentGrid, assetsById) {
    const assetInfo = assetsById.get(objectData.ReferenceID);
    if (!assetInfo) return;

    const objEl = document.createElement('div');
    objEl.className = 'visual-object flex items-center justify-center p-1 select-none';
    objEl.dataset.instanceId = objectData.InstanceID;
    objEl.draggable = true;
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
    objEl.addEventListener('click', (e) => { e.stopPropagation(); selectObject(objectData.InstanceID, e.shiftKey); });
    objEl.addEventListener('dblclick', (e) => {
        if (['shelf', 'container'].includes(typeClass)) { e.stopPropagation(); navigateTo(objectData.InstanceID, assetInfo.AssetName); }
    });
    objEl.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showRadialMenu(e.clientX, e.clientY, objectData.InstanceID); });
    parentGrid.appendChild(objEl);
}

// --- EVENT HANDLERS & NAVIGATION ---
async function handleRoomFormSubmit(e) {
    e.preventDefault();
    const roomData = { RoomID: `ROOM-${Date.now()}`, RoomName: document.getElementById('room-name').value, SiteID: viState.activeSiteId, GridWidth: document.getElementById('grid-width').value, GridHeight: document.getElementById('grid-height').value };
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
    dom.breadcrumbContainer.innerHTML = viState.breadcrumbs.map((crumb, index) => index < viState.breadcrumbs.length - 1 ? `<span><a href="#" data-id="${crumb.id}" data-name="${crumb.name}" class="hover:underline text-indigo-600">${crumb.name}</a> / </span>` : `<span class="font-semibold text-gray-700">${crumb.name}</span>`).join('');
    dom.breadcrumbContainer.querySelectorAll('a').forEach(a => a.onclick = (e) => { e.preventDefault(); navigateTo(e.target.dataset.id, e.target.dataset.name); });
}

// --- OBJECT MANIPULATION & SELECTION ---
function selectObject(instanceId, isMultiSelect = false) {
    document.querySelectorAll('.resize-handle').forEach(el => el.remove());
    const selectedIds = new Set(viState.selectedInstanceIds);
    if (instanceId === null) {
        selectedIds.clear();
    } else if (isMultiSelect) {
        selectedIds.has(instanceId) ? selectedIds.delete(instanceId) : selectedIds.add(instanceId);
    } else {
        selectedIds.clear();
        selectedIds.add(instanceId);
    }
    viState.selectedInstanceIds = Array.from(selectedIds);
    updateSelectionVisuals();
}

function updateSelectionVisuals() {
    document.querySelectorAll('.visual-object.selected').forEach(el => el.classList.remove('selected'));
    viState.selectedInstanceIds.forEach(id => {
        const objEl = document.querySelector(`[data-instance-id="${id}"]`);
        if (objEl) objEl.classList.add('selected');
    });
}

async function updateObjectInSheet(updatedInstance) {
    const rowData = await api.prepareRowData(SPATIAL_LAYOUT_SHEET, updatedInstance, SPATIAL_LAYOUT_HEADER_MAP);
    await api.updateSheetValues(`${SPATIAL_LAYOUT_SHEET}!A${updatedInstance.rowIndex}`, [rowData]);
}

// --- RADIAL MENU & ACTIONS ---
// (handleRename, handleFlip, handleRotate, handleOpen, handleResize logic remains largely the same)
function showRadialMenu(x, y, instanceId) {
    clearTimeout(hideMenuTimeout);
    if(viState.selectedInstanceIds.length > 1) { // Don't show menu for multi-select
        selectObject(instanceId); // Select only the right-clicked item
    }
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
        instance.Orientation = { 'East': 'West', 'West': 'East', 'North': 'South', 'South': 'North' }[instance.Orientation] || 'East';
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
        instance.Orientation = { 'East': 'South', 'South': 'West', 'West': 'North', 'North': 'East' }[instance.Orientation] || 'South';
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

// --- NEW: Keyboard Shortcut Handlers ---
function handleKeyDown(e) {
    if (dom.visualInventoryPanel.classList.contains('hidden') || document.querySelector('.modal-container:not(.hidden)')) {
        return; // Don't run shortcuts if VI isn't active or a modal is open
    }
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    if ((e.key === 'Delete' || e.key === 'Backspace') && viState.selectedInstanceIds.length > 0) {
        e.preventDefault();
        handleDelete(viState.selectedInstanceIds);
    } else if (isCtrlOrMeta && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopy();
    } else if (isCtrlOrMeta && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePaste();
    }
}

async function handleDelete(instanceIdsToDelete) {
    if (!instanceIdsToDelete || instanceIdsToDelete.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${instanceIdsToDelete.length} object(s)? This cannot be undone.`)) return;

    const { spatialLayoutData, sheetIds, allAssets } = getState();
    const requests = [];
    const layoutSheetId = sheetIds[SPATIAL_LAYOUT_SHEET];
    const assetSheetId = sheetIds[ASSET_SHEET];

    instanceIdsToDelete.forEach(instanceId => {
        const instance = spatialLayoutData.find(i => i.InstanceID === instanceId);
        if (instance && layoutSheetId && instance.rowIndex) {
            requests.push({ deleteDimension: { range: { sheetId: layoutSheetId, dimension: "ROWS", startIndex: instance.rowIndex - 1, endIndex: instance.rowIndex } } });
            const asset = selectors.selectAssetsById(allAssets).get(instance.ReferenceID);
            if (asset && !['Shelf', 'Container', 'Wall', 'Door'].includes(asset.AssetType) && assetSheetId && asset.rowIndex) {
                requests.push({ deleteDimension: { range: { sheetId: assetSheetId, dimension: "ROWS", startIndex: asset.rowIndex - 1, endIndex: asset.rowIndex } } });
            }
        }
    });
    
    if (requests.length > 0) {
        await api.batchUpdateSheet({ requests });
        window.dispatchEvent(new CustomEvent('datachanged'));
    }
}

function handleCopy() {
    if (viState.selectedInstanceIds.length === 0) return;
    const { spatialLayoutData, allAssets } = getState();
    const assetsById = selectors.selectAssetsById(allAssets);
    
    viState.clipboard = viState.selectedInstanceIds.map(id => {
        const instance = spatialLayoutData.find(i => i.InstanceID === id);
        const asset = assetsById.get(instance?.ReferenceID);
        return { instance, asset };
    }).filter(item => item.instance && item.asset);
    
    if (viState.clipboard.length > 0) {
        showMessage(`Copied ${viState.clipboard.length} item(s).`, 'success');
    }
}

async function handlePaste() {
    if (!viState.clipboard || viState.clipboard.length === 0 || !viState.activeParentId) return;

    const newInstanceRows = [];
    const newAssetRows = [];
    const newSelectedIds = [];

    for (const item of viState.clipboard) {
        let newReferenceId = item.instance.ReferenceID;
        const isStructural = ['Shelf', 'Container', 'Wall', 'Door'].includes(item.asset.AssetType);

        if (!isStructural) {
            newReferenceId = `ASSET-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const newAsset = { ...item.asset, AssetID: newReferenceId, AssetName: `${item.asset.AssetName} (Copy)`, ParentObjectID: viState.activeParentId };
            delete newAsset.rowIndex;
            newAssetRows.push(await api.prepareRowData(ASSET_SHEET, newAsset, ASSET_HEADER_MAP));
        }

        const newInstanceId = `INST-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const newInstance = {
            ...item.instance,
            InstanceID: newInstanceId,
            ReferenceID: newReferenceId,
            ParentID: viState.activeParentId,
            PosX: parseInt(item.instance.PosX) + 1, // Offset paste
            PosY: parseInt(item.instance.PosY) + 1,
        };
        delete newInstance.rowIndex;
        newInstanceRows.push(await api.prepareRowData(SPATIAL_LAYOUT_SHEET, newInstance, SPATIAL_LAYOUT_HEADER_MAP));
        newSelectedIds.push(newInstanceId);
    }

    if (newAssetRows.length > 0) await api.appendSheetValues(ASSET_SHEET, newAssetRows);
    if (newInstanceRows.length > 0) await api.appendSheetValues(SPATIAL_LAYOUT_SHEET, newInstanceRows);
    
    showMessage(`Pasted ${newInstanceRows.length} item(s).`, 'success');
    window.dispatchEvent(new CustomEvent('datachanged'));
    
    // Defer selection until after data reload and re-render
    setTimeout(() => {
        selectObject(null); // Clear previous selection
        viState.selectedInstanceIds = newSelectedIds;
        updateSelectionVisuals();
    }, 500);
}

// --- SNAPPING & ALIGNMENT ---
function calculateSnapping(targetX, targetY, primaryInstance, cellWidth, cellHeight) {
    hideSnapGuides();
    const snapThreshold = 6; // pixels
    let finalX = targetX, finalY = targetY;

    const staticObjects = getState().spatialLayoutData.filter(
        obj => obj.ParentID === viState.activeParentId && !dragState.draggedInstances.some(d => d.InstanceID === obj.InstanceID)
    );
    
    const draggedRect = {
        left: targetX, top: targetY,
        right: targetX + primaryInstance.Width * cellWidth,
        bottom: targetY + primaryInstance.Height * cellHeight,
        hCenter: targetX + (primaryInstance.Width * cellWidth) / 2,
        vCenter: targetY + (primaryInstance.Height * cellHeight) / 2
    };

    staticObjects.forEach(obj => {
        const staticRect = {
            left: obj.PosX * cellWidth, top: obj.PosY * cellHeight,
            right: (obj.PosX * 1 + obj.Width * 1) * cellWidth,
            bottom: (obj.PosY * 1 + obj.Height * 1) * cellHeight,
            hCenter: (obj.PosX * 1 + obj.Width / 2) * cellWidth,
            vCenter: (obj.PosY * 1 + obj.Height / 2) * cellHeight
        };
        // Vertical snapping
        if (Math.abs(draggedRect.left - staticRect.left) < snapThreshold) { finalX = staticRect.left; showSnapGuide('vertical', staticRect.left); }
        if (Math.abs(draggedRect.right - staticRect.right) < snapThreshold) { finalX = staticRect.right - (primaryInstance.Width * cellWidth); showSnapGuide('vertical', staticRect.right); }
        if (Math.abs(draggedRect.hCenter - staticRect.hCenter) < snapThreshold) { finalX = staticRect.hCenter - (primaryInstance.Width * cellWidth / 2); showSnapGuide('vertical', staticRect.hCenter); }
        if (Math.abs(draggedRect.left - staticRect.right) < snapThreshold) { finalX = staticRect.right; showSnapGuide('vertical', staticRect.right); }
        if (Math.abs(draggedRect.right - staticRect.left) < snapThreshold) { finalX = staticRect.left - (primaryInstance.Width * cellWidth); showSnapGuide('vertical', staticRect.left); }
        
        // Horizontal snapping
        if (Math.abs(draggedRect.top - staticRect.top) < snapThreshold) { finalY = staticRect.top; showSnapGuide('horizontal', staticRect.top); }
        if (Math.abs(draggedRect.bottom - staticRect.bottom) < snapThreshold) { finalY = staticRect.bottom - (primaryInstance.Height * cellHeight); showSnapGuide('horizontal', staticRect.bottom); }
        if (Math.abs(draggedRect.vCenter - staticRect.vCenter) < snapThreshold) { finalY = staticRect.vCenter - (primaryInstance.Height * cellHeight / 2); showSnapGuide('horizontal', staticRect.vCenter); }
        if (Math.abs(draggedRect.top - staticRect.bottom) < snapThreshold) { finalY = staticRect.bottom; showSnapGuide('horizontal', staticRect.bottom); }
        if (Math.abs(draggedRect.bottom - staticRect.top) < snapThreshold) { finalY = staticRect.top - (primaryInstance.Height * cellHeight); showSnapGuide('horizontal', staticRect.top); }
    });
    
    return { finalX, finalY };
}

function showSnapGuide(orientation, position) {
    const guide = document.createElement('div');
    guide.className = `snap-guide ${orientation}`;
    if (orientation === 'vertical') guide.style.left = `${position}px`;
    else guide.style.top = `${position}px`;
    dom.gridContainer.appendChild(guide);
    dragState.snapLines.push(guide);
}

function hideSnapGuides() {
    dragState.snapLines.forEach(line => line.remove());
    dragState.snapLines = [];
}

// Resize logic (unchanged)
function createObjectResizeHandles(objEl, instanceId) { /*...*/ }
function initResize(e, instanceId, direction) { /*...*/ }
function showTooltip(event, objectData, assetsById) { /*...*/ }
function hideTooltip() { /*...*/ }

