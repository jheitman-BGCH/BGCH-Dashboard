// JS/state.js

// --- CONFIGURATION ---
export const CLIENT_ID = '525866256494-i4g16ahgtjvm851k1q5k9qg05vjbv1dt.apps.googleusercontent.com';
export const SPREADSHEET_ID = '1YZ1bACVHyudX08jqSuojSBAxSPO5_bRp9czImJhShhY';
export const ASSET_SHEET = 'Asset';
export const ROOMS_SHEET = 'Rooms';
export const SPATIAL_LAYOUT_SHEET = 'Spatial Layout';

export const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
export const ASSET_HEADERS = [
    "AssetID", "AssetName", "AssetType", "Quantity", "Site", "Location", "Container",
    "IntendedUserType", "Condition", "IDCode", "ModelNumber", "SerialNumber", "AssignedTo",
    "DateIssued", "PurchaseDate", "Specs", "LoginInfo", "Notes", "ParentObjectID"
];
export const ROOMS_HEADERS = ["RoomID", "RoomName", "GridWidth", "GridHeight"];
export const SPATIAL_LAYOUT_HEADERS = ["InstanceID", "ReferenceID", "ParentID", "PosX", "PosY", "Width", "Height", "Orientation", "ShelfRows", "ShelfCols"];


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
