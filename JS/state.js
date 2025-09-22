// JS/state.js

// --- CONFIGURATION ---
export const CLIENT_ID = '525866256494-i4g16ahgtjvm851k1q5k9qg05vjbv1dt.apps.googleusercontent.com';
export const SPREADSHEET_ID = '1YZ1bACVHyudX08jqSuojSBAxSPO5_bRp9czImJhShhY';
export const ASSET_SHEET = 'Asset';
export const ROOMS_SHEET = 'Rooms';
export const SPATIAL_LAYOUT_SHEET = 'Spatial Layout';

export const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

// --- HEADER MAPPING CONFIGURATION ---
// This section defines the expected data keys and their possible header names in the spreadsheet.
// This allows for flexibility in sheet column naming (e.g., "AssetID" vs "Asset ID").

export const ASSET_HEADER_MAP = [
    { key: "AssetID", aliases: ["AssetID", "Asset ID"] },
    { key: "AssetName", aliases: ["AssetName", "Asset Name", "Item Name"] },
    { key: "AssetType", aliases: ["AssetType", "Asset Type", "Item Type"] },
    { key: "Quantity", aliases: ["Quantity", "No. of Item"] },
    { key: "Site", aliases: ["Site"] },
    { key: "Location", aliases: ["Location"] },
    { key: "Container", aliases: ["Container"] },
    { key: "IntendedUserType", aliases: ["IntendedUserType", "Intended User Type", "Intended User"] },
    { key: "Condition", aliases: ["Condition"] },
    { key: "IDCode", aliases: ["IDCode", "ID Code"] },
    { key: "ModelNumber", aliases: ["ModelNumber", "Model Number"] },
    { key: "SerialNumber", aliases: ["SerialNumber", "Serial Number"] },
    { key: "AssignedTo", aliases: ["AssignedTo", "Assigned To", "Assignment (Employee)"] },
    { key: "DateIssued", aliases: ["DateIssued", "Date Issued"] },
    { key: "PurchaseDate", aliases: ["PurchaseDate", "Purchase Date"] },
    { key: "Specs", aliases: ["Specs"] },
    { key: "LoginInfo", aliases: ["LoginInfo", "Login Info", "Password / Login Info"] },
    { key: "Notes", aliases: ["Notes"] },
    { key: "ParentObjectID", aliases: ["ParentObjectID", "Parent Object ID"] }
];

export const ROOMS_HEADER_MAP = [
    { key: "RoomID", aliases: ["RoomID", "Room ID"] },
    { key: "RoomName", aliases: ["RoomName", "Room Name"] },
    { key: "GridWidth", aliases: ["GridWidth", "Grid Width"] },
    { key: "GridHeight", aliases: ["GridHeight", "Grid Height"] }
];

export const SPATIAL_LAYOUT_HEADER_MAP = [
    { key: "InstanceID", aliases: ["InstanceID", "Instance ID"] },
    { key: "ReferenceID", aliases: ["ReferenceID", "Reference ID"] },
    { key: "ParentID", aliases: ["ParentID", "Parent ID"] },
    { key: "PosX", aliases: ["PosX", "Pos X"] },
    { key: "PosY", aliases: ["PosY", "Pos Y"] },
    { key: "Width", aliases: ["Width"] },
    { key: "Height", aliases: ["Height"] },
    { key: "Orientation", aliases: ["Orientation"] },
    { key: "ShelfRows", aliases: ["ShelfRows", "Shelf Rows"] },
    { key: "ShelfCols", aliases: ["ShelfCols", "Shelf Cols"] }
];

// --- DERIVED HEADER ARRAYS ---
// These are generated from the maps for compatibility with parts of the app that just need the keys.
export const ASSET_HEADERS = ASSET_HEADER_MAP.map(h => h.key);
export const ROOMS_HEADERS = ROOMS_HEADER_MAP.map(h => h.key);
export const SPATIAL_LAYOUT_HEADERS = SPATIAL_LAYOUT_HEADER_MAP.map(h => h.key);


export const CHART_COLORS = [
    'rgba(54, 162, 235, 0.6)', 'rgba(255, 206, 86, 0.6)', 'rgba(255, 99, 132, 0.6)',
    'rgba(75, 192, 192, 0.6)', 'rgba(153, 102, 255, 0.6)', 'rgba(255, 159, 64, 0.6)',
    'rgba(199, 199, 199, 0.6)', 'rgba(83, 102, 255, 0.6)', 'rgba(40, 230, 150, 0.6)'
];

// --- STATE MANAGEMENT ---
// We use a single state object with getters and setters to manage shared application state.
const _state = {
    tokenClient: null,
    gapiInited: false,
    gisInited: false,
    allAssets: [],
    allRooms: [],
    spatialLayoutData: [],
    charts: {},
    visibleColumns: [],
    sortState: { column: 'AssetName', direction: 'asc' },
    sheetIds: {},
};

export const state = {
    get tokenClient() { return _state.tokenClient; },
    set tokenClient(val) { _state.tokenClient = val; },
    get gapiInited() { return _state.gapiInited; },
    set gapiInited(val) { _state.gapiInited = val; },
    get gisInited() { return _state.gisInited; },
    set gisInited(val) { _state.gisInited = val; },
    get allAssets() { return _state.allAssets; },
    set allAssets(val) { _state.allAssets = val; },
    get allRooms() { return _state.allRooms; },
    set allRooms(val) { _state.allRooms = val; },
    get spatialLayoutData() { return _state.spatialLayoutData; },
    set spatialLayoutData(val) { _state.spatialLayoutData = val; },
    get charts() { return _state.charts; },
    set charts(val) { _state.charts = val; },
    get visibleColumns() { return _state.visibleColumns; },
    set visibleColumns(val) { _state.visibleColumns = val; },
    get sortState() { return _state.sortState; },
    set sortState(val) { _state.sortState = val; },
    get sheetIds() { return _state.sheetIds; },
    set sheetIds(val) { _state.sheetIds = val; },
};
