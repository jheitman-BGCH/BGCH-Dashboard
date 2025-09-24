// JS/main.js
import { state, CLIENT_ID, SCOPES, ASSET_SHEET, EMPLOYEES_SHEET, ROOMS_SHEET, SPATIAL_LAYOUT_SHEET, ASSET_HEADERS, EMPLOYEE_HEADERS, ROOMS_HEADERS, SPATIAL_LAYOUT_HEADERS, ASSET_HEADER_MAP, EMPLOYEE_HEADER_MAP, ROOMS_HEADER_MAP, SPATIAL_LAYOUT_HEADER_MAP } from './state.js';
import * as api from './sheetsService.js';
import * as ui from './ui.js';
import { initVisualInventory } from './visual_inventory_logic.js';

// --- INITIALIZATION ---

// Use DOMContentLoaded to ensure the entire DOM is ready before running scripts
window.addEventListener('DOMContentLoaded', () => {
    ui.initUI(); // Initialize DOM element references in ui.js
    loadVisibleColumns();
    setupEventListeners();
    loadGoogleApiScripts(); // Dynamically load Google scripts to prevent race conditions
});

/**
 * Dynamically loads Google API scripts and sets up their onload callbacks.
 * This approach avoids global scope pollution and timing issues with module scripts.
 */
function loadGoogleApiScripts() {
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.async = true;
    gapiScript.defer = true;
    gapiScript.onload = () => {
        // This callback runs once the GAPI script is loaded.
        gapi.load('client', () => {
            state.gapiInited = true;
            checkAndInitialize();
        });
    };
    document.body.appendChild(gapiScript);

    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.async = true;
    gisScript.defer = true;
    gisScript.onload = () => {
        // This callback runs once the GIS script is loaded.
        state.gisInited = true;
        checkAndInitialize();
    };
    document.body.appendChild(gisScript);
}


/**
 * Loads the user's preferred visible columns from local storage.
 */
function loadVisibleColumns() {
    const savedCols = localStorage.getItem('visibleColumns');
    if (savedCols) {
        state.visibleColumns = JSON.parse(savedCols);
    } else {
        // Default columns if none are saved
        state.visibleColumns = ["AssetName", "AssetType", "IDCode", "AssignedTo", "Condition"];
    }
}

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
        // Attempt to get a token without user interaction
        state.tokenClient.requestAccessToken({ prompt: 'none' });
    } catch (error) {
        console.error("Error initializing Google clients:", error);
        ui.showMessage("Failed to initialize Google services. Check your Client ID.");
    }
}


// --- AUTHENTICATION ---

/**
 * Handles the sign-in button click, prompting the user for consent.
 */
function handleAuthClick() {
    if (state.tokenClient) {
        state.tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        console.error("Authentication client not initialized.");
        ui.showMessage("Authentication service is not ready. Please wait or refresh.", "error");
    }
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
            `${SPATIAL_LAYOUT_SHEET}!A:Z`,
            `${EMPLOYEES_SHEET}!A:Z`
        ];
        const { meta, data } = await api.fetchSheetMetadataAndData(ranges);
        
        const newSheetIds = {};
        meta.sheets.forEach(sheet => {
            newSheetIds[sheet.properties.title] = sheet.properties.sheetId;
        });
        state.sheetIds = newSheetIds;
        
        const assetValues = data[0].values || [];
        const roomValues = data[1].values || [];
        const layoutValues = data[2].values || [];
        const employeeValues = data[3]?.values || [];

        // Use the unified processing function with header maps for all sheets
        state.allAssets = processSheetData(assetValues, ASSET_HEADER_MAP, 'AssetID');
        state.allRooms = processSheetData(roomValues, ROOMS_HEADER_MAP, 'RoomID');
        state.spatialLayoutData = processSheetData(layoutValues, SPATIAL_LAYOUT_HEADER_MAP, 'InstanceID');
        state.allEmployees = processSheetData(employeeValues, EMPLOYEE_HEADER_MAP, 'EmployeeID');
        
        applyFiltersAndSearch();
        ui.populateFilterDropdowns();
        ui.populateModalDropdowns();
        ui.renderEmployeeList(state.allEmployees, state.allAssets);
        ui.renderOverviewCharts(handleChartClick);
        ui.populateColumnSelector();

        if (document.getElementById('visual-inventory-tab').classList.contains('active')) {
            initVisualInventory();
        }

    } catch (err) {
        console.error("Caught error during data load:", err);
        const errorMessage = err.result?.error?.message || err.message || 'Unknown error';
        if (errorMessage.includes("Unable to parse range")) {
            ui.showMessage(`Error: A required sheet is missing. Please ensure 'Asset', 'Rooms', 'Spatial Layout', and 'Employees' sheets exist.`);
        } else {
            ui.showMessage(`Error loading data: ${errorMessage}`);
        }
    } finally {
        ui.setLoading(false);
    }
}

/**
 * A unified function to process raw sheet data into an array of structured objects.
 * It maps row data to object keys based on a flexible header map, making it resilient
 * to column order and naming variations (case-insensitive, ignores spaces).
 * @param {Array<Array<any>>} values - The raw cell values from the sheet, with row 0 being headers.
 * @param {Array<Object>} headerMapConfig - The configuration array mapping keys to header aliases.
 * @param {string} idKey - The name of the property that serves as the unique identifier for a row.
 * @returns {Array<Object>} An array of processed objects.
 */
function processSheetData(values, headerMapConfig, idKey) {
    if (!values || values.length < 1) {
        return [];
    }

    const actualHeaders = values[0].map(h => h ? String(h).trim() : '');
    
    // Helper to normalize headers for robust matching (lowercase, no spaces)
    const normalizeHeader = (header) => header.toLowerCase().replace(/\s+/g, '');

    // Create a map from the normalized header on the sheet to its original column index
    const normalizedSheetHeaderMap = {};
    actualHeaders.forEach((header, index) => {
        const normalized = normalizeHeader(header);
        if (normalized) {
            normalizedSheetHeaderMap[normalized] = index;
        }
    });

    // This will map the CANONICAL key (e.g., "AssetID") to the column index.
    const columnIndexMap = {};
    
    // Build the columnIndexMap by checking normalized aliases against the normalized sheet headers.
    headerMapConfig.forEach(config => {
        for (const alias of config.aliases) {
            const normalizedAlias = normalizeHeader(alias);
            if (normalizedSheetHeaderMap.hasOwnProperty(normalizedAlias)) {
                columnIndexMap[config.key] = normalizedSheetHeaderMap[normalizedAlias];
                return; // Found a match for this key, move to the next config item.
            }
        }
    });

    // Check for missing headers that are expected by the app and issue warnings.
    headerMapConfig.forEach(config => {
        if (columnIndexMap[config.key] === undefined) {
            console.warn(`Expected header "${config.key}" (or its aliases: ${config.aliases.join(', ')}) not found in sheet. Data for this column will be missing.`);
        }
    });

    const dataRows = values.slice(1);
    const idKeyIndex = columnIndexMap[idKey];

    if (idKeyIndex === undefined) {
        console.error(`CRITICAL: The unique ID key "${idKey}" was not found in the sheet headers. Cannot process data. Headers found:`, actualHeaders);
        return [];
    }

    const processedData = [];
    dataRows.forEach((row, index) => {
        const originalSheetRow = index + 2; // +1 for slice, +1 for 1-based index
        // Ensure the row is not empty and has a value for the primary ID.
        if (!row || row.length === 0 || !row[idKeyIndex]) {
            return; // Skip empty or invalid rows.
        }

        const item = { rowIndex: originalSheetRow };
        headerMapConfig.forEach(config => {
            const headerKey = config.key;
            const colIndex = columnIndexMap[headerKey];
            let value = (colIndex !== undefined) ? row[colIndex] : undefined;

            // Centralized data transformations
            if (headerKey === "LoginInfo" && value) {
                try {
                    if (/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/.test(value)) {
                        value = atob(value);
                    }
                } catch (e) {
                    console.warn(`Could not decode login info for row ${originalSheetRow}, treating as plain text.`);
                }
            } else if (['GridWidth', 'GridHeight', 'PosX', 'PosY', 'Width', 'Height', 'ShelfRows', 'ShelfCols'].includes(headerKey)) {
                const parsedValue = value ? parseInt(value, 10) : NaN;
                if (isNaN(parsedValue)) {
                    if (['Width', 'Height'].includes(headerKey)) value = 1;
                    else if (['PosX', 'PosY'].includes(headerKey)) value = 0;
                    else if (['GridWidth', 'GridHeight'].includes(headerKey)) value = 10;
                    else value = null;
                } else {
                    value = parsedValue;
                }
            }
            item[headerKey] = value === undefined ? '' : value; // Default to empty string if column is missing or value is undefined
        });
        processedData.push(item);
    });

    return processedData;
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
    ui.dom.refreshDataBtn.onclick = initializeAppData;

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

    ui.dom.inventoryTab.addEventListener('click', () => switchTab('inventory'));
    ui.dom.overviewTab.addEventListener('click', () => switchTab('overview'));
    ui.dom.employeesTab.addEventListener('click', () => switchTab('employees'));
    ui.dom.visualInventoryTab.addEventListener('click', () => switchTab('visual-inventory'));

    ui.dom.site.addEventListener('change', () => ui.handleDynamicSelectChange(ui.dom.site, document.getElementById('site-new')));
    ui.dom.location.addEventListener('change', () => ui.handleDynamicSelectChange(ui.dom.location, document.getElementById('location-new')));
    ui.dom.container.addEventListener('change', () => ui.handleDynamicSelectChange(ui.dom.container, document.getElementById('container-new')));
    ui.dom.assetType.addEventListener('change', () => ui.handleDynamicSelectChange(ui.dom.assetType, document.getElementById('asset-type-new')));
    ui.dom.assignedTo.addEventListener('change', () => ui.handleDynamicSelectChange(ui.dom.assignedTo, document.getElementById('assigned-to-new')));

    document.querySelectorAll('#filter-section input, #filter-section select').forEach(el => {
        el.addEventListener('input', applyFiltersAndSearch);
    });
    
    document.querySelectorAll('.chart-type-select').forEach(sel => sel.addEventListener('change', () => ui.renderOverviewCharts(handleChartClick)));

    ui.dom.assetForm.onsubmit = handleAssetFormSubmit;
    ui.dom.employeeForm.onsubmit = handleEmployeeFormSubmit;

    ui.dom.assetTableHead.addEventListener('click', handleSortClick);
    ui.dom.assetTableBody.addEventListener('click', handleTableClick);

    ui.dom.detailModalCloseBtn.onclick = () => ui.toggleModal(ui.dom.detailModal, false);
    ui.dom.detailModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(ui.dom.detailModal, false);
    
    // Employee Panel Listeners
    ui.dom.addEmployeeBtn.onclick = () => {
        ui.dom.employeeForm.reset();
        ui.dom.employeeModalTitle.textContent = 'Add New Employee';
        ui.toggleModal(ui.dom.employeeModal, true);
    };
    ui.dom.employeeListContainer.addEventListener('click', e => {
        const card = e.target.closest('.employee-card');
        if (card && card.dataset.id) {
            ui.openEmployeeDetailModal(card.dataset.id);
        }
    });
    ui.dom.employeeCancelBtn.onclick = () => ui.toggleModal(ui.dom.employeeModal, false);
    ui.dom.employeeModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(ui.dom.employeeModal, false);
    ui.dom.employeeDetailCloseBtn.onclick = () => ui.toggleModal(ui.dom.employeeDetailModal, false);
    ui.dom.employeeDetailModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(ui.dom.employeeDetailModal, false);


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
        await initializeAppData();
    } catch (err) {
        console.error(err);
        ui.showMessage(`Error saving asset: ${err.result.error.message}`);
    } finally {
        ui.toggleModal(ui.dom.assetModal, false);
        ui.setLoading(false);
    }
}

/**
 * Handles form submission for adding a new employee.
 * @param {Event} e - The form submission event.
 */
async function handleEmployeeFormSubmit(e) {
    e.preventDefault();
    ui.setLoading(true);
    try {
        const employeeData = {
            EmployeeID: `EMP-${Date.now()}`,
            EmployeeName: document.getElementById('employee-name').value,
            Title: document.getElementById('employee-title').value,
            Department: document.getElementById('employee-department').value,
            Email: document.getElementById('employee-email').value,
            Phone: document.getElementById('employee-phone').value,
        };

        const rowData = EMPLOYEE_HEADERS.map(header => employeeData[header] || '');
        await api.appendSheetValues(EMPLOYEES_SHEET, [rowData]);
        await initializeAppData();

    } catch (err) {
        console.error(err);
        ui.showMessage(`Error saving employee: ${err.result.error.message}`);
    } finally {
        ui.toggleModal(ui.dom.employeeModal, false);
        ui.setLoading(false);
    }
}


/**
 * Handles clicks within the asset table body (for actions, details, etc.).
 * @param {Event} e - The click event.
 */
function handleTableClick(e) {
    const target = e.target;
    if (target.classList.contains('asset-checkbox')) {
        ui.updateBulkEditButtonVisibility();
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
 * Handles clicks on the table header for sorting columns.
 * @param {Event} e - The click event.
 */
function handleSortClick(e) {
    const th = e.target.closest('th[data-column]');
    if (!th) return;

    const colName = th.dataset.column;
    if (state.sortState.column === colName) {
        state.sortState.direction = state.sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortState.column = colName;
        state.sortState.direction = 'asc';
    }
    applyFiltersAndSearch();
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
        const chart = elements[0].element.$context.chart;
        const label = chart.data.labels[elements[0].index];
        
        if (filterId === 'employee-select') {
             // Find the corresponding employee in the employee list and show their details
            const employee = state.allEmployees.find(emp => emp.EmployeeName === label);
            if(employee) {
                switchTab('employees');
                ui.openEmployeeDetailModal(employee.EmployeeID);
            }
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
