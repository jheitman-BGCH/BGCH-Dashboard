// JS/visual_inventory_logic.js
import { SITES_SHEET, ROOMS_SHEET, ASSET_SHEET, SPATIAL_LAYOUT_SHEET, ASSET_HEADER_MAP, SPATIAL_LAYOUT_HEADER_MAP, ROOMS_HEADER_MAP, CONTAINERS_SHEET, CONTAINERS_HEADER_MAP } from './state.js';
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
    selectedInstanceIds: [],
    activeRadialInstanceId: null,
    unplacedAssetSort: 'asc',
    unplacedAssetGroupBy: 'none',
    clipboard: null,
};

// --- NEW: Konva State ---
let stage, gridLayer, objectsLayer;
let cellWidth, cellHeight;

// --- DOM REFERENCES & FLAGS ---
let viListenersInitialized = false;
let hideMenuTimeout;
let globalTooltip = null;


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


// --- INITIALIZATION ---
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

    document.querySelectorAll('.toolbar-item').forEach(item => item.addEventListener('dragstart', (e) => {
        const target = e.target;
        const data = {
            type: 'new-object',
            assetType: target.dataset.assetType,
            name: target.dataset.name,
            width: parseInt(target.dataset.width || 1),
            height: parseInt(target.dataset.height || 1),
            shelfRows: parseInt(target.dataset.shelfRows || 0),
            shelfCols: parseInt(target.dataset.shelfCols || 0),
            referenceId: null 
        };
        e.dataTransfer.setData('application/json', JSON.stringify(data));
        e.dataTransfer.effectAllowed = 'copy';
    }));

    // Listen for drops on the container, which holds the canvas
    dom.gridContainer.addEventListener('dragover', (e) => e.preventDefault());
    dom.gridContainer.addEventListener('drop', handleGridDrop);
    
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
    
    document.addEventListener('keydown', handleKeyDown);

    viListenersInitialized = true;
    return true;
}

export function initVisualInventory() {
    if (!setupAndBindVisualInventory()) return;
    dom.visualInventoryPanel.classList.remove('hidden');
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

// --- UNPLACED ASSETS (Logic unchanged) ---
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
    const placedReferenceIDs = new Set(state.spatialLayoutData.map(item => item.ReferenceID));
    const allAssets = state.allAssets;
    const allContainers = state.allContainers.map(c => ({
        AssetID: c.ContainerID,
        AssetName: c.ContainerName,
        AssetType: c.ContainerType || 'Container',
        ParentObjectID: c.ParentID,
        isContainer: true
    }));
    const combinedItemsMap = new Map();
    allAssets.forEach(a => combinedItemsMap.set(a.AssetID, a));
    allContainers.forEach(c => {
        if (!combinedItemsMap.has(c.AssetID)) {
            combinedItemsMap.set(c.AssetID, c);
        }
    });
    const allItems = Array.from(combinedItemsMap.values());
    let unplacedItems = allItems.filter(item => !placedReferenceIDs.has(item.AssetID));
    const containerIds = new Set(state.allContainers.map(c => c.ContainerID));
    let displayableUnplacedItems = unplacedItems.filter(item => {
        const parentId = selectors.selectResolvedAssetParentId(item, state);
        if (!parentId || containerIds.has(parentId)) return false;
        if (siteId) {
            const path = selectors.selectFullLocationPath(state, parentId);
            const itemSite = path.find(p => p.SiteID);
            return itemSite ? itemSite.SiteID === siteId : false;
        }
        return true;
    });
    if (viState.activeRoomId) {
        displayableUnplacedItems = displayableUnplacedItems.filter(item => {
            const parentId = selectors.selectResolvedAssetParentId(item, state);
            return parentId === viState.activeRoomId;
        });
    }
    let finalItems = filterData(displayableUnplacedItems, dom.unplacedAssetSearch.value, ['AssetName', 'AssetType', 'IDCode']);
    finalItems.sort((a, b) => (a.AssetName || '').localeCompare(b.AssetName || ''));
    if (viState.unplacedAssetSort === 'desc') finalItems.reverse();
    dom.unplacedAssetsList.innerHTML = '';
    if (finalItems.length === 0) {
        dom.unplacedAssetsList.innerHTML = `<p class="text-xs text-gray-500 px-2">No unplaced items found for this view.</p>`;
        return;
    }
    if (viState.unplacedAssetGroupBy === 'assetType') {
        const grouped = finalItems.reduce((acc, item) => {
            const type = item.AssetType || 'Uncategorized';
            if (!acc[type]) acc[type] = [];
            acc[type].push(item);
            return acc;
        }, {});
        Object.keys(grouped).sort().forEach(groupName => {
            const groupHeader = document.createElement('h4');
            groupHeader.className = 'unplaced-group-header';
            groupHeader.textContent = groupName;
            dom.unplacedAssetsList.appendChild(groupHeader);
            grouped[groupName].forEach(item => dom.unplacedAssetsList.appendChild(createUnplacedAssetElement(item)));
        });
    } else {
        finalItems.forEach(item => dom.unplacedAssetsList.appendChild(createUnplacedAssetElement(item)));
    }
}

// --- DRAG AND DROP ---
async function handleGridDrop(e) {
    e.preventDefault();
    if (!stage) return;
    const data = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
    if (!data || data.type !== 'new-object') return;

    stage.setPointersPositions(e);
    const pos = stage.getPointerPosition();
    const gridX = Math.floor(pos.x / cellWidth);
    const gridY = Math.floor(pos.y / cellHeight);

    await handleToolbarDrop(data, gridX, gridY);
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
        const state = getState();
        const referenceId = newInstanceData.ReferenceID;
        const asset = selectors.selectAssetsById(state.allAssets).get(referenceId);
        const container = selectors.selectContainersById(state.allContainers).get(referenceId);

        if (asset) {
            asset.ParentObjectID = viState.activeParentId;
            const rowData = await api.prepareRowData(ASSET_SHEET, asset, ASSET_HEADER_MAP);
            await api.updateSheetValues(`${ASSET_SHEET}!A${asset.rowIndex}`, [rowData]);
        } else if (container) {
            container.ParentID = viState.activeParentId;
            const rowData = await api.prepareRowData(CONTAINERS_SHEET, container, CONTAINERS_HEADER_MAP);
            await api.updateSheetValues(`${CONTAINERS_SHEET}!A${container.rowIndex}`, [rowData]);
        }
    }
    const newInstanceRow = await api.prepareRowData(SPATIAL_LAYOUT_SHEET, newInstanceData, SPATIAL_LAYOUT_HEADER_MAP);
    await api.appendSheetValues(SPATIAL_LAYOUT_SHEET, [newInstanceRow]);
    window.dispatchEvent(new CustomEvent('datachanged'));
}

// --- RENDERING & NAVIGATION ---
function renderGrid() {
    const gridContainer = dom.gridContainer;
    gridContainer.innerHTML = '';
    const gridEl = document.createElement('div');
    gridEl.id = 'room-grid';
    gridContainer.appendChild(gridEl);

    if (!viState.activeParentId) {
        gridContainer.innerHTML = `<div id="room-grid" class="flex items-center justify-center h-full"><p class="text-gray-500">Please select a site and room to begin.</p></div>`;
        return;
    }

    const state = getState();
    const itemsById = new Map();
    state.allAssets.forEach(asset => itemsById.set(asset.AssetID, asset));
    state.allContainers.forEach(container => {
        itemsById.set(container.ContainerID, {
            AssetID: container.ContainerID,
            AssetName: container.ContainerName,
            AssetType: container.ContainerType || 'Container',
        });
    });


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
    
    const containerWidth = gridContainer.clientWidth;
    const containerHeight = (containerWidth * gridHeight) / gridWidth;
    
    cellWidth = containerWidth / gridWidth;
    cellHeight = containerHeight / gridHeight;

    stage = new Konva.Stage({ container: 'room-grid', width: containerWidth, height: containerHeight });
    gridLayer = new Konva.Layer();
    
    for (let i = 0; i < gridWidth + 1; i++) {
        gridLayer.add(new Konva.Line({ points: [i * cellWidth, 0, i * cellWidth, containerHeight], stroke: '#e5e7eb', strokeWidth: 1 }));
    }
    for (let j = 0; j < gridHeight + 1; j++) {
        gridLayer.add(new Konva.Line({ points: [0, j * cellHeight, containerWidth, j * cellHeight], stroke: '#e5e7eb', strokeWidth: 1 }));
    }
    stage.add(gridLayer);

    objectsLayer = new Konva.Layer();
    stage.add(objectsLayer);

    state.spatialLayoutData.filter(obj => obj.ParentID === viState.activeParentId).forEach(obj => renderObject(obj, itemsById));
    objectsLayer.draw();

    stage.on('click', (e) => { if (e.target === stage) selectObject(null); });
    stage.on('contextmenu', (e) => { e.evt.preventDefault(); });
}

function renderObject(objectData, itemsById) {
    const assetInfo = itemsById.get(objectData.ReferenceID);
    if (!assetInfo) return;

    const group = new Konva.Group({
        x: objectData.PosX * cellWidth,
        y: objectData.PosY * cellHeight,
        id: objectData.InstanceID,
        draggable: true,
    });
    
    let width = objectData.Width, height = objectData.Height;
    if (assetInfo.AssetType !== 'Wall' && assetInfo.AssetType !== 'Door' && objectData.Orientation === 'Vertical') {
        [width, height] = [height, width];
    }
    const pixelWidth = width * cellWidth;
    const pixelHeight = height * cellHeight;

    const typeStyles = {
        'Shelf': { fill: '#fef3c7', stroke: '#f59e0b', strokeWidth: 2, textColor: '#78350f' },
        'Container': { fill: '#dbeafe', stroke: '#3b82f6', strokeWidth: 2, textColor: '#1e3a8a' },
        'Wall': { fill: '#4b5563', stroke: '#1f2937', strokeWidth: 1 },
        'Door': { fill: 'white', stroke: '#9ca3af', strokeWidth: 2 },
        'default': { fill: '#e5e7eb', stroke: '#6b7280', strokeWidth: 1, textColor: '#1f2937' }
    };

    const style = typeStyles[assetInfo.AssetType] || typeStyles['default'];
    if (assetInfo.AssetType.startsWith('FloorPatch_')) {
        style.strokeWidth = 0;
        style.fill = { 'Carpet': '#f3e9d2', 'Tile': '#e5e7eb', 'Wood': '#d1b7a0' }[assetInfo.AssetType.split('_')[1]] || '#ccc';
        group.draggable(false);
        group.zIndex(0);
    }

    const rect = new Konva.Rect({ width: pixelWidth, height: pixelHeight, fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth, cornerRadius: 4 });
    group.add(rect);
    
    if (assetInfo.AssetType !== 'Wall' && assetInfo.AssetType !== 'Door' && !assetInfo.AssetType.startsWith('FloorPatch_')) {
        const text = new Konva.Text({
            text: assetInfo.AssetName, fontSize: 12, fontFamily: 'Inter, sans-serif', fill: style.textColor, padding: 5,
            width: pixelWidth, height: pixelHeight, align: 'center', verticalAlign: 'middle', listening: false,
        });
        group.add(text);
    }

    group.on('click', (e) => { e.evt.stopPropagation(); selectObject(objectData.InstanceID, e.evt.shiftKey); });
    group.on('dblclick', (e) => {
        if (['Shelf', 'Container'].includes(assetInfo.AssetType)) {
            e.evt.stopPropagation();
            navigateTo(objectData.InstanceID, assetInfo.AssetName);
        }
    });
    group.on('dragend', async () => {
        const newPosX = Math.round(group.x() / cellWidth);
        const newPosY = Math.round(group.y() / cellHeight);
        group.position({ x: newPosX * cellWidth, y: newPosY * cellHeight });
        const updatedInstance = { ...objectData, PosX: newPosX, PosY: newPosY };
        await updateObjectInSheet(updatedInstance);
        const index = getState().spatialLayoutData.findIndex(i => i.InstanceID === objectData.InstanceID);
        if (index > -1) getState().spatialLayoutData[index] = updatedInstance;
    });
    group.on('contextmenu', (e) => { e.evt.preventDefault(); e.evt.stopPropagation(); showRadialMenu(e.evt.pageX, e.evt.pageY, objectData.InstanceID); });

    objectsLayer.add(group);
}

// --- EVENT HANDLERS & NAVIGATION (Logic mostly unchanged, hooks into new render functions) ---
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
    viState.activeRoomId = null; viState.activeParentId = null; viState.breadcrumbs = [];
    renderBreadcrumbs(); renderGrid(); renderUnplacedAssets(siteId);
}
function handleRoomSelection(e) {
    const roomId = e.target.value;
    if (roomId) {
        const room = selectors.selectRoomsById(getState().allRooms).get(roomId);
        if (room) navigateTo(room.RoomID, room.RoomName);
    } else {
        viState.activeParentId = null; viState.activeRoomId = null; viState.breadcrumbs = [];
        renderBreadcrumbs(); renderGrid(); renderUnplacedAssets(viState.activeSiteId);
    }
}
function navigateTo(id, name) {
    if (!id) return;
    if (id.startsWith('ROOM-')) {
        viState.activeRoomId = id; viState.activeParentId = id; viState.breadcrumbs = [{ id, name }];
    } else {
        viState.activeParentId = id;
        const existingIndex = viState.breadcrumbs.findIndex(b => b.id === id);
        viState.breadcrumbs = existingIndex > -1 ? viState.breadcrumbs.slice(0, existingIndex + 1) : [...viState.breadcrumbs, { id, name }];
    }
    localStorage.setItem('lastActiveRoomId', viState.activeRoomId);
    selectObject(null); renderGrid(); renderBreadcrumbs(); renderUnplacedAssets(viState.activeSiteId);
}
function renderBreadcrumbs() {
    dom.breadcrumbContainer.innerHTML = viState.breadcrumbs.map((crumb, index) => index < viState.breadcrumbs.length - 1 ? `<span><a href="#" data-id="${crumb.id}" data-name="${crumb.name}" class="hover:underline text-indigo-600">${crumb.name}</a> / </span>` : `<span class="font-semibold text-gray-700">${crumb.name}</span>`).join('');
    dom.breadcrumbContainer.querySelectorAll('a').forEach(a => a.onclick = (e) => { e.preventDefault(); navigateTo(e.target.dataset.id, e.target.dataset.name); });
}

// --- OBJECT MANIPULATION & SELECTION ---
function selectObject(instanceId, isMultiSelect = false) {
    if (!stage) return;
    objectsLayer.find('Transformer').forEach(tr => tr.destroy());

    const selectedIds = new Set(viState.selectedInstanceIds);
    if (instanceId === null) {
        selectedIds.clear();
    } else if (isMultiSelect) {
        selectedIds.has(instanceId) ? selectedIds.delete(instanceId) : selectedIds.add(instanceId);
    } else {
        if (!selectedIds.has(instanceId) || selectedIds.size > 1) {
            selectedIds.clear();
            selectedIds.add(instanceId);
        }
    }
    viState.selectedInstanceIds = Array.from(selectedIds);
    const selectedNodes = viState.selectedInstanceIds.map(id => stage.findOne('#' + id)).filter(Boolean);
    
    if (selectedNodes.length > 0) {
        const tr = new Konva.Transformer({
            nodes: selectedNodes, borderStroke: '#4f46e5', borderStrokeWidth: 2, anchorStroke: '#4f46e5',
            anchorFill: 'white', anchorSize: 8, keepRatio: false, rotateEnabled: false,
        });
        objectsLayer.add(tr);
    }
    objectsLayer.draw();
}

async function updateObjectInSheet(updatedInstance) {
    const rowData = await api.prepareRowData(SPATIAL_LAYOUT_SHEET, updatedInstance, SPATIAL_LAYOUT_HEADER_MAP);
    await api.updateSheetValues(`${SPATIAL_LAYOUT_SHEET}!A${updatedInstance.rowIndex}`, [rowData]);
}

// --- RADIAL MENU & ACTIONS (Logic mostly unchanged) ---
function showRadialMenu(x, y, instanceId) {
    clearTimeout(hideMenuTimeout);
    if(viState.selectedInstanceIds.length > 1 && !viState.selectedInstanceIds.includes(instanceId)) selectObject(instanceId); 
    viState.activeRadialInstanceId = instanceId;
    const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId);
    const asset = instance ? selectors.selectAssetsById(getState().allAssets).get(instance.ReferenceID) : null;
    if (!asset) return;
    const isContainer = ['Shelf', 'Container'].includes(asset.AssetType);
    const isFloor = asset.AssetType.startsWith('FloorPatch_');
    dom.radialRenameUse.classList.toggle('hidden', asset.AssetType === 'Door' || asset.AssetType === 'Wall' || isFloor);
    dom.radialFlipUse.classList.toggle('hidden', asset.AssetType !== 'Door');
    dom.radialOpenUse.classList.toggle('hidden', !isContainer);
    dom.radialRotateUse.classList.toggle('hidden', asset.AssetType === 'Wall' || isFloor);
    dom.radialResizeUse.classList.toggle('hidden', asset.AssetType === 'Door');
    dom.radialMenu.style.left = `${x}px`; dom.radialMenu.style.top = `${y}px`;
    dom.radialMenu.classList.remove('hidden');
    setTimeout(() => dom.radialMenu.classList.add('visible'), 10);
}
function hideRadialMenu() { if (dom.radialMenu) { dom.radialMenu.classList.remove('visible'); setTimeout(() => dom.radialMenu.classList.add('hidden'), 200); } viState.activeRadialInstanceId = null; clearTimeout(hideMenuTimeout); }
async function handleRename(instanceId) { const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId); const asset = instance ? selectors.selectAssetsById(getState().allAssets).get(instance.ReferenceID) : null; if (!asset) return; const newName = prompt("Enter new name:", asset.AssetName); if (newName && newName.trim() && newName.trim() !== asset.AssetName) { asset.AssetName = newName.trim(); const rowData = await api.prepareRowData(ASSET_SHEET, asset, ASSET_HEADER_MAP); await api.updateSheetValues(`${ASSET_SHEET}!A${asset.rowIndex}`, [rowData]); window.dispatchEvent(new CustomEvent('datachanged')); } }
async function handleFlip(instanceId) { const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId); if (instance) { instance.Orientation = { 'East': 'West', 'West': 'East', 'North': 'South', 'South': 'North' }[instance.Orientation] || 'East'; await updateObjectInSheet(instance); renderGrid(); } }
async function handleRotate(instanceId) { const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId); if (!instance) return; const asset = selectors.selectAssetsById(getState().allAssets).get(instance.ReferenceID); if (!asset) return; if (asset.AssetType === 'Door') { instance.Orientation = { 'East': 'South', 'South': 'West', 'West': 'North', 'North': 'East' }[instance.Orientation] || 'South'; } else { instance.Orientation = instance.Orientation === 'Horizontal' ? 'Vertical' : 'Horizontal'; } await updateObjectInSheet(instance); renderGrid(); setTimeout(() => selectObject(instanceId), 50); }
function handleOpen(instanceId) { const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId); if (instance) { const assetInfo = selectors.selectAssetsById(getState().allAssets).get(instance.ReferenceID); if (assetInfo) navigateTo(instance.InstanceID, assetInfo.AssetName); } }
function handleResize(instanceId) { if (!instanceId || !stage) return; selectObject(instanceId); const node = stage.findOne('#' + instanceId); if (node) { showMessage("Use the handles to resize the object.", "info"); } }

// --- KEYBOARD & CLIPBOARD ACTIONS ---
function handleKeyDown(e) {
    if (dom.visualInventoryPanel.classList.contains('hidden') || document.querySelector('.modal-container:not(.hidden)')) return;
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    if ((e.key === 'Delete' || e.key === 'Backspace') && viState.selectedInstanceIds.length > 0) { e.preventDefault(); handleDelete(viState.selectedInstanceIds); }
    else if (isCtrlOrMeta && e.key.toLowerCase() === 'c') { e.preventDefault(); handleCopy(); }
    else if (isCtrlOrMeta && e.key.toLowerCase() === 'v') { e.preventDefault(); handlePaste(); }
}
async function handleDelete(instanceIdsToDelete) { if (!instanceIdsToDelete || instanceIdsToDelete.length === 0 || !confirm(`Are you sure you want to remove ${instanceIdsToDelete.length} object(s) from the room? They will be returned to the unplaced items list.`)) return; const { spatialLayoutData, sheetIds } = getState(); const requests = []; const layoutSheetId = sheetIds[SPATIAL_LAYOUT_SHEET]; instanceIdsToDelete.forEach(instanceId => { const instance = spatialLayoutData.find(i => i.InstanceID === instanceId); if (instance && layoutSheetId && instance.rowIndex) { requests.push({ deleteDimension: { range: { sheetId: layoutSheetId, dimension: "ROWS", startIndex: parseInt(instance.rowIndex) - 1, endIndex: parseInt(instance.rowIndex) } } }); } }); if (requests.length > 0) { await api.batchUpdateSheet({ requests }); window.dispatchEvent(new CustomEvent('datachanged')); } }
function handleCopy() { if (viState.selectedInstanceIds.length === 0) return; const { spatialLayoutData, allAssets } = getState(); const assetsById = selectors.selectAssetsById(allAssets); viState.clipboard = viState.selectedInstanceIds.map(id => { const instance = spatialLayoutData.find(i => i.InstanceID === id); const asset = assetsById.get(instance?.ReferenceID); return { instance, asset }; }).filter(item => item.instance && item.asset); if (viState.clipboard.length > 0) showMessage(`Copied ${viState.clipboard.length} item(s).`, 'success'); }
async function handlePaste() { if (!viState.clipboard || viState.clipboard.length === 0 || !viState.activeParentId) return; const newInstanceRows = []; const newAssetRows = []; const newSelectedIds = []; for (const item of viState.clipboard) { let newReferenceId = item.instance.ReferenceID; const isStructural = ['Shelf', 'Container', 'Wall', 'Door'].includes(item.asset.AssetType) || item.asset.AssetType.startsWith('FloorPatch_'); if (!isStructural) { newReferenceId = `ASSET-${Date.now()}-${Math.random().toString(16).slice(2)}`; const newAsset = { ...item.asset, AssetID: newReferenceId, AssetName: `${item.asset.AssetName} (Copy)`, ParentObjectID: viState.activeParentId }; delete newAsset.rowIndex; newAssetRows.push(await api.prepareRowData(ASSET_SHEET, newAsset, ASSET_HEADER_MAP)); } const newInstanceId = `INST-${Date.now()}-${Math.random().toString(16).slice(2)}`; const newInstance = { ...item.instance, InstanceID: newInstanceId, ReferenceID: newReferenceId, ParentID: viState.activeParentId, PosX: parseInt(item.instance.PosX) + 1, PosY: parseInt(item.instance.PosY) + 1, }; delete newInstance.rowIndex; newInstanceRows.push(await api.prepareRowData(SPATIAL_LAYOUT_SHEET, newInstance, SPATIAL_LAYOUT_HEADER_MAP)); newSelectedIds.push(newInstanceId); } if (newAssetRows.length > 0) await api.appendSheetValues(ASSET_SHEET, newAssetRows); if (newInstanceRows.length > 0) await api.appendSheetValues(SPATIAL_LAYOUT_SHEET, newInstanceRows); showMessage(`Pasted ${newInstanceRows.length} item(s).`, 'success'); window.dispatchEvent(new CustomEvent('datachanged')); setTimeout(() => { selectObject(null); viState.selectedInstanceIds = newSelectedIds; selectObject(newSelectedIds[0]); }, 500); }
