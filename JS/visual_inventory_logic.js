// JS/visual_inventory_logic.js
import { SITES_SHEET, ROOMS_SHEET, ASSET_SHEET, SPATIAL_LAYOUT_SHEET, CONTAINERS_SHEET, SPATIAL_LAYOUT_HEADER_MAP, CONTAINERS_HEADER_MAP, SITES_HEADER_MAP, ROOMS_HEADER_MAP } from './state.js';
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
    isWallDrawingMode: false,
    wallDrawingStartPoint: null,
    scale: 20, // pixels per foot
};

// --- NEW: Konva State ---
let stage, gridLayer, objectsLayer, wallPreviewLayer;
let cellWidth, cellHeight;

// --- DOM REFERENCES & FLAGS ---
let viListenersInitialized = false;
let hideMenuTimeout;


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

    // Event Listeners
    dom.contentsModal.querySelector('.modal-backdrop').addEventListener('click', () => toggleModal(dom.contentsModal, false));
    dom.contentsModal.querySelector('.modal-close-btn').addEventListener('click', () => toggleModal(dom.contentsModal, false));
    dom.viSiteSelector.addEventListener('change', handleSiteSelection);
    dom.roomSelector.addEventListener('change', handleRoomSelection);
    
    // Edit/Delete buttons for Site and Room
    dom.viEditSiteBtn.addEventListener('click', handleEditSite);
    dom.viDeleteSiteBtn.addEventListener('click', handleDeleteSite);
    dom.viEditRoomBtn.addEventListener('click', handleEditRoom);
    dom.viDeleteRoomBtn.addEventListener('click', handleDeleteRoom);

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

    document.querySelectorAll('.toolbar-item[draggable="true"]').forEach(item => item.addEventListener('dragstart', (e) => {
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

    // Wall drawing button
    dom.drawWallBtn.addEventListener('click', toggleWallDrawingMode);

    // Listen for drops on the container, which holds the canvas
    dom.gridContainer.addEventListener('dragover', (e) => e.preventDefault());
    dom.gridContainer.addEventListener('drop', handleGridDrop);
    
    document.addEventListener('click', (e) => {
        if (dom.radialMenu && !dom.radialMenu.contains(e.target) && !e.target.closest('.visual-object')) hideRadialMenu();
    });

    dom.radialMenu.addEventListener('mouseenter', () => clearTimeout(hideMenuTimeout));
    dom.radialMenu.addEventListener('mouseleave', () => hideMenuTimeout = setTimeout(hideRadialMenu, 500));
    dom.radialRenameUse.addEventListener('click', () => { handleRename(viState.activeRadialInstanceId); hideRadialMenu(); });
    dom.radialEditUse.addEventListener('click', () => { handleEditContainer(viState.activeRadialInstanceId); hideRadialMenu(); });
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
        // This logic is now flawed for walls, which should not be assets.
        // It's handled by saveNewWall correctly. This is for other tool items.
        // For items like "Shelf" or "Box" from the toolbar, we need to create a backing entity.
        // We will treat them as containers.
        const newContainer = {
            ContainerID: `CONT-${Date.now()}`,
            ContainerName: data.name,
            ContainerType: data.assetType,
            ParentID: viState.activeParentId,
        };
        newInstanceData.ReferenceID = newContainer.ContainerID;
        const newContainerRow = await api.prepareRowData(CONTAINERS_SHEET, newContainer, CONTAINERS_HEADER_MAP);
        await api.appendSheetValues(CONTAINERS_SHEET, [newContainerRow]);

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
    const scaleIndicator = document.getElementById('scale-indicator');
    gridContainer.innerHTML = ''; // Clear previous content
    const gridEl = document.createElement('div');
    gridEl.id = 'room-grid';
    gridContainer.appendChild(gridEl);

    if (viState.isWallDrawingMode) toggleWallDrawingMode();

    if (!viState.activeParentId) {
        gridContainer.innerHTML = `<div id="room-grid" class="flex items-center justify-center h-full"><p class="text-gray-500">Please select a site and room to begin.</p></div>`;
        scaleIndicator.classList.add('hidden');
        return;
    }
    
    scaleIndicator.classList.remove('hidden');

    const state = getState();
    const itemsById = new Map();
    state.allAssets.forEach(asset => itemsById.set(asset.AssetID, asset));
    state.allContainers.forEach(container => {
        itemsById.set(container.ContainerID, {
            AssetID: container.ContainerID,
            AssetName: container.ContainerName,
            AssetType: container.ContainerType || 'Container',
            isContainer: true
        });
    });

    let room, canvasWidth, canvasHeight;

    if (viState.activeParentId.startsWith('ROOM-')) {
        room = selectors.selectRoomsById(state.allRooms).get(viState.activeParentId);
        if (room && room.Dimensions) {
            const dims = room.Dimensions.toLowerCase().match(/(\d+(?:\.\d+)?)\s*ft\s*x\s*(\d+(?:\.\d+)?)\s*ft/);
            if (dims) {
                const roomWidthFt = parseFloat(dims[1]);
                const roomHeightFt = parseFloat(dims[2]);
                canvasWidth = roomWidthFt * viState.scale;
                canvasHeight = roomHeightFt * viState.scale;
                cellWidth = viState.scale;
                cellHeight = viState.scale;
            }
        }
    }
    
    // Fallback to grid-based dimensions if real-world are not available
    if (!canvasWidth) {
        let gridWidth = 20, gridHeight = 15;
        if (room) {
            gridWidth = room.GridWidth || 20;
            gridHeight = room.GridHeight || 15;
        } else {
             const parentInstance = state.spatialLayoutData.find(o => o.InstanceID === viState.activeParentId);
             if (parentInstance) {
                gridWidth = parentInstance.Orientation === 'Vertical' ? parentInstance.ShelfRows : parentInstance.ShelfCols;
                gridHeight = parentInstance.Orientation === 'Vertical' ? parentInstance.ShelfCols : parentInstance.ShelfRows;
             }
        }
        const containerWidth = gridContainer.clientWidth;
        canvasWidth = containerWidth;
        canvasHeight = (containerWidth * gridHeight) / gridWidth;
        cellWidth = canvasWidth / gridWidth;
        cellHeight = canvasHeight / gridHeight;
    }
    
    updateScaleIndicator();

    stage = new Konva.Stage({ container: 'room-grid', width: canvasWidth, height: canvasHeight });
    gridLayer = new Konva.Layer();
    
    // Draw grid lines based on scale (1 foot = viState.scale pixels)
    for (let i = 0; i <= canvasWidth; i += viState.scale) {
        gridLayer.add(new Konva.Line({ points: [i, 0, i, canvasHeight], stroke: '#e5e7eb', strokeWidth: 1 }));
    }
    for (let j = 0; j <= canvasHeight; j += viState.scale) {
        gridLayer.add(new Konva.Line({ points: [0, j, canvasWidth, j], stroke: '#e5e7eb', strokeWidth: 1 }));
    }
    stage.add(gridLayer);

    objectsLayer = new Konva.Layer();
    stage.add(objectsLayer);
    
    wallPreviewLayer = new Konva.Layer();
    stage.add(wallPreviewLayer);

    state.spatialLayoutData.filter(obj => obj.ParentID === viState.activeParentId).forEach(obj => renderObject(obj, itemsById));
    objectsLayer.draw();

    stage.on('mousedown', (e) => { 
        if (viState.isWallDrawingMode) {
            handleWallDrawClick(e);
        } else if (e.target === stage) {
            selectObject(null);
        }
    });
    stage.on('mousemove', (e) => {
        if (viState.isWallDrawingMode && viState.wallDrawingStartPoint) {
            drawPreviewWall(e);
        }
    });
    stage.on('contextmenu', (e) => { e.evt.preventDefault(); });
}

function updateScaleIndicator() {
    const scaleLine = document.getElementById('scale-line');
    const scaleText = document.getElementById('scale-text');
    
    const indicatorLengthFt = 5; // We want the indicator to represent 5 feet
    const indicatorWidthPx = indicatorLengthFt * viState.scale;
    
    scaleLine.style.width = `${indicatorWidthPx}px`;
    scaleText.textContent = `${indicatorLengthFt} ft`;
}


function renderObject(objectData, itemsById) {
    // If it has wall coordinates, render as wall using scale and exit
    if (objectData.x1 && objectData.y1 && objectData.x2 && objectData.y2) {
        const wallLine = new Konva.Line({
            points: [
                parseFloat(objectData.x1) * viState.scale, 
                parseFloat(objectData.y1) * viState.scale, 
                parseFloat(objectData.x2) * viState.scale, 
                parseFloat(objectData.y2) * viState.scale
            ],
            stroke: '#4b5563', strokeWidth: 8, id: objectData.InstanceID, draggable: false, hitStrokeWidth: 15,
        });
        wallLine.on('click', (e) => { e.evt.stopPropagation(); selectObject(objectData.InstanceID, e.evt.shiftKey); });
        wallLine.on('contextmenu', (e) => { e.evt.preventDefault(); e.evt.stopPropagation(); showRadialMenu(e.evt.pageX, e.evt.pageY, objectData.InstanceID); });
        objectsLayer.add(wallLine);
        return;
    }

    const assetInfo = itemsById.get(objectData.ReferenceID);
    if (!assetInfo) return;

    const group = new Konva.Group({
        x: objectData.PosX * cellWidth,
        y: objectData.PosY * cellHeight,
        id: objectData.InstanceID,
        draggable: true,
    });
    
    let width = objectData.Width, height = objectData.Height;
    if (assetInfo.AssetType !== 'Door' && objectData.Orientation === 'Vertical') {
        [width, height] = [height, width];
    }
    const pixelWidth = width * cellWidth;
    const pixelHeight = height * cellHeight;

    const typeStyles = {
        'Shelf': { fill: '#fef3c7', stroke: '#f59e0b', strokeWidth: 2, textColor: '#78350f' },
        'Container': { fill: '#dbeafe', stroke: '#3b82f6', strokeWidth: 2, textColor: '#1e3a8a' },
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
    
    if (assetInfo.AssetType !== 'Door' && !assetInfo.AssetType.startsWith('FloorPatch_')) {
        const text = new Konva.Text({
            text: assetInfo.AssetName, fontSize: 12, fontFamily: 'Inter, sans-serif', fill: style.textColor, padding: 5,
            width: pixelWidth, height: pixelHeight, align: 'center', verticalAlign: 'middle', listening: false,
        });
        group.add(text);
    }

    group.on('click', (e) => { e.evt.stopPropagation(); selectObject(objectData.InstanceID, e.evt.shiftKey); });
    group.on('dblclick', (e) => {
        if (assetInfo.isContainer || ['Shelf', 'Container'].includes(assetInfo.AssetType)) {
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

// --- EVENT HANDLERS & NAVIGATION ---
function handleSiteSelection(e) {
    const siteId = e.target.value;
    viState.activeSiteId = siteId;
    localStorage.setItem('lastActiveViSiteId', siteId);
    const roomsForSite = selectors.selectRoomsBySiteId(getState(), siteId);
    populateSelect(dom.roomSelector, roomsForSite, 'RoomID', 'RoomName', { initialOptionText: '-- Select a Room --' });
    dom.roomSelector.disabled = !siteId;
    dom.viEditSiteBtn.classList.toggle('hidden', !siteId);
    dom.viDeleteSiteBtn.classList.toggle('hidden', !siteId);
    dom.viEditRoomBtn.classList.add('hidden');
    dom.viDeleteRoomBtn.classList.add('hidden');
    viState.activeRoomId = null; viState.activeParentId = null; viState.breadcrumbs = [];
    renderBreadcrumbs(); renderGrid(); renderUnplacedAssets(siteId);
}
function handleRoomSelection(e) {
    const roomId = e.target.value;
    dom.viEditRoomBtn.classList.toggle('hidden', !roomId);
    dom.viDeleteRoomBtn.classList.toggle('hidden', !roomId);
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

// --- WALL DRAWING ---
function toggleWallDrawingMode() {
    viState.isWallDrawingMode = !viState.isWallDrawingMode;
    viState.wallDrawingStartPoint = null;
    if (wallPreviewLayer) wallPreviewLayer.destroyChildren();

    if (viState.isWallDrawingMode) {
        dom.drawWallBtn.classList.add('bg-indigo-200', 'text-indigo-800');
        if (stage) stage.container().style.cursor = 'crosshair';
        showMessage('Wall Drawing Mode: Click a start point, then an end point.', 'info');
    } else {
        dom.drawWallBtn.classList.remove('bg-indigo-200', 'text-indigo-800');
        if (stage) stage.container().style.cursor = 'default';
    }
}
function handleWallDrawClick() {
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!viState.wallDrawingStartPoint) {
        viState.wallDrawingStartPoint = pos;
    } else {
        saveNewWall(viState.wallDrawingStartPoint, pos);
        toggleWallDrawingMode();
    }
}
function drawPreviewWall() {
    if (!stage || !viState.wallDrawingStartPoint) return;
    const pos = stage.getPointerPosition();
    wallPreviewLayer.destroyChildren();
    const line = new Konva.Line({
        points: [viState.wallDrawingStartPoint.x, viState.wallDrawingStartPoint.y, pos.x, pos.y],
        stroke: '#6366f1', strokeWidth: 4, dash: [10, 5],
    });
    wallPreviewLayer.add(line);
}
async function saveNewWall(start, end) {
    if (!viState.activeParentId) return showMessage("Cannot add a wall without a selected room or container.");
    
    // Convert pixel coordinates to scaled "feet" before saving
    const newInstanceData = {
        InstanceID: `INST-${Date.now()}`,
        ParentID: viState.activeParentId,
        ReferenceID: null, // Walls no longer reference the Asset sheet
        x1: (start.x / viState.scale).toFixed(2),
        y1: (start.y / viState.scale).toFixed(2),
        x2: (end.x / viState.scale).toFixed(2),
        y2: (end.y / viState.scale).toFixed(2),
    };
    const newInstanceRow = await api.prepareRowData(SPATIAL_LAYOUT_SHEET, newInstanceData, SPATIAL_LAYOUT_HEADER_MAP);
    
    await api.appendSheetValues(SPATIAL_LAYOUT_SHEET, [newInstanceRow]);
    
    window.dispatchEvent(new CustomEvent('datachanged'));
}


// --- OBJECT MANIPULATION & SELECTION ---
function selectObject(instanceId, isMultiSelect = false) {
    if (!stage) return;
    objectsLayer.find('Transformer').forEach(tr => tr.destroy());
    objectsLayer.find('.selection-rect').forEach(r => r.destroy()); // For wall selections

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
        const rectNodes = selectedNodes.filter(n => n instanceof Konva.Group);
        const lineNodes = selectedNodes.filter(n => n instanceof Konva.Line);

        if (rectNodes.length > 0) {
            const tr = new Konva.Transformer({
                nodes: rectNodes, borderStroke: '#4f46e5', borderStrokeWidth: 2, anchorStroke: '#4f46e5',
                anchorFill: 'white', anchorSize: 8, keepRatio: false, rotateEnabled: false,
            });
            objectsLayer.add(tr);
        }

        lineNodes.forEach(line => {
            const box = line.getClientRect();
             const selectionRect = new Konva.Rect({
                x: box.x, y: box.y, width: box.width, height: box.height,
                stroke: '#4f46e5', strokeWidth: 2, dash: [4, 4], name: 'selection-rect',
            });
            objectsLayer.add(selectionRect);
        });
    }
    objectsLayer.draw();
}

async function updateObjectInSheet(updatedInstance) {
    const rowData = await api.prepareRowData(SPATIAL_LAYOUT_SHEET, updatedInstance, SPATIAL_LAYOUT_HEADER_MAP);
    await api.updateSheetValues(`${SPATIAL_LAYOUT_SHEET}!A${updatedInstance.rowIndex}`, [rowData]);
}

// --- RADIAL MENU & ACTIONS ---
function showRadialMenu(x, y, instanceId) {
    clearTimeout(hideMenuTimeout);
    if(viState.selectedInstanceIds.length > 1 && !viState.selectedInstanceIds.includes(instanceId)) selectObject(instanceId); 
    viState.activeRadialInstanceId = instanceId;
    const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId);
    if (!instance) return;

    const isWall = !!(instance.x1 && instance.y1);
    let asset = null;
    let isContainer = false;
    let isDoor = false;
    let isFloor = false;

    if (!isWall) {
        asset = selectors.selectAssetsById(getState().allAssets).get(instance.ReferenceID) || selectors.selectContainersById(getState().allContainers).get(instance.ReferenceID);
        if (!asset) return;
        const type = asset.AssetType || asset.ContainerType;
        isContainer = type === 'Shelf' || type === 'Container';
        isDoor = type === 'Door';
        isFloor = type && type.startsWith('FloorPatch_');
    }
    
    dom.radialRenameUse.classList.toggle('hidden', isDoor || isWall || isFloor);
    dom.radialEditUse.classList.toggle('hidden', !isContainer);
    dom.radialFlipUse.classList.toggle('hidden', !isDoor);
    dom.radialOpenUse.classList.toggle('hidden', !isContainer);
    dom.radialRotateUse.classList.toggle('hidden', isWall || isFloor);
    dom.radialResizeUse.classList.toggle('hidden', isDoor || isWall);
    dom.radialMenu.style.left = `${x}px`; dom.radialMenu.style.top = `${y}px`;
    dom.radialMenu.classList.remove('hidden');
    setTimeout(() => dom.radialMenu.classList.add('visible'), 10);
}
function hideRadialMenu() { if (dom.radialMenu) { dom.radialMenu.classList.remove('visible'); setTimeout(() => dom.radialMenu.classList.add('hidden'), 200); } viState.activeRadialInstanceId = null; clearTimeout(hideMenuTimeout); }
async function handleRename(instanceId) { const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId); if(!instance) return; const state = getState(); const asset = selectors.selectAssetsById(state.allAssets).get(instance.ReferenceID); const container = selectors.selectContainersById(state.allContainers).get(instance.ReferenceID); if (asset) { const newName = prompt("Enter new asset name:", asset.AssetName); if (newName && newName.trim() !== asset.AssetName) { asset.AssetName = newName.trim(); const rowData = await api.prepareRowData(ASSET_SHEET, asset, ASSET_HEADER_MAP); await api.updateSheetValues(`${ASSET_SHEET}!A${asset.rowIndex}`, [rowData]); window.dispatchEvent(new CustomEvent('datachanged')); } } else if (container) { const newName = prompt("Enter new container name:", container.ContainerName); if (newName && newName.trim() !== container.ContainerName) { container.ContainerName = newName.trim(); const rowData = await api.prepareRowData(CONTAINERS_SHEET, container, CONTAINERS_HEADER_MAP); await api.updateSheetValues(`${CONTAINERS_SHEET}!A${container.rowIndex}`, [rowData]); window.dispatchEvent(new CustomEvent('datachanged')); } } }
async function handleFlip(instanceId) { const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId); if (instance) { instance.Orientation = { 'East': 'West', 'West': 'East', 'North': 'South', 'South': 'North' }[instance.Orientation] || 'East'; await updateObjectInSheet(instance); renderGrid(); } }
async function handleRotate(instanceId) { const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId); if (!instance) return; const asset = selectors.selectAssetsById(getState().allAssets).get(instance.ReferenceID); if (!asset) return; if (asset.AssetType === 'Door') { instance.Orientation = { 'East': 'South', 'South': 'West', 'West': 'North', 'North': 'East' }[instance.Orientation] || 'South'; } else { instance.Orientation = instance.Orientation === 'Horizontal' ? 'Vertical' : 'Horizontal'; } await updateObjectInSheet(instance); renderGrid(); setTimeout(() => selectObject(instanceId), 50); }
function handleOpen(instanceId) { const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId); if (instance) { const state = getState(); const assetInfo = selectors.selectAssetsById(state.allAssets).get(instance.ReferenceID) || selectors.selectContainersById(state.allContainers).get(instance.ReferenceID); const name = assetInfo.AssetName || assetInfo.ContainerName; if (name) navigateTo(instance.InstanceID, name); } }
function handleResize(instanceId) { if (!instanceId || !stage) return; selectObject(instanceId); const node = stage.findOne('#' + instanceId); if (node) { showMessage("Use the handles to resize the object.", "info"); } }

// --- KEYBOARD & CLIPBOARD ACTIONS ---
function handleKeyDown(e) {
    if (dom.visualInventoryPanel.classList.contains('hidden') || document.querySelector('.modal-container:not(.hidden)')) return;
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    if ((e.key === 'Delete' || e.key === 'Backspace') && viState.selectedInstanceIds.length > 0) { e.preventDefault(); handleDelete(viState.selectedInstanceIds); }
    else if (isCtrlOrMeta && e.key.toLowerCase() === 'c') { e.preventDefault(); handleCopy(); }
    else if (isCtrlOrMeta && e.key.toLowerCase() === 'v') { e.preventDefault(); handlePaste(); }
}
async function handleDelete(instanceIdsToDelete) { if (!instanceIdsToDelete || instanceIdsToDelete.length === 0 || !confirm(`Are you sure you want to remove ${instanceIdsToDelete.length} object(s)? This may delete the object from the database.`)) return; const { spatialLayoutData, allContainers, sheetIds } = getState(); const requests = []; const layoutSheetId = sheetIds[SPATIAL_LAYOUT_SHEET]; const containerSheetId = sheetIds[CONTAINERS_SHEET]; const containersById = selectors.selectContainersById(allContainers); instanceIdsToDelete.forEach(instanceId => { const instance = spatialLayoutData.find(i => i.InstanceID === instanceId); if (instance) { if (layoutSheetId && instance.rowIndex) { requests.push({ deleteDimension: { range: { sheetId: layoutSheetId, dimension: "ROWS", startIndex: parseInt(instance.rowIndex) - 1, endIndex: parseInt(instance.rowIndex) } } }); } const container = containersById.get(instance.ReferenceID); if (container && containerSheetId && container.rowIndex) { requests.push({ deleteDimension: { range: { sheetId: containerSheetId, dimension: "ROWS", startIndex: parseInt(container.rowIndex) - 1, endIndex: parseInt(container.rowIndex) } } }); } } }); if (requests.length > 0) { await api.batchUpdateSheet({ requests }); window.dispatchEvent(new CustomEvent('datachanged')); } }
function handleCopy() { if (viState.selectedInstanceIds.length === 0) return; const { spatialLayoutData, allAssets } = getState(); const assetsById = selectors.selectAssetsById(allAssets); viState.clipboard = viState.selectedInstanceIds.map(id => { const instance = spatialLayoutData.find(i => i.InstanceID === id); const asset = assetsById.get(instance?.ReferenceID); return { instance, asset }; }).filter(item => item.instance && item.asset); if (viState.clipboard.length > 0) showMessage(`Copied ${viState.clipboard.length} item(s).`, 'success'); }
async function handlePaste() { if (!viState.clipboard || viState.clipboard.length === 0 || !viState.activeParentId) return; const newInstanceRows = []; const newAssetRows = []; const newSelectedIds = []; for (const item of viState.clipboard) { let newReferenceId = item.instance.ReferenceID; const isStructural = ['Shelf', 'Container', 'Wall', 'Door'].includes(item.asset.AssetType) || item.asset.AssetType.startsWith('FloorPatch_'); if (!isStructural) { newReferenceId = `ASSET-${Date.now()}-${Math.random().toString(16).slice(2)}`; const newAsset = { ...item.asset, AssetID: newReferenceId, AssetName: `${item.asset.AssetName} (Copy)`, ParentObjectID: viState.activeParentId }; delete newAsset.rowIndex; newAssetRows.push(await api.prepareRowData(ASSET_SHEET, newAsset, ASSET_HEADER_MAP)); } const newInstanceId = `INST-${Date.now()}-${Math.random().toString(16).slice(2)}`; const newInstance = { ...item.instance, InstanceID: newInstanceId, ReferenceID: newReferenceId, ParentID: viState.activeParentId, PosX: parseInt(item.instance.PosX) + 1, PosY: parseInt(item.instance.PosY) + 1, }; delete newInstance.rowIndex; newInstanceRows.push(await api.prepareRowData(SPATIAL_LAYOUT_SHEET, newInstance, SPATIAL_LAYOUT_HEADER_MAP)); newSelectedIds.push(newInstanceId); } if (newAssetRows.length > 0) await api.appendSheetValues(ASSET_SHEET, newAssetRows); if (newInstanceRows.length > 0) await api.appendSheetValues(SPATIAL_LAYOUT_SHEET, newInstanceRows); showMessage(`Pasted ${newInstanceRows.length} item(s).`, 'success'); window.dispatchEvent(new CustomEvent('datachanged')); setTimeout(() => { selectObject(null); viState.selectedInstanceIds = newSelectedIds; selectObject(newSelectedIds[0]); }, 500); }

// --- EDIT / DELETE HANDLERS ---
function handleEditSite() { const site = selectors.selectSitesById(getState().allSites).get(viState.activeSiteId); if (!site) return; dom.siteModalTitle.innerText = 'Edit Site'; dom.siteIdHidden.value = site.SiteID; dom.siteRowIndexHidden.value = site.rowIndex; dom.siteModal.querySelector('#site-name').value = site.SiteName; dom.siteModal.querySelector('#site-address').value = site.Address; dom.siteModal.querySelector('#site-notes').value = site.Notes; toggleModal(dom.siteModal, true); }
async function handleDeleteSite() { const site = selectors.selectSitesById(getState().allSites).get(viState.activeSiteId); if (!site || !confirm(`Are you sure you want to delete the site "${site.SiteName}"? This cannot be undone.`)) return; const { sheetIds } = getState(); await api.batchUpdateSheet({ requests: [{ deleteDimension: { range: { sheetId: sheetIds[SITES_SHEET], dimension: "ROWS", startIndex: parseInt(site.rowIndex) - 1, endIndex: parseInt(site.rowIndex) } } }] }); window.dispatchEvent(new CustomEvent('datachanged')); }

/**
 * Parses a dimension string (e.g., "20ft 6in x 15ft") into its component parts.
 * @param {string} dimString - The dimension string to parse.
 * @returns {object} An object with wFt, wIn, lFt, lIn properties.
 */
function parseDimensions(dimString = '') {
    const parsed = { wFt: '', wIn: '', lFt: '', lIn: '' };
    if (!dimString) return parsed;

    // Regex for one dimension part, e.g., "20ft 6in" or "20'" or "20"
    const dimRegex = /(?:(\d+)\s*(?:ft|'))?\s*(?:(\d+)\s*(?:in|"))?/;
    
    const parts = dimString.toLowerCase().split('x');
    if (parts.length === 2) {
        const [widthPart, lengthPart] = parts;
        
        const widthMatch = widthPart.match(dimRegex);
        if (widthMatch) {
            parsed.wFt = widthMatch[1] || '';
            parsed.wIn = widthMatch[2] || '';
            // If only one number is present and no unit, assume it's feet
            if(!widthMatch[1] && !widthMatch[2] && widthPart.match(/^\s*(\d+)\s*$/)) {
                 parsed.wFt = widthPart.trim();
            }
        }

        const lengthMatch = lengthPart.match(dimRegex);
        if (lengthMatch) {
            parsed.lFt = lengthMatch[1] || '';
            parsed.lIn = lengthMatch[2] || '';
             // If only one number is present and no unit, assume it's feet
            if(!lengthMatch[1] && !lengthMatch[2] && lengthPart.match(/^\s*(\d+)\s*$/)) {
                 parsed.lFt = lengthPart.trim();
            }
        }
    }
    
    return parsed;
}

function handleEditRoom() { 
    const room = selectors.selectRoomsById(getState().allRooms).get(viState.activeRoomId); 
    if (!room) return; 
    dom.roomModalTitle.innerText = 'Edit Room'; 
    dom.roomIdHidden.value = room.RoomID; 
    dom.roomRowIndexHidden.value = room.rowIndex; 
    dom.roomModalSite.value = room.SiteID; 
    dom.roomModal.querySelector('#room-name').value = room.RoomName; 
    
    const dims = parseDimensions(room.Dimensions);
    dom.roomModal.querySelector('#room-width-ft').value = dims.wFt;
    dom.roomModal.querySelector('#room-width-in').value = dims.wIn;
    dom.roomModal.querySelector('#room-length-ft').value = dims.lFt;
    dom.roomModal.querySelector('#room-length-in').value = dims.lIn;

    dom.roomModal.querySelector('#grid-width').value = room.GridWidth; 
    dom.roomModal.querySelector('#grid-height').value = room.GridHeight; 
    toggleModal(dom.roomModal, true); 
}
async function handleDeleteRoom() { const room = selectors.selectRoomsById(getState().allRooms).get(viState.activeRoomId); if (!room || !confirm(`Are you sure you want to delete the room "${room.RoomName}"? This cannot be undone.`)) return; const { sheetIds } = getState(); await api.batchUpdateSheet({ requests: [{ deleteDimension: { range: { sheetId: sheetIds[ROOMS_SHEET], dimension: "ROWS", startIndex: parseInt(room.rowIndex) - 1, endIndex: parseInt(room.rowIndex) } } }] }); window.dispatchEvent(new CustomEvent('datachanged')); }
function handleEditContainer(instanceId) { const instance = getState().spatialLayoutData.find(i => i.InstanceID === instanceId); const container = instance ? selectors.selectContainersById(getState().allContainers).get(instance.ReferenceID) : null; if (!container) return; dom.containerModalTitle.innerText = 'Edit Container'; dom.containerIdHidden.value = container.ContainerID; dom.containerRowIndexHidden.value = container.rowIndex; dom.containerModal.querySelector('#container-name').value = container.ContainerName; dom.containerModal.querySelector('#container-type').value = container.ContainerType; dom.containerModal.querySelector('#container-notes').value = container.Notes; const path = selectors.selectFullLocationPath(getState(), container.ParentID); const site = path.find(p => p.SiteID); const room = path.find(p => p.RoomID); dom.containerModalSite.value = site ? site.SiteID : ''; dom.containerModalSite.dispatchEvent(new Event('change')); dom.containerModalRoom.value = room ? room.RoomID : ''; dom.containerModalRoom.dispatchEvent(new Event('change')); const parentContainer = path.find(p => p.ContainerID && p.ContainerID !== container.ContainerID); dom.containerModalParent.value = parentContainer ? parentContainer.ContainerID : ''; toggleModal(dom.containerModal, true); }
