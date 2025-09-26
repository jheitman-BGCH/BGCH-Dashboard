// JS/state.js

// --- CONFIGURATION ---
export const CLIENT_ID = '525866256494-i4g16ahgtjvm851k1q5k9qg05vjbv1dt.apps.googleusercontent.com';
export const SPREADSHEET_ID = '1YZ1bACVHyudX08jqSuojSBAxSPO5_bRp9czImJhShhY';
export const ASSET_SHEET = 'Asset';
export const EMPLOYEES_SHEET = 'Employees';
export const ROOMS_SHEET = 'Rooms';
export const SPATIAL_LAYOUT_SHEET = 'Spatial Layout';
export const ITEMS_PER_PAGE = 25;

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

export const EMPLOYEE_HEADER_MAP = [
    { key: "EmployeeID", aliases: ["EmployeeID", "Employee ID"] },
    { key: "EmployeeName", aliases: ["EmployeeName", "Name"] },
    { key: "Title", aliases: ["Title"] },
    { key: "Department", aliases: ["Department"] },
    { key: "Email", aliases: ["Email"] },
    { key: "Phone", aliases: ["Phone"] },
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
export const EMPLOYEE_HEADERS = EMPLOYEE_HEADER_MAP.map(h => h.key);
export const ROOMS_HEADERS = ROOMS_HEADER_MAP.map(h => h.key);
export const SPATIAL_LAYOUT_HEADERS = SPATIAL_LAYOUT_HEADER_MAP.map(h => h.key);


export const CHART_COLORS = [
    'rgba(54, 162, 235, 0.6)', 'rgba(255, 206, 86, 0.6)', 'rgba(255, 99, 132, 0.6)',
    'rgba(75, 192, 192, 0.6)', 'rgba(153, 102, 255, 0.6)', 'rgba(255, 159, 64, 0.6)',
    'rgba(199, 199, 199, 0.6)', 'rgba(83, 102, 255, 0.6)', 'rgba(40, 230, 150, 0.6)'
];
