// JS/main.js
import { state, CLIENT_ID, SCOPES, ASSET_SHEET, ROOMS_SHEET, SPATIAL_LAYOUT_SHEET, ASSET_HEADERS } from './state.js';
import * as api from './sheetsService.js';
import * as ui from './ui.js';
import { initVisualInventory } from './visual_inventory_logic.js';

// --- INITIALIZATION ---

window.onload = () => {
    ui.initUI(); // Initialize DOM element references in ui.js
    loadVisibleColumns();
    setupEventListeners();
};

/**
 * Loads the user's preferred visible columns from local storage.
 */
function loadVisibleColumns() {
    const savedCols = localStorage.getItem('visibleColumns');
    if (savedCols) {
        state.visibleColumns = JSON.parse(savedCols);
    } else {
        // Default columns
        state.visibleColumns = ["AssetName", "AssetType", "IDCode", "AssignedTo", "Condition"];
    }
}


/**
 * Callback for when the Google API script has loaded.
 */
function gapiLoaded() {
    gapi.load('client', () => {
        state.gapiInited = true;
        checkAndInitialize();
    });
}

/**
 * Callback for when the Google Identity Services script has loaded.
 */
function gisLoaded() {
    state.gisInited = true;
    checkAndInitialize();
}

// Make callbacks global for the external script tags in index.html
window.gapiLoaded = gapiLoaded;
window.gisLoaded = gisLoaded;


/**
 * Checks if both Google API clients are ready and then initializes them.
 */
function checkAndInitialize() {
    if (state.gapiInited && state.gisInited) {
        initializeGoogleClients();
    }
}

/**
 * Initializes the GAPI and GIS clients for authentication and Sheets API access.
 */
async function initializeGoogleClients() {
    try {
        await gapi.client.init({
            discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
        });
        state.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    handleSigninStatusChange(true);
                } else if (tokenResponse.error) {
                    console.warn("Silent auth failed:", tokenResponse.error);
                    handleSigninStatusChange(false);
                }
            },
        });
        state.tokenClient.requestAccessToken({ prompt: 'none' });
    } catch (error) {
        console.error("Error initializing Google clients:", error);
        ui.showMessage("Failed to initialize Google services. Check your Client ID.");
    }
}


// --- AUTHENTICATION ---

/**
 * Handles the sign-in button click.
 */
function handleAuthClick() {
    state.tokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
 * Handles the sign-out button click.
 */
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken('');
            handleSigninStatusChange(false);
        });
    }
}

/**
 * Updates the UI based on sign-in status and triggers the initial data load.
 * @param {boolean} isSignedIn - The user's current sign-in status.
 */
function handleSigninStatusChange(isSignedIn) {
    ui.updateSigninStatus(isSignedIn);
    if (isSignedIn) {
        initializeAppData();
    }
}


// --- DATA FETCHING AND PROCESSING ---

/**
 * Main function to load all data from Google Sheets, process it, and render the UI.
 * This is the primary refresh function for the application.
 */
async function initializeAppData() {
    ui.setLoading(true);
    try {
        const ranges = [
            `${ASSET_SHEET}!A:Z`,
            `${ROOMS_SHEET}!A:Z`,
            `${SPATIAL_LAYOUT_SHEET}!A:Z`
        ];
        const { meta, data } = await api.fetchSheetMetadataAndData(ranges);
        
        // Store sheet IDs for later use (e.g., deleting rows)
        const newSheetIds = {};
        meta.sheets.forEach(sheet => {
            newSheetIds[sheet.properties.title] = sheet.properties.sheetId;
        });
        state.sheetIds = newSheetIds;
        
        const assetValues = data[0].values || [];
        const roomValues = data[1].values || [];
        const layoutValues = data[2].values || [];

        processAssetData(assetValues);
        processRoomData(roomValues);
        processSpatialLayoutData(layoutValues);

        // Populate Main UI
        applyFiltersAndSearch();
        ui.populateFilterDropdowns();
        ui.populateModalDropdowns();
        ui.populateEmployeeDropdown();
        ui.renderOverviewCharts(handleChartClick);
        ui.populateColumnSelector();

        // Initialize Visual Inventory if its tab is active
        if (document.getElementById('visual-inventory-tab').classList.contains('active')) {
            initVisualInventory();
        }

    } catch (err) {
        console.error("Caught error during data load:", err);
        const errorMessage = err.result?.error?.message || err.message || 'Unknown error';
        if (errorMessage.includes("Unable to parse range")) {
            ui.showMessage(`Error: A required sheet is missing. Please ensure 'Asset', 'Rooms', and 'Spatial Layout' sheets exist.`);
        } else {
            ui.showMessage(`Error loading data: ${errorMessage}`);
        }
    } finally {
        ui.setLoading(false);
    }
}

/**
 * Processes raw data from the 'Asset' sheet into structured objects.
 * @param {Array<Array<any>>} values - The raw cell values from the sheet.
 */
function processAssetData(values) {
    if (!values || values.length < 1) {
        state.allAssets = [];
        return;
    }
    const headers = values[0];
    const headerMap = {};
    headers.forEach((header, index) => headerMap[header] = index);
    const dataRows = values.slice(1);
    const assetIdIndex = headerMap["AssetID"];

    state.allAssets = dataRows
        .map((row, index) => ({ data: row, originalIndex: index }))
        .filter(item => item.data && item.data.length > assetIdIndex && item.data[assetIdIndex])
        .map(item => {
            const row = item.data;
            const asset = { rowIndex: item.originalIndex + 2 };
            ASSET_HEADERS.forEach(header => {
                let value = row[headerMap[header]];
                if (header === "LoginInfo" && value) {
                    try {
                        // Basic check if it looks like base64
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

/**
 * Processes raw data from the 'Rooms' sheet.
 * @param {Array<Array<any>>} values - Raw cell values.
 */
function processRoomData(values) {
    if (!values || values.length < 1) {
        state.allRooms = [];
        return;
    }
    const headers = values[0].map(h => h.trim());
    const headerMap = {};
    headers.forEach((header, index) => headerMap[header] = index);
    const dataRows = values.slice(1);
    const roomIdIndex = headerMap["RoomID"];

    state.allRooms = dataRows
        .map((row, index) => ({ data: row, originalIndex: index }))
        .filter(item => item.data && item.data.length > roomIdIndex && item.data[roomIdIndex])
        .map(item => {
            const row = item.data;
            return {
                rowIndex: item.originalIndex + 2,
                RoomID: row[headerMap["RoomID"]],
                RoomName: row[headerMap["RoomName"]] || '',
                GridWidth: parseInt(row[headerMap["GridWidth"]], 10) || 10,
                GridHeight: parseInt(row[headerMap["GridHeight"]], 10) || 10,
            };
        });
}

/**
 * Processes raw data from the 'Spatial Layout' sheet.
 * @param {Array<Array<any>>} values - Raw cell values.
 */
function processSpatialLayoutData(values) {
    if (!values || values.length < 1) {
        state.spatialLayoutData = [];
        return;
    }
    const headers = values[0];
    const headerMap = {};
    headers.forEach((header, index) => headerMap[header.trim()] = index);
    const dataRows = values.slice(1);
    const instanceIdIndex = headerMap["InstanceID"];

    if (instanceIdIndex === undefined) {
        console.error('CRITICAL: "InstanceID" header not found in Spatial Layout sheet. Headers found:', headers);
        state.spatialLayoutData = [];
        return;
    }

    const processedData = [];
    dataRows.forEach((row, index) => {
        const originalSheetRow = index + 2;
        if (!row || row.join('').trim() === '') return;
        const instanceId = row[instanceIdIndex];
        if (!instanceId) {
            console.warn(`Skipping row ${originalSheetRow} in 'Spatial Layout' because "InstanceID" is missing. Data:`, row);
            return;
        }

        processedData.push({
            rowIndex: originalSheetRow,
            InstanceID: instanceId,
            ReferenceID: row[headerMap["ReferenceID"]],
            ParentID: row[headerMap["ParentID"]],
            PosX: parseInt(row[headerMap["PosX"]], 10) || 0,
            PosY: parseInt(row[headerMap["PosY"]], 10) || 0,
            Width: parseInt(row[headerMap["Width"]], 10) || 1,
            Height: parseInt(row[headerMap["Height"]], 10) || 1,
            Orientation: row[headerMap["Orientation"]] || 'Horizontal',
            ShelfRows: row[headerMap["ShelfRows"]] ? parseInt(row[headerMap["ShelfRows"]], 10) : null,
            ShelfCols: row[headerMap["ShelfCols"]] ? parseInt(row[headerMap["ShelfCols"]], 10) : null,
        });
    });
    
    state.spatialLayoutData = processedData;
}


// --- UI LOGIC & EVENT HANDLERS ---

/**
 * Applies current search and filter values and re-renders the asset table.
 */
function applyFiltersAndSearch() {
    const searchTerm = ui.dom.filterSearch.value.toLowerCase();
    const filters = {
        Site: ui.dom.filterSite.value,
        Location: ui.dom.filterLocation.value,
        AssetType: ui.dom.filterAssetType.value,
        Condition: ui.dom.filterCondition.value,
        IntendedUserType: ui.dom.filterIntendedUserType.value,
        AssignedTo: ui.dom.filterAssignedTo.value,
        ModelNumber: ui.dom.filterModelNumber.value,
    };

    let filteredAssets = state.allAssets.filter(asset => {
        const matchesSearch = searchTerm ? Object.values(asset).some(val => String(val).toLowerCase().includes(searchTerm)) : true;
        const matchesFilters = Object.entries(filters).every(([key, value]) => !value || asset[key] === value);
        return matchesSearch && matchesFilters;
    });

    ui.renderTable(filteredAssets);
}


function openEditModal(assetId) {
    const asset = state.allAssets.find(a => a.AssetID === assetId);
    if (!asset) return;
    ui.dom.modalTitle.innerText = 'Edit Asset';
    ui.populateAssetForm(asset);
    ui.toggleModal(ui.dom.assetModal, true);
}

function openCloneModal(assetId) {
    const originalAsset = state.allAssets.find(a => a.AssetID === assetId);
    if (!originalAsset) return;
    const clonedAsset = JSON.parse(JSON.stringify(originalAsset));
    clonedAsset.AssetID = '';
    clonedAsset.rowIndex = '';
    clonedAsset.IDCode = '';
    clonedAsset.SerialNumber = '';
    ui.dom.modalTitle.innerText = 'Clone Asset';
    ui.populateAssetForm(clonedAsset);
    ui.toggleModal(ui.dom.assetModal, true);
}


/**
 * Sets up all the primary event listeners for the application.
 */
function setupEventListeners() {
    ui.dom.authorizeButton.onclick = handleAuthClick;
    ui.dom.signoutButton.onclick = handleSignoutClick;
    ui.dom.refreshBtn.onclick = initializeAppData;

    // Listen for data changes from other modules (like visual inventory)
    window.addEventListener('datachanged', () => initializeAppData());

    ui.dom.addAssetBtn.onclick = () => {
        ui.dom.assetForm.reset();
        ui.dom.modalTitle.innerText = 'Add New Asset';
        ui.dom.assetId.value = '';
        ui.dom.rowIndex.value = '';
        ['site', 'location', 'container', 'asset-type', 'assigned-to'].forEach(id => {
            document.getElementById(`${id}-new`).classList.add('hidden');
            document.getElementById(`${id}-new`).value = '';
            document.getElementById(id).value = '';
        });
        ui.toggleModal(ui.dom.assetModal, true);
    };

    ui.dom.cancelBtn.onclick = () => ui.toggleModal(ui.dom.assetModal, false);
    ui.dom.assetModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(ui.dom.assetModal, false);
    ui.dom.employeeSelect.onchange = ui.displayEmployeeAssets;

    ui.dom.inventoryTab.addEventListener('click', () => switchTab('inventory'));
    ui.dom.overviewTab.addEventListener('click', () => switchTab('overview'));
    ui.dom.employeesTab.addEventListener('click', () => switchTab('employees'));
    ui.dom.visualInventoryTab.addEventListener('click', () => switchTab('visual-inventory'));

    // Dynamic "Add New" dropdowns
    ui.dom.site.addEventListener('change', () => ui.handleDynamicSelectChange(ui.dom.site, document.getElementById('site-new')));
    ui.dom.location.addEventListener('change', () => ui.handleDynamicSelectChange(ui.dom.location, document.getElementById('location-new')));
    ui.dom.container.addEventListener('change', () => ui.handleDynamicSelectChange(ui.dom.container, document.getElementById('container-new')));
    ui.dom.assetType.addEventListener('change', () => ui.handleDynamicSelectChange(ui.dom.assetType, document.getElementById('asset-type-new')));
    ui.dom.assignedTo.addEventListener('change', () => ui.handleDynamicSelectChange(ui.dom.assignedTo, document.getElementById('assigned-to-new')));

    // Filters
    document.querySelectorAll('#filter-section input, #filter-section select').forEach(el => {
        el.addEventListener('input', applyFiltersAndSearch);
    });
    
    // Chart type selectors
    document.querySelectorAll('.chart-type-select').forEach(sel => sel.addEventListener('change', () => ui.renderOverviewCharts(handleChartClick)));

    // Asset form submission
    ui.dom.assetForm.onsubmit = handleAssetFormSubmit;

    // Asset table interactions (delegated)
    ui.dom.assetTableBody.addEventListener('click', handleTableClick);

    // Employee asset list interactions (delegated)
    ui.dom.employeeAssetList.addEventListener('click', (e) => {
        const targetItem = e.target.closest('.employee-asset-item');
        if (targetItem) ui.openDetailModal(targetItem.dataset.id, openEditModal);
    });

    // Detail modal close
    ui.dom.detailModalCloseBtn.onclick = () => ui.toggleModal(ui.dom.detailModal, false);
    ui.dom.detailModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(ui.dom.detailModal, false);
    
    // Close actions dropdown when clicking elsewhere
    window.addEventListener('click', (e) => {
        if (!e.target.closest('.actions-menu')) {
            document.querySelectorAll('.actions-dropdown.show').forEach(d => d.classList.remove('show'));
        }
    });

    setupBulkEditListeners();
    setupColumnSelectorListeners();
}


/**
 * Handles form submission for adding or editing an asset.
 * @param {Event} e - The form submission event.
 */
async function handleAssetFormSubmit(e) {
    e.preventDefault();
    ui.setLoading(true);
    try {
        const getSelectValue = (id) => {
            const select = document.getElementById(id);
            const newInp = document.getElementById(`${id}-new`);
            return select.value === '--new--' ? newInp.value : select.value;
        };

        const assetData = {
            AssetID: ui.dom.assetId.value,
            rowIndex: ui.dom.rowIndex.value,
            AssetName: ui.dom.assetName.value,
            Quantity: ui.dom.quantity.value,
            Site: getSelectValue('site'),
            Location: getSelectValue('location'),
            Container: getSelectValue('container'),
            IntendedUserType: ui.dom.intendedUserType.value,
            Condition: ui.dom.condition.value,
            AssetType: getSelectValue('asset-type'),
            IDCode: ui.dom.idCode.value,
            SerialNumber: ui.dom.serialNumber.value,
            ModelNumber: ui.dom.modelNumber.value,
            AssignedTo: getSelectValue('assigned-to'),
            DateIssued: ui.dom.dateIssued.value,
            PurchaseDate: ui.dom.purchaseDate.value,
            Specs: ui.dom.specs.value,
            LoginInfo: ui.dom.loginInfo.value,
            Notes: ui.dom.notes.value,
        };

        if (assetData.LoginInfo) {
            assetData.LoginInfo = btoa(assetData.LoginInfo);
        }

        const isUpdate = !!assetData.rowIndex;
        if (!assetData.AssetID) {
            assetData.AssetID = `ASSET-${Date.now()}`;
        }
        
        const rowData = ASSET_HEADERS.map(header => assetData[header] || '');

        if (isUpdate) {
            await api.updateSheetValues(`${ASSET_SHEET}!A${assetData.rowIndex}`, [rowData]);
        } else {
            await api.appendSheetValues(ASSET_SHEET, [rowData]);
        }
        await initializeAppData(); // Full refresh after edit/add
    } catch (err) {
        console.error(err);
        ui.showMessage(`Error saving asset: ${err.result.error.message}`);
    } finally {
        ui.toggleModal(ui.dom.assetModal, false);
        ui.setLoading(false);
    }
}

/**
 * Handles all clicks within the asset table body using event delegation.
 * @param {Event} e - The click event.
 */
function handleTableClick(e) {
    const target = e.target;
    if (target.classList.contains('asset-checkbox')) {
        ui.updateBulkEditButtonVisibility();
        return;
    }
    const assetId = target.closest('tr')?.dataset.id;

    if(target.closest('th[data-column]')){
        const colName = target.closest('th[data-column]').dataset.column;
        if (state.sortState.column === colName) {
            state.sortState.direction = state.sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            state.sortState.column = colName;
            state.sortState.direction = 'asc';
        }
        applyFiltersAndSearch();
        return;
    }

    if (target.closest('.actions-btn')) {
        const dropdown = target.closest('.actions-menu').querySelector('.actions-dropdown');
        document.querySelectorAll('.actions-dropdown.show').forEach(d => d !== dropdown && d.classList.remove('show'));
        dropdown.classList.toggle('show');
        return;
    }
    if (target.closest('.actions-dropdown')) {
        const dropdown = target.closest('.actions-dropdown');
        if (target.classList.contains('edit-btn')) openEditModal(target.dataset.id);
        else if (target.classList.contains('clone-btn')) openCloneModal(target.dataset.id);
        else if (target.classList.contains('delete-btn')) {
            if (confirm("Are you sure you want to delete this asset? This cannot be undone.")) {
                handleDeleteRow(ASSET_SHEET, target.dataset.rowIndex);
            }
        }
        dropdown.classList.remove('show');
        return;
    }
    if (assetId) ui.openDetailModal(assetId, openEditModal);
}

/**
 * Sets up event listeners for the bulk edit modal.
 */
function setupBulkEditListeners() {
    ui.dom.bulkEditBtn.addEventListener('click', () => {
        document.getElementById('bulk-edit-form').reset();
        document.querySelectorAll('#bulk-edit-form [disabled]').forEach(el => el.disabled = true);
        ui.toggleModal(ui.dom.bulkEditModal, true);
    });
    document.getElementById('bulk-cancel-btn').onclick = () => ui.toggleModal(ui.dom.bulkEditModal, false);
    ui.dom.bulkEditModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(ui.dom.bulkEditModal, false);
    document.querySelectorAll('[id^="bulk-update-"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const fieldName = e.target.id.replace('bulk-update-', '').replace('-check', '');
            const inputEl = document.getElementById(`bulk-${fieldName}`) || document.getElementById(`bulk-${fieldName}-type`);
            if (inputEl) inputEl.disabled = !e.target.checked;
        });
    });
    document.getElementById('bulk-site').addEventListener('change', () => ui.handleDynamicSelectChange(document.getElementById('bulk-site'), document.getElementById('bulk-site-new')));
    document.getElementById('bulk-location').addEventListener('change', () => ui.handleDynamicSelectChange(document.getElementById('bulk-location'), document.getElementById('bulk-location-new')));
    document.getElementById('bulk-container').addEventListener('change', () => ui.handleDynamicSelectChange(document.getElementById('bulk-container'), document.getElementById('bulk-container-new')));
    document.getElementById('bulk-assigned-to').addEventListener('change', () => ui.handleDynamicSelectChange(document.getElementById('bulk-assigned-to'), document.getElementById('bulk-assigned-to-new')));
    document.getElementById('bulk-edit-form').onsubmit = (e) => {
        e.preventDefault();
        handleBulkUpdate();
    };
}


/**
 * Sets up event listeners for the column selector modal.
 */
function setupColumnSelectorListeners() {
    ui.dom.customizeColsBtn.addEventListener('click', () => {
        ui.populateColumnSelector();
        ui.toggleModal(ui.dom.columnModal, true);
    });
    ui.dom.columnCancelBtn.onclick = () => ui.toggleModal(ui.dom.columnModal, false);
    ui.dom.columnModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(ui.dom.columnModal, false);
    ui.dom.columnSaveBtn.addEventListener('click', () => {
        const selectedCols = [...document.querySelectorAll('#column-checkboxes input:checked')].map(cb => cb.value);
        const newVisibleColumns = new Set(["AssetName", ...selectedCols]);
        state.visibleColumns = Array.from(newVisibleColumns);
        localStorage.setItem('visibleColumns', JSON.stringify(state.visibleColumns));
        applyFiltersAndSearch();
        ui.renderFilters();
        ui.toggleModal(ui.dom.columnModal, false);
    });
}


/**
 * Handles the logic for a bulk update operation.
 */
async function handleBulkUpdate() {
    ui.setLoading(true);
    try {
        const selectedAssetIds = [...document.querySelectorAll('.asset-checkbox:checked')].map(cb => cb.dataset.id);
        if (selectedAssetIds.length === 0) return;

        const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: state.SPREADSHEET_ID, range: `${ASSET_SHEET}!1:1` });
        const sheetHeaders = response.result.values ? response.result.values[0] : [];
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
            { checkId: 'bulk-update-intended-user-check', fieldName: 'IntendedUserType', getValue: () => document.getElementById('bulk-intended-user-type').value },
            { checkId: 'bulk-update-condition-check', fieldName: 'Condition', getValue: () => document.getElementById('bulk-condition').value },
            { checkId: 'bulk-update-assigned-to-check', fieldName: 'AssignedTo', getValue: () => getSelectValue('bulk-assigned-to') }
        ];

        const updates = [];
        fields.forEach(field => {
            if (document.getElementById(field.checkId).checked) {
                const value = field.getValue();
                selectedAssetIds.forEach(id => {
                    const asset = state.allAssets.find(a => a.AssetID === id);
                    if (asset) updates.push({ range: `${ASSET_SHEET}!${headerMap[field.fieldName]}${asset.rowIndex}`, values: [[value]] });
                });
            }
        });
        if (updates.length > 0) {
            await api.batchUpdateSheetValues(updates);
            await initializeAppData();
        }
    } catch (err) {
        console.error(err);
        ui.showMessage(`Error with bulk update: ${err.result.error.message}`);
    } finally {
        ui.toggleModal(ui.dom.bulkEditModal, false);
        ui.setLoading(false);
    }
}


/**
 * Handles deleting a row from a specified sheet.
 * @param {string} sheetName - The name of the sheet.
 * @param {number} rowIndex - The 1-based index of the row to delete.
 */
async function handleDeleteRow(sheetName, rowIndex) {
    const sheetId = state.sheetIds[sheetName];
    if (!sheetId) {
        ui.showMessage(`Error: Could not find sheet ID for ${sheetName}`);
        return;
    }
    ui.setLoading(true);
    try {
        await api.batchUpdateSheet({
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: sheetId,
                        dimension: "ROWS",
                        startIndex: rowIndex - 1,
                        endIndex: rowIndex
                    }
                }
            }]
        });
        await initializeAppData();
    } catch (err) {
        console.error(err);
        ui.showMessage(`Error deleting from ${sheetName}: ${err.result.error.message}`);
    } finally {
        ui.setLoading(false);
    }
}

/**
 * Handles navigation between the main tabs.
 * @param {string} tabName - The name of the tab to switch to.
 */
function switchTab(tabName) {
    const tabs = {
        inventory: { panel: ui.dom.inventoryPanel, button: ui.dom.inventoryTab },
        overview: { panel: ui.dom.overviewPanel, button: ui.dom.overviewTab },
        employees: { panel: ui.dom.employeesPanel, button: ui.dom.employeesTab },
        'visual-inventory': { panel: ui.dom.visualInventoryPanel, button: ui.dom.visualInventoryTab }
    };
    Object.values(tabs).forEach(tab => {
        tab.panel.classList.add('hidden');
        tab.button.classList.remove('active');
    });
    tabs[tabName].panel.classList.remove('hidden');
    tabs[tabName].button.classList.add('active');
    if (tabName === 'overview') ui.renderOverviewCharts(handleChartClick);
    if (tabName === 'visual-inventory') {
        initVisualInventory();
    }
}


/**
 * Handles clicks on chart elements to filter the main inventory view.
 * @param {Event} event - The click event.
 * @param {Array} elements - The chart elements that were clicked.
 * @param {string} filterId - The ID of the filter dropdown to update.
 */
function handleChartClick(event, elements, filterId) {
    if (elements.length > 0) {
        const label = elements[0].element.$context.chart.data.labels[elements[0].index];
        if (filterId === 'employee-select') {
            switchTab('employees');
            document.getElementById('employee-select').value = label;
            ui.displayEmployeeAssets();
        } else {
            ui.dom.filterSearch.value = '';
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
