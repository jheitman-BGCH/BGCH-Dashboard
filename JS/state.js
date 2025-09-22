// This file centralizes all application data and provides functions to interact with it.
// It acts as the single source of truth for the app's state.

const AppState = {
    assets: [],
    rooms: [],
    spatialLayouts: [],
    isLoaded: false,
    isLoading: false,
};

/**
 * Initializes the application state by loading all data from Google Sheets.
 */
async function initializeState() {
    if (AppState.isLoading || AppState.isLoaded) return;

    console.log("Initializing application state...");
    AppState.isLoading = true;
    
    try {
        // Fetch all data in parallel for faster loading.
        const [assetsData, roomsData, spatialLayoutsData] = await Promise.all([
            window.sheetsService.readSheetData('Asset'),
            window.sheetsService.readSheetData('Rooms'),
            window.sheetsService.readSheetData('Spatial Layout')
        ]);

        AppState.assets = assetsData || [];
        AppState.rooms = roomsData || [];
        AppState.spatialLayouts = spatialLayoutsData || [];

        // Post-process data to convert types where necessary.
        AppState.rooms.forEach(room => {
            room.gridWidth = parseInt(room.gridWidth, 10) || 10;
            room.gridHeight = parseInt(room.gridHeight, 10) || 10;
        });

        AppState.spatialLayouts.forEach(layout => {
            layout.posX = parseInt(layout.posX, 10) || 0;
            layout.posY = parseInt(layout.posY, 10) || 0;
            layout.width = parseInt(layout.width, 10) || 1;
            layout.height = parseInt(layout.height, 10) || 1;
        });

        AppState.isLoaded = true;
        console.log("Application state initialized successfully.", AppState);
    } catch (error) {
        console.error("Failed to initialize application state:", error);
        AppState.isLoaded = false;
    } finally {
        AppState.isLoading = false;
    }
}

// --- Data Accessor Functions ---
// Provides safe, consistent access to state data using sanitized camelCase keys.

const getAssetById = (assetId) => AppState.assets.find(a => a.assetID === assetId);
const getRoomById = (roomId) => AppState.rooms.find(r => r.roomID === roomId);
const getLayoutsByRoomId = (roomId) => AppState.spatialLayouts.filter(l => l.parentID === roomId);
const getLayoutByInstanceId = (instanceId) => AppState.spatialLayouts.find(l => l.instanceID === instanceId);

// --- Data Mutation Functions ---
// Modifies the local state and then persists the entire sheet back to Google Sheets.

/**
 * Updates an asset and saves the entire asset sheet.
 * @param {string} assetId The ID of the asset to update.
 * @param {object} updatedFields An object with the fields to update.
 */
async function updateAsset(assetId, updatedFields) {
    const asset = getAssetById(assetId);
    if (!asset) return console.error("Asset not found for update:", assetId);
    Object.assign(asset, updatedFields);
    await window.sheetsService.writeSheetData('Asset', AppState.assets);
}

/**
 * Updates a spatial layout record and saves the entire layout sheet.
 * @param {string} instanceId The instance ID of the layout to update.
 * @param {object} updatedFields An object with the fields to update.
 */
async function updateSpatialLayout(instanceId, updatedFields) {
    const layout = getLayoutByInstanceId(instanceId);
    if (!layout) return console.error("Layout not found for update:", instanceId);
    Object.assign(layout, updatedFields);
    await window.sheetsService.writeSheetData('Spatial Layout', AppState.spatialLayouts);
}

// Expose the state and its functions globally.
window.AppState = {
    // Raw state properties
    get assets() { return AppState.assets; },
    get rooms() { return AppState.rooms; },
    get spatialLayouts() { return AppState.spatialLayouts; },
    get isLoaded() { return AppState.isLoaded; },
    
    // Functions
    initializeState,
    getAssetById,
    getRoomById,
    getLayoutsByRoomId,
    getLayoutByInstanceId,
    updateAsset,
    updateSpatialLayout,
};
