// js/script.js
// --- CONFIGURATION ---
const CLIENT_ID = '525866256494-i4g16ahgtjvm851k1q5k9qg05vjbv1dt.apps.googleusercontent.com';
const SPREADSHEET_ID = '1YZ1bACVHyudX08jqSuojSBAxSPO5_bRp9czImJhShhY';
const ASSET_SHEET = 'Asset';
const ROOMS_SHEET = 'Rooms';
const SPATIAL_LAYOUT_SHEET = 'Spatial Layout';

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const ASSET_HEADERS = [
    "Asset ID", "Asset Name", "Quantity", "Site", "Location", "Container",
    "Intended User Type", "Condition", "Asset Type", "ID Code", "Serial Number", "Model Number",
    "Assigned To", "Date Issued", "Purchase Date", "Specs", "Login Info", "Notes"
];
const ROOMS_HEADERS = ["Room ID", "Room Name", "Grid Width", "Grid Height", "Notes"];
const SPATIAL_LAYOUT_HEADERS = ["Instance ID", "Reference ID", "Parent ID", "Pos X", "Pos Y", "Width", "Height", "Orientation", "Shelf Rows", "Shelf Cols"];

const CHART_COLORS = [
    'rgba(54, 162, 235, 0.6)', 'rgba(255, 206, 86, 0.6)', 'rgba(255, 99, 132, 0.6)',
    'rgba(75, 192, 192, 0.6)', 'rgba(153, 102, 255, 0.6)', 'rgba(255, 159, 64, 0.6)',
    'rgba(199, 199, 199, 0.6)', 'rgba(83, 102, 255, 0.6)', 'rgba(40, 230, 150, 0.6)'
];

// --- STATE MANAGEMENT ---
let tokenClient;
let gapiInited = false;
let gisInited = false;
let allAssets = []; // Cache for Asset sheet
let allRooms = []; // Cache for Rooms sheet
let spatialLayoutData = []; // Cache for Spatial Layout sheet
let charts = {}; // To hold chart instances
let visibleColumns = [];
let sortState = { column: 'Asset Name', direction: 'asc' };
let sheetIds = {}; // To store sheetId for operations like delete

// --- DOM ELEMENT REFERENCES ---
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const authorizeButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');
const addAssetBtn = document.getElementById('add-asset-btn');
const bulkEditBtn = document.getElementById('bulk-edit-btn');
const refreshBtn = document.getElementById('refresh-data-btn');
const assetModal = document.getElementById('asset-modal');
const assetForm = document.getElementById('asset-form');
const cancelBtn = document.getElementById('cancel-btn');
const loadingIndicator = document.getElementById('loading-indicator');
const noDataMessage = document.getElementById('no-data-message');
const employeeSelect = document.getElementById('employee-select');
const employeeAssetList = document.getElementById('employee-asset-list');
const detailModal = document.getElementById('detail-modal');
const bulkEditModal = document.getElementById('bulk-edit-modal');
const columnModal = document.getElementById('column-modal');

// Tabs
const inventoryTab = document.getElementById('inventory-tab');
const overviewTab = document.getElementById('overview-tab');
const employeesTab = document.getElementById('employees-tab');
const visualInventoryTab = document.getElementById('visual-inventory-tab');
const inventoryPanel = document.getElementById('inventory-panel');
const overviewPanel = document.getElementById('overview-panel');
const employeesPanel = document.getElementById('employees-panel');
const visualInventoryPanel = document.getElementById('visual-inventory-panel');

// --- GOOGLE API SCRIPT LOAD CALLBACKS ---
function gapiLoaded() {
    gapi.load('client', () => {
        gapiInited = true;
        checkAndInitialize();
    });
}

function gisLoaded() {
    gisInited = true;
    checkAndInitialize();
}

// --- INITIALIZATION ---
window.onload = () => {
    loadVisibleColumns();
    setupEventListeners();
};

function loadVisibleColumns() {
    const savedCols = localStorage.getItem('visibleColumns');
    if (savedCols) {
        visibleColumns = JSON.parse(savedCols);
    } else {
        // Default columns
        visibleColumns = ["Asset Name", "Asset Type", "ID Code", "Assigned To", "Condition"];
    }
}

function checkAndInitialize() {
    if (gapiInited && gisInited) {
        initializeGoogleClients();
    }
}

async function initializeGoogleClients() {
    try {
        await gapi.client.init({
            discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
        });
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    updateSigninStatus(true);
                } else if (tokenResponse.error) {
                    console.warn("Silent auth failed:", tokenResponse.error);
                    updateSigninStatus(false);
                }
            },
        });
        tokenClient.requestAccessToken({ prompt: 'none' });
    } catch (error) {
        console.error("Error initializing Google clients:", error);
        showMessage("Failed to initialize Google services. Check your Client ID.");
    }
}

// --- AUTHENTICATION ---
function handleAuthClick() {
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken('');
            updateSigninStatus(false);
        });
    }
}

function updateSigninStatus(isSignedIn) {
    authSection.classList.toggle('hidden', isSignedIn);
    dashboardSection.classList.toggle('hidden', !isSignedIn);
    if (isSignedIn) {
        loadAllSheetData();
    }
}

// --- GOOGLE SHEETS API CALLS ---
async function loadAllSheetData() {
    setLoading(true);
    try {
        // First, get sheet metadata to find sheet IDs
        const metaResponse = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID
        });
        metaResponse.result.sheets.forEach(sheet => {
            sheetIds[sheet.properties.title] = sheet.properties.sheetId;
        });

        // Now, get all the values
        const ranges = [ASSET_SHEET, ROOMS_SHEET, SPATIAL_LAYOUT_SHEET];
        const response = await gapi.client.sheets.spreadsheets.values.batchGet({
            spreadsheetId: SPREADSHEET_ID,
            ranges: ranges,
        });

        const results = response.result.valueRanges;
        const assetValues = results[0].values || [];
        const roomValues = results[1].values || [];
        const layoutValues = results[2].values || [];

        processAssetData(assetValues);
        processRoomData(roomValues);
        processSpatialLayoutData(layoutValues);

        // Populate Main UI
        applyFiltersAndSearch();
        populateFilterDropdowns();
        populateModalDropdowns();
        populateEmployeeDropdown();
        renderOverviewCharts();
        populateColumnSelector();

        // Initialize Visual Inventory if its logic file is loaded
        if (typeof initVisualInventory === 'function') {
            if (document.getElementById('visual-inventory-tab').classList.contains('active')) {
                initVisualInventory();
            }
        }

    } catch (err) {
        console.error("Caught error during data load:", err);
        const errorMessage = err.result?.error?.message || err.message || 'Unknown error';
        if (errorMessage.includes("Unable to parse range")) {
            showMessage(`Error: A required sheet is missing. Please ensure 'Asset', 'Rooms', and 'Spatial Layout' sheets exist.`);
        } else {
            showMessage(`Error loading data: ${errorMessage}`);
        }
    } finally {
        setLoading(false);
    }
}

function processAssetData(values) {
    const headers = values.length > 0 ? values[0] : ASSET_HEADERS;
    const headerMap = {};
    headers.forEach((header, index) => headerMap[header] = index);
    const dataRows = values.slice(1);

    allAssets = dataRows.map((row, index) => {
        const asset = {
            rowIndex: index + 2
        };
        ASSET_HEADERS.forEach(header => {
            let value = row[headerMap[header]];
            if (header === "Login Info" && value) {
                try {
                    // Check if it's likely base64 before decoding
                    if (/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/.test(value)) {
                        value = atob(value);
                    }
                } catch (e) {
                    console.warn("Could not decode login info, treating as plain text:", value);
                }
            }
            asset[header] = value;
        });
        return asset;
    });
}

function processRoomData(values) {
    if (!values || values.length === 0) {
        allRooms = [];
        return;
    }
    const headers = values[0].map(h => h.trim());
    const headerMap = {};
    headers.forEach((header, index) => headerMap[header] = index);
    const dataRows = values.slice(1);

    allRooms = dataRows
        .filter(row => row && row[headerMap["Room ID"]])
        .map((row, index) => ({
            rowIndex: index + 2,
            "Room ID": row[headerMap["Room ID"]],
            "Room Name": row[headerMap["Room Name"]] || '',
            "Grid Width": parseInt(row[headerMap["Grid Width"]], 10) || 10,
            "Grid Height": parseInt(row[headerMap["Grid Height"]], 10) || 10,
            "Notes": row[headerMap["Notes"]],
        }));
}

function processSpatialLayoutData(values) {
    const headers = values.length > 0 ? values[0] : SPATIAL_LAYOUT_HEADERS;
    const headerMap = {};
    headers.forEach((header, index) => headerMap[header] = index);
    const dataRows = values.slice(1);

    spatialLayoutData = dataRows.map((row, index) => ({
        rowIndex: index + 2,
        "Instance ID": row[headerMap["Instance ID"]],
        "Reference ID": row[headerMap["Reference ID"]],
        "Parent ID": row[headerMap["Parent ID"]],
        "Pos X": parseInt(row[headerMap["Pos X"]], 10) || 0,
        "Pos Y": parseInt(row[headerMap["Pos Y"]], 10) || 0,
        "Width": parseInt(row[headerMap["Width"]], 10) || 1,
        "Height": parseInt(row[headerMap["Height"]], 10) || 1,
        "Orientation": row[headerMap["Orientation"]] || 'Horizontal',
        "Shelf Rows": row[headerMap["Shelf Rows"]] ? parseInt(row[headerMap["Shelf Rows"]], 10) : null,
        "Shelf Cols": row[headerMap["Shelf Cols"]] ? parseInt(row[headerMap["Shelf Cols"]], 10) : null,
    }));
}

async function writeToSheet(data, isUpdate = false) {
    setLoading(true);
    try {
        const dataMap = { ...data };
        if (dataMap["Login Info"]) {
            dataMap["Login Info"] = btoa(dataMap["Login Info"]);
        }

        const rowData = ASSET_HEADERS.map(header => dataMap[header] || '');

        if (isUpdate) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${ASSET_SHEET}!A${data.rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowData] }
            });
        } else {
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: ASSET_SHEET,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowData] }
            });
        }
        await loadAllSheetData(); // Full refresh after edit/add
    } catch (err) {
        console.error(err);
        showMessage(`Error saving asset: ${err.result.error.message}`);
    } finally {
        setLoading(false);
    }
}

async function bulkWriteToSheet(updates) {
    setLoading(true);
    try {
        const data = updates.map(update => ({
            range: `${ASSET_SHEET}!${update.columnLetter}${update.rowIndex}`,
            values: [[update.value]]
        }));

        await gapi.client.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data: data
            }
        });
        await loadAllSheetData();
    } catch (err) {
        console.error(err);
        showMessage(`Error with bulk update: ${err.result.error.message}`);
    } finally {
        setLoading(false);
    }
}

async function deleteRowFromSheet(sheetName, rowIndex) {
    if (!sheetIds[sheetName]) {
        showMessage(`Error: Could not find sheet ID for ${sheetName}`);
        return;
    }
    setLoading(true);
    try {
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: sheetIds[sheetName],
                            dimension: "ROWS",
                            startIndex: rowIndex - 1,
                            endIndex: rowIndex
                        }
                    }
                }]
            }
        });
        // We don't reload all data here; it's handled locally in VI logic
        // For asset deletion, a full reload is appropriate.
        if (sheetName === ASSET_SHEET) {
             await loadAllSheetData();
        }
    } catch (err) {
        console.error(err);
        showMessage(`Error deleting from ${sheetName}: ${err.result.error.message}`);
    } finally {
        setLoading(false);
    }
}

async function updateRowInSheet(sheetName, rowIndex, headers, dataObject) {
    setLoading(true);
    try {
        const rowData = headers.map(header => dataObject[header] || '');
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [rowData] }
        });
        // Do not show success message for frequent VI updates to avoid spam
        // showMessage(`Successfully updated ${sheetName}`, 'success');
    } catch (err) {
        console.error(err);
        showMessage(`Error updating ${sheetName}: ${err.result.error.message}`);
    } finally {
        setLoading(false);
    }
}

// --- UI & DOM MANIPULATION (MAIN DASHBOARD) ---

function populateModalDropdowns() {
    const fields = [
        { id: 'site', key: 'Site' }, { id: 'location', key: 'Location' },
        { id: 'container', key: 'Container' }, { id: 'asset-type', key: 'Asset Type' },
        { id: 'assigned-to', key: 'Assigned To' }
    ];
    const bulkFields = [
        { id: 'bulk-site', key: 'Site' }, { id: 'bulk-location', key: 'Location' },
        { id: 'bulk-container', key: 'Container' }, { id: 'bulk-assigned-to', key: 'Assigned To' }
    ];

    const populate = (field) => {
        const select = document.getElementById(field.id);
        if (!select) return;
        const uniqueValues = [...new Set(allAssets.map(asset => asset[field.key]).filter(Boolean))].sort();
        select.innerHTML = '<option value="">-- Select --</option>';
        uniqueValues.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
        const addNewOption = document.createElement('option');
        addNewOption.value = '--new--';
        addNewOption.textContent = 'Add New...';
        select.appendChild(addNewOption);
    }

    fields.forEach(populate);
    bulkFields.forEach(populate);
}

function populateFilterDropdowns() {
    const filters = [
        { id: 'filter-site', key: 'Site' }, { id: 'filter-asset-type', key: 'Asset Type' },
        { id: 'filter-condition', key: 'Condition' }, { id: 'filter-assigned-to', key: 'Assigned To' },
        { id: 'filter-model-number', key: 'Model Number' }, { id: 'filter-location', key: 'Location' },
        { id: 'filter-intended-user-type', key: 'Intended User Type' }
    ];

    filters.forEach(filter => {
        const select = document.getElementById(filter.id);
        if (!select) return;
        const uniqueValues = [...new Set(allAssets.map(asset => asset[filter.key]).filter(Boolean))].sort();
        const currentValue = select.value;
        select.innerHTML = `<option value="">All</option>`;
        uniqueValues.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
        if ([...select.options].some(opt => opt.value === currentValue)) {
            select.value = currentValue;
        }
    });
    renderFilters();
}

function populateEmployeeDropdown() {
    const employees = [...new Set(allAssets.map(a => a["Assigned To"]).filter(Boolean))].sort();
    employeeSelect.innerHTML = '<option value="">-- Select an Employee --</option>';
    employees.forEach(e => {
        const option = document.createElement('option');
        option.value = e;
        option.textContent = e;
        employeeSelect.appendChild(option);
    });
}

function applyFiltersAndSearch() {
    const searchTerm = document.getElementById('filter-search').value.toLowerCase();
    const filters = {
        Site: document.getElementById('filter-site').value,
        Location: document.getElementById('filter-location').value,
        "Asset Type": document.getElementById('filter-asset-type').value,
        Condition: document.getElementById('filter-condition').value,
        "Intended User Type": document.getElementById('filter-intended-user-type').value,
        "Assigned To": document.getElementById('filter-assigned-to').value,
        "Model Number": document.getElementById('filter-model-number').value,
    };

    let filteredAssets = allAssets.filter(asset => {
        const matchesSearch = searchTerm ? Object.values(asset).some(val => String(val).toLowerCase().includes(searchTerm)) : true;
        const matchesFilters = Object.entries(filters).every(([key, value]) => !value || asset[key] === value);
        return matchesSearch && matchesFilters;
    });

    renderTable(filteredAssets);
}

function handleDynamicSelectChange(selectElement, newElement) {
    if (selectElement.value === '--new--') {
        newElement.classList.remove('hidden');
        newElement.focus();
    } else {
        newElement.classList.add('hidden');
        newElement.value = '';
    }
}

function renderTable(assetsToRender) {
    const tableHead = document.getElementById('asset-table-head');
    const tableBody = document.getElementById('asset-table-body');
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';

    const headerRow = document.createElement('tr');
    let headerHTML = `<th scope="col" class="relative px-6 py-3"><input type="checkbox" id="select-all-assets" class="h-4 w-4 rounded"></th>`;
    visibleColumns.forEach(colName => {
        let sortArrow = '';
        if (sortState.column === colName) {
            sortArrow = sortState.direction === 'asc' ? '▲' : '▼';
        }
        headerHTML += `<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer" data-column="${colName}">${colName} <span class="sort-arrow">${sortArrow}</span></th>`;
    });
    headerHTML += `<th scope="col" class="px-6 py-3">Actions</th>`;
    headerRow.innerHTML = headerHTML;
    tableHead.appendChild(headerRow);

    tableHead.querySelector('#select-all-assets').addEventListener('change', (e) => {
        tableBody.querySelectorAll('.asset-checkbox').forEach(checkbox => {
            checkbox.checked = e.target.checked;
        });
        updateBulkEditButtonVisibility();
    });
    tableHead.querySelectorAll('th[data-column]').forEach(th => {
        th.addEventListener('click', () => {
            const colName = th.dataset.column;
            if (sortState.column === colName) {
                sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.column = colName;
                sortState.direction = 'asc';
            }
            applyFiltersAndSearch();
        });
    });

    const sortedAssets = [...assetsToRender].sort((a, b) => {
        const valA = a[sortState.column] || '';
        const valB = b[sortState.column] || '';
        if (valA < valB) return sortState.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortState.direction === 'asc' ? 1 : -1;
        return 0;
    });

    noDataMessage.classList.toggle('hidden', sortedAssets.length > 0);

    sortedAssets.forEach(asset => {
        const tr = document.createElement('tr');
        tr.dataset.id = asset["Asset ID"];
        let rowHtml = `<td class="relative px-6 py-4"><input type="checkbox" data-id="${asset["Asset ID"]}" class="asset-checkbox h-4 w-4 rounded"></td>`;
        visibleColumns.forEach(colName => {
            const value = asset[colName] || '';
            rowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm">${value}</td>`;
        });
        rowHtml += `
            <td class="px-6 py-4 text-right text-sm font-medium">
                <div class="actions-menu">
                    <button class="actions-btn p-1 rounded-full hover:bg-gray-200">
                         <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600" viewBox="0 0 20 20" fill="currentColor"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
                    </button>
                    <div class="actions-dropdown">
                        <a class="edit-btn" data-id="${asset["Asset ID"]}">Edit</a>
                        <a class="clone-btn" data-id="${asset["Asset ID"]}">Clone</a>
                        <a class="delete-btn" data-row-index="${asset.rowIndex}">Delete</a>
                    </div>
                </div>
            </td>`;
        tr.innerHTML = rowHtml;
        tableBody.appendChild(tr);
    });
    updateBulkEditButtonVisibility();
}

function toggleModal(modal, show) {
    if (show) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.querySelector('.modal-backdrop')?.classList.remove('opacity-0');
            modal.querySelector('.modal-content')?.classList.remove('scale-95');
        }, 10);
    } else {
        modal.querySelector('.modal-backdrop')?.classList.add('opacity-0');
        modal.querySelector('.modal-content')?.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

function openDetailModal(assetId) {
    const asset = allAssets.find(a => a["Asset ID"] === assetId);
    if (!asset) return;
    document.getElementById('detail-modal-title').textContent = asset["Asset Name"] || 'Asset Details';
    const content = document.getElementById('detail-modal-content');
    content.innerHTML = `
        <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            ${ASSET_HEADERS.filter(h => h !== "Login Info").map(key => `
                <div>
                    <dt>${key}:</dt>
                    <dd>${asset[key] || 'N/A'}</dd>
                </div>
            `).join('')}
        </dl>
    `;
    const editBtn = document.getElementById('detail-modal-edit-btn');
    const newEditBtn = editBtn.cloneNode(true); // Clone to remove old listeners
    editBtn.parentNode.replaceChild(newEditBtn, editBtn);
    newEditBtn.addEventListener('click', () => {
        toggleModal(detailModal, false);
        openEditModal(assetId);
    });
    toggleModal(detailModal, true);
}

function populateAssetForm(asset) {
    assetForm.reset();
    document.getElementById('asset-id').value = asset["Asset ID"] || '';
    document.getElementById('row-index').value = asset.rowIndex || '';
    document.getElementById('asset-name').value = asset["Asset Name"] || '';
    document.getElementById('quantity').value = asset["Quantity"] || '1';
    document.getElementById('intended-user-type').value = asset["Intended User Type"] || 'Staff';
    document.getElementById('condition').value = asset["Condition"] || 'Good';
    document.getElementById('id-code').value = asset["ID Code"] || '';
    document.getElementById('serial-number').value = asset["Serial Number"] || '';
    document.getElementById('model-number').value = asset["Model Number"] || '';
    document.getElementById('date-issued').value = asset["Date Issued"] || '';
    document.getElementById('purchase-date').value = asset["Purchase Date"] || '';
    document.getElementById('specs').value = asset["Specs"] || '';
    document.getElementById('login-info').value = asset["Login Info"] || '';
    document.getElementById('notes').value = asset["Notes"] || '';

    const dynamicFields = [
        { id: 'site', key: 'Site' }, { id: 'location', key: 'Location' },
        { id: 'container', key: 'Container' }, { id: 'asset-type', key: 'Asset Type' },
        { id: 'assigned-to', key: 'Assigned To' }
    ];
    dynamicFields.forEach(field => {
        const select = document.getElementById(field.id);
        const newInp = document.getElementById(`${field.id}-new`);
        const value = asset[field.key];
        const optionExists = [...select.options].some(opt => opt.value === value);

        if (value && optionExists) {
            select.value = value;
            newInp.classList.add('hidden');
        } else if (value) {
            select.value = '--new--';
            newInp.value = value;
            newInp.classList.remove('hidden');
        } else {
            select.value = '';
            newInp.classList.add('hidden');
            newInp.value = '';
        }
    });
}

function openEditModal(assetId) {
    const asset = allAssets.find(a => a["Asset ID"] === assetId);
    if (!asset) return;
    document.getElementById('modal-title').innerText = 'Edit Asset';
    populateAssetForm(asset);
    toggleModal(assetModal, true);
}

function openCloneModal(assetId) {
    const originalAsset = allAssets.find(a => a["Asset ID"] === assetId);
    if (!originalAsset) return;
    const clonedAsset = JSON.parse(JSON.stringify(originalAsset));
    clonedAsset["Asset ID"] = '';
    clonedAsset.rowIndex = '';
    clonedAsset["ID Code"] = '';
    clonedAsset["Serial Number"] = '';
    document.getElementById('modal-title').innerText = 'Clone Asset';
    populateAssetForm(clonedAsset);
    toggleModal(assetModal, true);
}

function displayEmployeeAssets() {
    const selectedEmployee = employeeSelect.value;
    if (!selectedEmployee) {
        employeeAssetList.innerHTML = '';
        return;
    }
    const assets = allAssets.filter(a => a["Assigned To"] === selectedEmployee);
    if (assets.length === 0) {
        employeeAssetList.innerHTML = `<p class="text-gray-500">No assets assigned to this employee.</p>`;
        return;
    }
    employeeAssetList.innerHTML = `
        <ul class="divide-y divide-gray-200">
            ${assets.map(a => `
                <li class="p-3 employee-asset-item" data-id="${a["Asset ID"]}">
                    <p class="text-sm font-medium">${a["Asset Name"]}</p>
                    <p class="text-sm text-gray-500">${a["Asset Type"] || ''} (ID: ${a["ID Code"] || 'N/A'})</p>
                </li>
            `).join('')}
        </ul>
    `;
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    authorizeButton.onclick = handleAuthClick;
    signoutButton.onclick = handleSignoutClick;
    refreshBtn.onclick = loadAllSheetData;

    addAssetBtn.onclick = () => {
        assetForm.reset();
        document.getElementById('modal-title').innerText = 'Add New Asset';
        document.getElementById('asset-id').value = '';
        document.getElementById('row-index').value = '';
        ['site', 'location', 'container', 'asset-type', 'assigned-to'].forEach(id => {
            document.getElementById(`${id}-new`).classList.add('hidden');
            document.getElementById(`${id}-new`).value = '';
            document.getElementById(id).value = '';
        });
        toggleModal(assetModal, true);
    };

    cancelBtn.onclick = () => toggleModal(assetModal, false);
    assetModal.querySelector('.modal-backdrop').onclick = () => toggleModal(assetModal, false);
    employeeSelect.onchange = displayEmployeeAssets;

    inventoryTab.addEventListener('click', () => switchTab('inventory'));
    overviewTab.addEventListener('click', () => switchTab('overview'));
    employeesTab.addEventListener('click', () => switchTab('employees'));
    visualInventoryTab.addEventListener('click', () => switchTab('visual-inventory'));

    document.getElementById('site').addEventListener('change', () => handleDynamicSelectChange(document.getElementById('site'), document.getElementById('site-new')));
    document.getElementById('location').addEventListener('change', () => handleDynamicSelectChange(document.getElementById('location'), document.getElementById('location-new')));
    document.getElementById('container').addEventListener('change', () => handleDynamicSelectChange(document.getElementById('container'), document.getElementById('container-new')));
    document.getElementById('asset-type').addEventListener('change', () => handleDynamicSelectChange(document.getElementById('asset-type'), document.getElementById('asset-type-new')));
    document.getElementById('assigned-to').addEventListener('change', () => handleDynamicSelectChange(document.getElementById('assigned-to'), document.getElementById('assigned-to-new')));

    document.querySelectorAll('#filter-section input, #filter-section select').forEach(el => {
        el.addEventListener('input', applyFiltersAndSearch);
    });

    document.querySelectorAll('.chart-type-select').forEach(sel => sel.addEventListener('change', renderOverviewCharts));

    assetForm.onsubmit = (e) => {
        e.preventDefault();
        const getSelectValue = (id) => {
            const select = document.getElementById(id);
            const newInp = document.getElementById(`${id}-new`);
            return select.value === '--new--' ? newInp.value : select.value;
        };

        const assetData = {
            "Asset ID": document.getElementById('asset-id').value,
            rowIndex: document.getElementById('row-index').value,
            "Asset Name": document.getElementById('asset-name').value,
            "Quantity": document.getElementById('quantity').value,
            Site: getSelectValue('site'),
            Location: getSelectValue('location'),
            Container: getSelectValue('container'),
            "Intended User Type": document.getElementById('intended-user-type').value,
            Condition: document.getElementById('condition').value,
            "Asset Type": getSelectValue('asset-type'),
            "ID Code": document.getElementById('id-code').value,
            "Serial Number": document.getElementById('serial-number').value,
            "Model Number": document.getElementById('model-number').value,
            "Assigned To": getSelectValue('assigned-to'),
            "Date Issued": document.getElementById('date-issued').value,
            "Purchase Date": document.getElementById('purchase-date').value,
            Specs: document.getElementById('specs').value,
            "Login Info": document.getElementById('login-info').value,
            Notes: document.getElementById('notes').value,
        };
        const isUpdate = !!assetData.rowIndex;
        if (!assetData["Asset ID"]) {
             assetData["Asset ID"] = `ASSET-${Date.now()}`;
        }
        writeToSheet(assetData, isUpdate);
        toggleModal(assetModal, false);
    };

    document.getElementById('asset-table-body').addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('asset-checkbox')) {
            updateBulkEditButtonVisibility();
            return;
        }
        const assetId = target.closest('tr')?.dataset.id;
        if (target.closest('.actions-btn')) {
            const dropdown = target.closest('.actions-menu').querySelector('.actions-dropdown');
            document.querySelectorAll('.actions-dropdown.show').forEach(d => d !== dropdown && d.classList.remove('show'));
            dropdown.classList.toggle('show');
            return;
        }
        if (target.closest('.actions-dropdown')) {
            if (target.classList.contains('edit-btn')) openEditModal(target.dataset.id);
            else if (target.classList.contains('clone-btn')) openCloneModal(target.dataset.id);
            else if (target.classList.contains('delete-btn')) {
                if(confirm("Are you sure you want to delete this asset? This cannot be undone.")) {
                    deleteRowFromSheet(ASSET_SHEET, target.dataset.rowIndex);
                }
            }
            target.closest('.actions-dropdown').classList.remove('show');
            return;
        }
        if (assetId) openDetailModal(assetId);
    });

    employeeAssetList.addEventListener('click', (e) => {
        const targetItem = e.target.closest('.employee-asset-item');
        if (targetItem) openDetailModal(targetItem.dataset.id);
    });

    document.getElementById('detail-modal-close-btn').onclick = () => toggleModal(detailModal, false);
    detailModal.querySelector('.modal-backdrop').onclick = () => toggleModal(detailModal, false);
    window.addEventListener('click', (e) => {
        if (!e.target.closest('.actions-menu')) {
            document.querySelectorAll('.actions-dropdown.show').forEach(d => d.classList.remove('show'));
        }
    });

    setupBulkEditListeners();
    setupColumnSelectorListeners();
}

function setupBulkEditListeners() {
    bulkEditBtn.addEventListener('click', () => {
        document.getElementById('bulk-edit-form').reset();
        document.querySelectorAll('#bulk-edit-form [disabled]').forEach(el => el.disabled = true);
        toggleModal(bulkEditModal, true);
    });
    document.getElementById('bulk-cancel-btn').onclick = () => toggleModal(bulkEditModal, false);
    bulkEditModal.querySelector('.modal-backdrop').onclick = () => toggleModal(bulkEditModal, false);
    document.querySelectorAll('[id^="bulk-update-"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const fieldName = e.target.id.replace('bulk-update-', '').replace('-check', '');
            const inputEl = document.getElementById(`bulk-${fieldName}`) || document.getElementById(`bulk-${fieldName}-type`);
            if (inputEl) inputEl.disabled = !e.target.checked;
        });
    });
    document.getElementById('bulk-site').addEventListener('change', () => handleDynamicSelectChange(document.getElementById('bulk-site'), document.getElementById('bulk-site-new')));
    document.getElementById('bulk-location').addEventListener('change', () => handleDynamicSelectChange(document.getElementById('bulk-location'), document.getElementById('bulk-location-new')));
    document.getElementById('bulk-container').addEventListener('change', () => handleDynamicSelectChange(document.getElementById('bulk-container'), document.getElementById('bulk-container-new')));
    document.getElementById('bulk-assigned-to').addEventListener('change', () => handleDynamicSelectChange(document.getElementById('bulk-assigned-to'), document.getElementById('bulk-assigned-to-new')));
    document.getElementById('bulk-edit-form').onsubmit = (e) => {
        e.preventDefault();
        handleBulkUpdate();
    };
}

function setupColumnSelectorListeners() {
    document.getElementById('customize-cols-btn').addEventListener('click', () => {
        populateColumnSelector();
        toggleModal(columnModal, true);
    });
    document.getElementById('column-cancel-btn').onclick = () => toggleModal(columnModal, false);
    columnModal.querySelector('.modal-backdrop').onclick = () => toggleModal(columnModal, false);
    document.getElementById('column-save-btn').addEventListener('click', () => {
        const selectedCols = [...document.querySelectorAll('#column-checkboxes input:checked')].map(cb => cb.value);
        if (selectedCols.length === 0 && !document.querySelector('#column-checkboxes input[value="Asset Name"]:checked')) {
            selectedCols.push("Asset Name");
        }
        visibleColumns = ["Asset Name", ...selectedCols.filter(c => c !== "Asset Name")];
        localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
        applyFiltersAndSearch();
        renderFilters();
        toggleModal(columnModal, false);
    });
}

// --- GENERAL & HELPER FUNCTIONS ---
function switchTab(tabName) {
    const tabs = {
        inventory: { panel: inventoryPanel, button: inventoryTab },
        overview: { panel: overviewPanel, button: overviewTab },
        employees: { panel: employeesPanel, button: employeesTab },
        'visual-inventory': { panel: visualInventoryPanel, button: visualInventoryTab }
    };
    Object.values(tabs).forEach(tab => {
        tab.panel.classList.add('hidden');
        tab.button.classList.remove('active');
    });
    tabs[tabName].panel.classList.remove('hidden');
    tabs[tabName].button.classList.add('active');
    if (tabName === 'overview') renderOverviewCharts();
    if (tabName === 'visual-inventory' && typeof initVisualInventory === 'function') {
        initVisualInventory();
    }
}

function setLoading(isLoading) {
    loadingIndicator.classList.toggle('hidden', !isLoading);
    loadingIndicator.classList.toggle('flex', isLoading);
}

function showMessage(text, type = 'error') {
    const box = document.getElementById('message-box');
    const textEl = document.getElementById('message-text');
    textEl.innerText = text;
    box.className = 'fixed top-5 right-5 text-white py-3 px-5 rounded-lg shadow-lg z-50';
    box.classList.add(type === 'error' ? 'bg-red-500' : 'bg-green-500');
    box.classList.remove('hidden');
    setTimeout(() => box.classList.add('hidden'), 5000);
}

function handleChartClick(event, elements, filterId) {
    if (elements.length > 0) {
        const label = elements[0].element.$context.chart.data.labels[elements[0].index];
        if (filterId === 'employee-select') {
            switchTab('employees');
            document.getElementById('employee-select').value = label;
            displayEmployeeAssets();
        } else {
            document.getElementById('filter-search').value = '';
            ['filter-site', 'filter-asset-type', 'filter-condition', 'filter-assigned-to', 'filter-model-number'].forEach(id => {
                if (document.getElementById(id)) document.getElementById(id).value = '';
            });
            if (document.getElementById(filterId)) {
                document.getElementById(filterId).value = label;
                switchTab('inventory');
                applyFiltersAndSearch();
            }
        }
    }
}

function renderFilters() {
    const filterMap = {
        "Site": "filter-site-wrapper", "Asset Type": "filter-asset-type-wrapper",
        "Condition": "filter-condition-wrapper", "Assigned To": "filter-assigned-to-wrapper",
        "Model Number": "filter-model-number-wrapper", "Location": "filter-location-wrapper",
        "Intended User Type": "filter-intended-user-type-wrapper"
    };
    Object.values(filterMap).forEach(id => document.getElementById(id)?.classList.add('hidden'));
    visibleColumns.forEach(colName => document.getElementById(filterMap[colName])?.classList.remove('hidden'));
}

function renderOverviewCharts() {
    Object.values(charts).forEach(chart => chart.destroy());
    const processData = (key) => {
        const counts = allAssets.reduce((acc, asset) => {
            const value = asset[key] || 'Uncategorized';
            if (key === 'Assigned To' && value === 'Uncategorized') return acc;
            acc[value] = (acc[value] || 0) + 1;
            return acc;
        }, {});
        return { labels: Object.keys(counts), data: Object.values(counts) };
    };
    const createChartConfig = (type, data, label, filterId) => ({
        type: type,
        data: { labels: data.labels, datasets: [{ label, data: data.data, backgroundColor: CHART_COLORS, borderWidth: 1 }] },
        options: { onClick: (e, el) => handleChartClick(e, el, filterId), scales: (type === 'bar' || type === 'line') ? { y: { beginAtZero: true } } : {} }
    });
    charts.siteChart = new Chart(document.getElementById('site-chart'), createChartConfig(document.getElementById('site-chart-type').value, processData('Site'), 'Assets per Site', 'filter-site'));
    charts.conditionChart = new Chart(document.getElementById('condition-chart'), createChartConfig(document.getElementById('condition-chart-type').value, processData('Condition'), 'Assets by Condition', 'filter-condition'));
    charts.typeChart = new Chart(document.getElementById('type-chart'), createChartConfig(document.getElementById('type-chart-type').value, processData('Asset Type'), 'Assets by Type', 'filter-asset-type'));
    charts.employeeChart = new Chart(document.getElementById('employee-chart'), createChartConfig(document.getElementById('employee-chart-type').value, processData('Assigned To'), 'Assignments per Employee', 'employee-select'));
}

function updateBulkEditButtonVisibility() {
    const selectedCount = document.querySelectorAll('.asset-checkbox:checked').length;
    bulkEditBtn.classList.toggle('hidden', selectedCount === 0);
    if (selectedCount > 0) bulkEditBtn.textContent = `Bulk Edit (${selectedCount}) Selected`;
}

async function handleBulkUpdate() {
    const selectedAssetIds = [...document.querySelectorAll('.asset-checkbox:checked')].map(cb => cb.dataset.id);
    if (selectedAssetIds.length === 0) return;

    const headerResponse = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${ASSET_SHEET}!1:1` });
    const sheetHeaders = headerResponse.result.values ? headerResponse.result.values[0] : [];
    const headerMap = {};
    sheetHeaders.forEach((header, i) => headerMap[header] = String.fromCharCode(65 + i));

    const getSelectValue = (id) => {
        const select = document.getElementById(id);
        const newInp = document.getElementById(`${id}-new`);
        return select.value === '--new--' ? newInp.value : select.value;
    };

    const fields = [
        { checkId: 'bulk-update-site-check', fieldName: 'Site', getValue: () => getSelectValue('bulk-site') },
        { checkId: 'bulk-update-location-check', fieldName: 'Location', getValue: () => getSelectValue('bulk-location') },
        { checkId: 'bulk-update-container-check', fieldName: 'Container', getValue: () => getSelectValue('bulk-container') },
        { checkId: 'bulk-update-intended-user-check', fieldName: 'Intended User Type', getValue: () => document.getElementById('bulk-intended-user-type').value },
        { checkId: 'bulk-update-condition-check', fieldName: 'Condition', getValue: () => document.getElementById('bulk-condition').value },
        { checkId: 'bulk-update-assigned-to-check', fieldName: 'Assigned To', getValue: () => getSelectValue('bulk-assigned-to') }
    ];

    const updates = [];
    fields.forEach(field => {
        if (document.getElementById(field.checkId).checked) {
            const value = field.getValue();
            selectedAssetIds.forEach(id => {
                const asset = allAssets.find(a => a["Asset ID"] === id);
                if (asset) updates.push({ rowIndex: asset.rowIndex, columnLetter: headerMap[field.fieldName], value: value });
            });
        }
    });
    if (updates.length > 0) bulkWriteToSheet(updates);
    toggleModal(bulkEditModal, false);
}

function populateColumnSelector() {
    const container = document.getElementById('column-checkboxes');
    container.innerHTML = '';
    const selectableColumns = ASSET_HEADERS.filter(h => !["Asset ID", "Specs", "Login Info", "Notes", "Asset Name"].includes(h));
    selectableColumns.forEach(colName => {
        const isChecked = visibleColumns.includes(colName);
        const div = document.createElement('div');
        div.className = "flex items-center";
        div.innerHTML = `
            <input id="col-${colName.replace(/\s+/g, '')}" type="checkbox" value="${colName}" ${isChecked ? 'checked' : ''} class="h-4 w-4 rounded">
            <label for="col-${colName.replace(/\s+/g, '')}" class="ml-2 block text-sm">${colName}</label>
        `;
        container.appendChild(div);
    });
}

async function appendRowToSheet(sheetName, headers, dataObject) {
    setLoading(true);
    let newRowIndex = null;
    try {
        const rowData = headers.map(header => dataObject[header] || '');
        const response = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: sheetName,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: [rowData]
            }
        });

        const updatedRange = response.result.updates.updatedRange;
        // Example updatedRange: 'Spatial Layout'!A15:J15
        const match = updatedRange.match(/!A(\d+)/);
        if (match && match[1]) {
            newRowIndex = parseInt(match[1], 10);
        }

        showMessage(`Successfully added to ${sheetName}`, 'success');
    } catch (err) {
        console.error(err);
        showMessage(`Error saving to ${sheetName}: ${err.result.error.message}`);
    } finally {
        setLoading(false);
        return newRowIndex;
    }
}


