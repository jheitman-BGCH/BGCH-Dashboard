// JS/main.js
import { CLIENT_ID, SCOPES, ASSET_SHEET, EMPLOYEES_SHEET, SITES_SHEET, ROOMS_SHEET, CONTAINERS_SHEET, SPATIAL_LAYOUT_SHEET, ASSET_HEADER_MAP, EMPLOYEE_HEADER_MAP, SITES_HEADER_MAP, ROOMS_HEADER_MAP, CONTAINERS_HEADER_MAP, SPATIAL_LAYOUT_HEADER_MAP } from './state.js';
import { getState, dispatch, actionTypes, subscribe } from './store.js';
import * as api from './sheetsService.js';
import * as ui from './ui.js';
import { initVisualInventory } from './visual_inventory_logic.js';
import * as selectors from './selectors.js';

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    ui.initUI();
    loadVisibleColumns();
    setupEventListeners();
    loadGoogleApiScripts();
    // Subscribe the main render function to the store.
    // Now, any state change will automatically trigger a UI update.
    subscribe(renderApp);
});

function loadGoogleApiScripts() {
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.async = true;
    gapiScript.defer = true;
    gapiScript.onload = () => gapi.load('client', () => {
        dispatch({ type: actionTypes.SET_GAPI_STATUS, payload: true });
        checkAndInitialize();
    });
    document.body.appendChild(gapiScript);

    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.async = true;
    gisScript.defer = true;
    gisScript.onload = () => {
        dispatch({ type: actionTypes.SET_GIS_STATUS, payload: true });
        checkAndInitialize();
    };
    document.body.appendChild(gisScript);
}

function loadVisibleColumns() {
    try {
        const savedCols = localStorage.getItem('visibleColumns');
        const visibleColumns = savedCols ? JSON.parse(savedCols) : ["AssetName", "AssetType", "IDCode", "AssignedTo", "Condition"];
        dispatch({ type: actionTypes.SET_VISIBLE_COLUMNS, payload: visibleColumns });
    } catch (e) {
        const defaultColumns = ["AssetName", "AssetType", "IDCode", "AssignedTo", "Condition"];
        dispatch({ type: actionTypes.SET_VISIBLE_COLUMNS, payload: defaultColumns });
    }
}

function checkAndInitialize() {
    const { gapiInited, gisInited } = getState();
    if (gapiInited && gisInited) {
        initializeGoogleClients();
    }
}

async function initializeGoogleClients() {
    try {
        await gapi.client.init({ discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'] });
        const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse) => {
                if (tokenResponse?.access_token) {
                    handleSigninStatusChange(true);
                } else {
                    console.warn("Silent auth failed or token expired.", tokenResponse?.error);
                    handleSigninStatusChange(false);
                }
            },
        });
        dispatch({ type: actionTypes.SET_TOKEN_CLIENT, payload: tokenClient });
        tokenClient.requestAccessToken({ prompt: 'none' });
    } catch (error) {
        console.error("Error initializing Google clients:", error);
        ui.showMessage("Failed to initialize Google services. Check Client ID & API permissions.");
    }
}

// --- AUTHENTICATION ---
function handleAuthClick() {
    const { tokenClient } = getState();
    if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        ui.showMessage("Authentication service is not ready. Please refresh.", "error");
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken('');
            handleSigninStatusChange(false);
        });
    }
}

function handleSigninStatusChange(isSignedIn) {
    ui.updateSigninStatus(isSignedIn);
    if (isSignedIn) {
        initializeAppData();
    }
}

// --- DATA FETCHING AND PROCESSING ---
async function initializeAppData() {
    ui.setLoading(true);
    try {
        const ranges = [
            `${ASSET_SHEET}!A:Z`, `${EMPLOYEES_SHEET}!A:Z`, `${SITES_SHEET}!A:Z`,
            `${ROOMS_SHEET}!A:Z`, `${CONTAINERS_SHEET}!A:Z`, `${SPATIAL_LAYOUT_SHEET}!A:Z`
        ];
        const { meta, data } = await api.fetchSheetMetadataAndData(ranges);
        
        const sheetIds = meta.sheets.reduce((acc, sheet) => {
            acc[sheet.properties.title] = sheet.properties.sheetId;
            return acc;
        }, {});
        
        const [assetValues, employeeValues, siteValues, roomValues, containerValues, layoutValues] = data.map(range => range.values || []);

        const appData = {
            allAssets: processSheetData(assetValues, ASSET_HEADER_MAP, 'AssetID'),
            allEmployees: processSheetData(employeeValues, EMPLOYEE_HEADER_MAP, 'EmployeeID'),
            allSites: processSheetData(siteValues, SITES_HEADER_MAP, 'SiteID'),
            allRooms: processSheetData(roomValues, ROOMS_HEADER_MAP, 'RoomID'),
            allContainers: processSheetData(containerValues, CONTAINERS_HEADER_MAP, 'ContainerID'),
            spatialLayoutData: processSheetData(layoutValues, SPATIAL_LAYOUT_HEADER_MAP, 'InstanceID'),
            sheetIds: sheetIds
        };

        dispatch({ type: actionTypes.SET_APP_DATA, payload: appData });
        
        // Initial population of dropdowns after data is fetched
        ui.populateFilterDropdowns();
        ui.populateEmployeeFilterDropdowns();
        ui.populateModalDropdowns();
        ui.setupModalHierarchy();

        if (document.getElementById('visual-inventory-tab').classList.contains('active')) {
            initVisualInventory();
        }
    } catch (err) {
        console.error("Error during data load:", err);
        const errorMessage = err.result?.error?.message || err.message || 'An unknown error occurred';
        if (errorMessage.includes("Unable to parse range")) {
            ui.showMessage(`Error: A required sheet is missing. Ensure all required sheets exist.`);
        } else {
            ui.showMessage(`Error loading data: ${errorMessage}`);
        }
    } finally {
        ui.setLoading(false);
    }
}

function processSheetData(values, headerMapConfig, idKey) {
    if (!values || values.length < 1) return [];

    const actualHeaders = values[0].map(h => String(h || '').trim());
    const normalize = (header) => header.toLowerCase().replace(/\s+/g, '');

    const headerIndexMap = actualHeaders.reduce((acc, header, index) => {
        const normalized = normalize(header);
        if (normalized) acc[normalized] = index;
        return acc;
    }, {});

    const columnIndexMap = {};
    for (const config of headerMapConfig) {
        for (const alias of config.aliases) {
            const normalizedAlias = normalize(alias);
            if (headerIndexMap.hasOwnProperty(normalizedAlias)) {
                columnIndexMap[config.key] = headerIndexMap[normalizedAlias];
                break;
            }
        }
    }
    
    // --- DEBUGGING START ---
    // This will only log for the 'Asset' sheet to avoid clutter.
    if (idKey === 'AssetID') {
        console.log("--- Debugging processSheetData for Assets ---");
        console.log("1. Headers found in sheet:", actualHeaders);
        console.log("2. Column mapping result (what the app uses):", columnIndexMap);
        if (columnIndexMap.ParentObjectID === undefined) {
            console.error("CRITICAL: 'ParentObjectID' could not be found in the sheet headers. Please check that the column name in your sheet is one of the following (case-insensitive): ParentObjectID, Parent Object ID, ParentID");
        }
        console.log("-------------------------------------------");
    }
    // --- DEBUGGING END ---

    const idKeyIndex = columnIndexMap[idKey];
    if (idKeyIndex === undefined && idKey) { // idKey might be null for sheets without one
        console.error(`CRITICAL: ID key "${idKey}" not found in sheet headers. Processing aborted. Headers found:`, actualHeaders);
        return [];
    }

    return values.slice(1).map((row, index) => {
        if (!row || row.length === 0 || (idKey && !row[idKeyIndex])) return null;
        const item = { rowIndex: index + 2 }; // rowIndex is 1-based for sheets, and we slice(1), so it's index + 2
        for (const config of headerMapConfig) {
            const key = config.key;
            const colIndex = columnIndexMap[key];
            item[key] = (colIndex !== undefined && row[colIndex] !== undefined) ? row[colIndex] : '';
        }
        return item;
    }).filter(Boolean);
}


// --- UI LOGIC & EVENT HANDLERS ---
function renderApp() {
    // This function is now the single point of entry for all UI updates.
    // It's called by the subscription whenever the state changes.
    const state = getState();

    // --- Compute derived data using memoized selectors ---
    const employeesById = selectors.selectEmployeesById(state.allEmployees);
    const employeesByName = selectors.selectEmployeesByName(state.allEmployees);
    const enrichedAssets = selectors.selectEnrichedAssets(state.allAssets, employeesById);
    
    // Add employeesByName to state object for filterService
    const stateForFiltering = { ...state, employeesByName };

    // Assets Tab
    const filteredAssets = selectors.selectFilteredAssets(enrichedAssets, state.filters, state.filters.searchTerm, stateForFiltering);
    const sortedAssets = selectors.selectSortedAssets(filteredAssets, state.sortState);
    const { paginatedItems, totalPages } = selectors.selectPaginatedAssets(sortedAssets, state.pagination.currentPage);
    ui.renderTable(paginatedItems, totalPages, state.pagination.currentPage, state.visibleColumns, state.sortState);

    // Employees Tab
    const filteredEmployees = selectors.selectFilteredEmployees(state.allEmployees, state.employeeFilters, state.employeeFilters.searchTerm);
    const sortedEmployees = selectors.selectSortedEmployees(filteredEmployees);
    ui.renderEmployeeList(sortedEmployees);

    // Overview Tab
    const chartData = selectors.selectChartData(enrichedAssets, state.allEmployees);
    ui.renderOverviewCharts(chartData, handleChartClick);
    
    // This doesn't need to run on every render, but it's harmless.
    ui.populateColumnSelector();
}

function handleSortClick(e) {
    const th = e.target.closest('th[data-column]');
    if (!th) return;

    const colName = th.dataset.column;
    const { sortState } = getState();

    let newDirection;
    if (sortState.column === colName) {
        newDirection = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        newDirection = 'asc';
    }
    
    dispatch({ type: actionTypes.SET_SORT_STATE, payload: { column: colName, direction: newDirection } });
}

function openEditModal(assetId) {
    const assetsById = selectors.selectAssetsById(getState().allAssets);
    const asset = assetsById.get(assetId);
    if (!asset) return;
    ui.dom.modalTitle.innerText = 'Edit Asset';
    ui.populateAssetForm(asset);
    ui.toggleModal(ui.dom.assetModal, true);
}

function openCloneModal(assetId) {
    const assetsById = selectors.selectAssetsById(getState().allAssets);
    const originalAsset = assetsById.get(assetId);
    if (!originalAsset) return;
    const clonedAsset = { ...originalAsset, AssetID: '', rowIndex: '', IDCode: '', SerialNumber: '' };
    ui.dom.modalTitle.innerText = 'Clone Asset';
    ui.populateAssetForm(clonedAsset);
    ui.toggleModal(ui.dom.assetModal, true);
}

function setupEventListeners() {
    const d = ui.dom;
    d.authorize_button.onclick = handleAuthClick;
    d.signout_button.onclick = handleSignoutClick;
    d.refreshDataBtn.onclick = initializeAppData;

    window.addEventListener('datachanged', initializeAppData);

    d.addAssetBtn.onclick = () => {
        d.assetForm.reset();
        d.modalTitle.innerText = 'Add New Asset';
        d.assetId.value = '';
        d.rowIndex.value = '';
        ui.populateAssetForm({}); // Populate with empty object to reset hierarchical dropdowns
        ['asset-type', 'assigned-to'].forEach(id => {
            const newEl = document.getElementById(`${id}-new`);
            if (newEl) {
                newEl.classList.add('hidden');
                newEl.value = '';
            }
            document.getElementById(id).value = '';
        });
        ui.toggleModal(d.assetModal, true);
    };

    d.cancelBtn.onclick = () => ui.toggleModal(d.assetModal, false);
    d.assetModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(d.assetModal, false);

    d.inventoryTab.addEventListener('click', () => switchTab('inventory'));
    d.overviewTab.addEventListener('click', () => switchTab('overview'));
    d.employeesTab.addEventListener('click', () => switchTab('employees'));
    d.visualInventoryTab.addEventListener('click', () => switchTab('visual-inventory'));

    d.assetType.addEventListener('change', () => ui.handleDynamicSelectChange(d.assetType, document.getElementById('asset-type-new')));

    // --- Filter Event Listeners ---
    // Asset filters now dispatch actions to update state
    d.filterSearch.addEventListener('input', e => dispatch({ type: actionTypes.SET_FILTERS, payload: { searchTerm: e.target.value } }));
    d.filterSite.addEventListener('change', e => {
        dispatch({ type: actionTypes.SET_FILTERS, payload: { site: e.target.value, room: '', container: '' } });
        ui.populateChainedFilters();
    });
    d.filterRoom.addEventListener('change', e => {
        dispatch({ type: actionTypes.SET_FILTERS, payload: { room: e.target.value, container: '' } });
        ui.populateChainedFilters();
    });
    d.filterContainer.addEventListener('change', e => dispatch({ type: actionTypes.SET_FILTERS, payload: { container: e.target.value } }));
    
    d.filterAssetType.addEventListener('change', e => dispatch({ type: actionTypes.SET_FILTERS, payload: { AssetType: e.target.value } }));
    d.filterCondition.addEventListener('change', e => dispatch({ type: actionTypes.SET_FILTERS, payload: { Condition: e.target.value } }));
    d.filterIntendedUserType.addEventListener('change', e => dispatch({ type: actionTypes.SET_FILTERS, payload: { IntendedUserType: e.target.value } }));
    d.filterAssignedTo.addEventListener('change', e => dispatch({ type: actionTypes.SET_FILTERS, payload: { AssignedTo: e.target.value } }));
    d.filterModelNumber.addEventListener('change', e => dispatch({ type: actionTypes.SET_FILTERS, payload: { ModelNumber: e.target.value } }));
    
    // Employee filters dispatch actions
    d.employeeSearch.addEventListener('input', e => dispatch({ type: actionTypes.SET_EMPLOYEE_FILTERS, payload: { searchTerm: e.target.value } }));
    d.employeeDepartmentFilter.addEventListener('change', e => dispatch({ type: actionTypes.SET_EMPLOYEE_FILTERS, payload: { Department: e.target.value } }));

    document.querySelectorAll('.chart-type-select').forEach(sel => sel.addEventListener('change', renderApp));

    d.assetForm.onsubmit = handleAssetFormSubmit;
    d.employeeForm.onsubmit = handleEmployeeFormSubmit;

    d.assetTableHead.addEventListener('click', handleSortClick);
    d.assetTableBody.addEventListener('click', handleTableClick);

    d.detailModalCloseBtn.onclick = () => ui.toggleModal(d.detailModal, false);
    d.detailModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(d.detailModal, false);
    
    // Employee Panel
    d.addEmployeeBtn.onclick = () => {
        d.employeeForm.reset();
        d.employeeModalTitle.textContent = 'Add New Employee';
        d.employeeId.value = '';
        d.employeeRowIndex.value = '';
        ui.toggleModal(d.employeeModal, true);
    };

    d.employeeListContainer.addEventListener('click', e => {
        const card = e.target.closest('.employee-card');
        if (card?.dataset.id) ui.openEmployeeDetailModal(card.dataset.id);
    });
    d.employeeCancelBtn.onclick = () => ui.toggleModal(d.employeeModal, false);
    d.employeeModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(d.employeeModal, false);
    d.employeeDetailCloseBtn.onclick = () => ui.toggleModal(d.employeeDetailModal, false);
    d.employeeDetailModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(d.employeeDetailModal, false);
    
    d.employeeDetailEditBtn.addEventListener('click', e => {
        const employeeId = e.target.dataset.employeeId;
        const employeesById = selectors.selectEmployeesById(getState().allEmployees);
        const employee = employeesById.get(employeeId);
        if (employee) {
            ui.toggleModal(d.employeeDetailModal, false);
            ui.populateEmployeeForm(employee);
            ui.toggleModal(d.employeeModal, true);
        }
    });

    d.employeeDetailAssets.addEventListener('click', e => {
        const assetItem = e.target.closest('.employee-asset-item');
        if (assetItem?.dataset.assetId) {
            ui.toggleModal(d.employeeDetailModal, false);
            ui.openDetailModal(assetItem.dataset.assetId, openEditModal);
        }
    });

    window.addEventListener('click', e => {
        if (!e.target.closest('.actions-menu')) {
            document.querySelectorAll('.actions-dropdown.show').forEach(d => d.classList.remove('show'));
        }
    });

    setupBulkEditListeners();
    setupColumnSelectorListeners();
}

async function handleAssetFormSubmit(e) {
    e.preventDefault();
    ui.setLoading(true);
    try {
        const getSelectValue = (id) => {
            const select = document.getElementById(id);
            const newInp = document.getElementById(`${id}-new`);
            return select.value === '--new--' && newInp ? newInp.value : select.value;
        };

        const parentId = ui.dom.modalContainer.value || ui.dom.modalRoom.value || '';

        const assetData = {
            AssetID: ui.dom.assetId.value || `ASSET-${Date.now()}`,
            rowIndex: ui.dom.rowIndex.value,
            AssetName: ui.dom.assetName.value,
            Quantity: ui.dom.quantity.value,
            ParentObjectID: parentId, // New hierarchical parent
            Site: '', // Deprecated - clear it
            Location: '', // Deprecated - clear it
            Container: '', // Deprecated - clear it
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
            LoginInfo: ui.dom.loginInfo.value ? btoa(ui.dom.loginInfo.value) : '',
            Notes: ui.dom.notes.value,
        };

        const isUpdate = !!assetData.rowIndex;
        const headers = ASSET_HEADER_MAP.map(h => h.key);
        const rowData = headers.map(header => assetData[header] !== undefined ? assetData[header] : '');


        if (isUpdate) {
            await api.updateSheetValues(`${ASSET_SHEET}!A${assetData.rowIndex}`, [rowData]);
        } else {
            await api.appendSheetValues(ASSET_SHEET, [rowData]);
        }

        window.dispatchEvent(new CustomEvent('datachanged'));
    } catch (err) {
        console.error("Error saving asset:", err);
        ui.showMessage(`Error saving asset: ${err.result?.error?.message || err.message}`);
    } finally {
        ui.toggleModal(ui.dom.assetModal, false);
        ui.setLoading(false);
    }
}


async function handleEmployeeFormSubmit(e) {
    e.preventDefault();
    ui.setLoading(true);
    try {
        const employeeData = {
            EmployeeID: ui.dom.employeeId.value || `EMP-${Date.now()}`,
            rowIndex: ui.dom.employeeRowIndex.value,
            EmployeeName: document.getElementById('employee-name').value,
            Title: document.getElementById('employee-title').value,
            Department: document.getElementById('employee-department').value,
            Email: document.getElementById('employee-email').value,
            Phone: document.getElementById('employee-phone').value,
        };

        const isUpdate = !!employeeData.rowIndex;
        const headers = EMPLOYEE_HEADER_MAP.map(h => h.key);
        const rowData = headers.map(header => employeeData[header] || '');


        if (isUpdate) {
            await api.updateSheetValues(`${EMPLOYEES_SHEET}!A${employeeData.rowIndex}`, [rowData]);
        } else {
            await api.appendSheetValues(EMPLOYEES_SHEET, [rowData]);
        }
        window.dispatchEvent(new CustomEvent('datachanged'));
    } catch (err) {
        console.error("Error saving employee:", err);
        ui.showMessage(`Error saving employee: ${err.result?.error?.message || err.message}`);
    } finally {
        ui.toggleModal(ui.dom.employeeModal, false);
        ui.setLoading(false);
    }
}

function handleTableClick(e) {
    const target = e.target;
    const assetId = target.closest('tr')?.dataset.id;
    if (target.classList.contains('asset-checkbox')) {
        ui.updateBulkEditButtonVisibility();
        return;
    }
    if (target.closest('.actions-btn')) {
        const dropdown = target.closest('.actions-menu').querySelector('.actions-dropdown');
        document.querySelectorAll('.actions-dropdown.show').forEach(d => d !== dropdown && d.classList.remove('show'));
        dropdown.classList.toggle('show');
        return;
    }
    const action = target.closest('a');
    if (action) {
        e.preventDefault();
        if (action.classList.contains('edit-btn')) openEditModal(action.dataset.id);
        else if (action.classList.contains('clone-btn')) openCloneModal(action.dataset.id);
        else if (action.classList.contains('delete-btn')) {
            if (confirm("Are you sure you want to delete this asset? This cannot be undone.")) {
                handleDeleteRow(ASSET_SHEET, action.dataset.rowIndex);
            }
        }
        action.closest('.actions-dropdown').classList.remove('show');
        return;
    }
    if (assetId) ui.openDetailModal(assetId, openEditModal);
}

function setupBulkEditListeners() {
    ui.dom.bulkEditBtn.addEventListener('click', () => {
        const form = document.getElementById('bulk-edit-form');
        form.reset();
        document.querySelectorAll('#bulk-edit-form select').forEach(el => el.disabled = true);
        ui.toggleModal(ui.dom.bulkEditModal, true);
        ui.setupModalHierarchy('bulk-site', 'bulk-room', 'bulk-container'); // Pass IDs for bulk edit modal
        // Manually re-disable after setup
        ui.dom.bulkSite.disabled = true;
        ui.dom.bulkRoom.disabled = true;
        ui.dom.bulkContainer.disabled = true;
    });
    document.getElementById('bulk-cancel-btn').onclick = () => ui.toggleModal(ui.dom.bulkEditModal, false);
    ui.dom.bulkEditModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(ui.dom.bulkEditModal, false);
    
    document.querySelectorAll('#bulk-edit-form input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', e => {
            const fieldName = e.target.id.replace('bulk-update-', '').replace('-check', '');
            const isChecked = e.target.checked;

            if (fieldName === 'location') {
                ui.dom.bulkSite.disabled = !isChecked;
                // Only enable sub-dropdowns if their parent is selected AND the box is checked
                ui.dom.bulkRoom.disabled = !isChecked || !ui.dom.bulkSite.value;
                ui.dom.bulkContainer.disabled = !isChecked || !ui.dom.bulkRoom.value;
            } else {
                const inputEl = document.getElementById(`bulk-${fieldName.replace(/-(.)/g, (m, g) => g.toUpperCase())}`);
                if (inputEl) inputEl.disabled = !isChecked;
            }
        });
    });

    document.getElementById('bulk-edit-form').onsubmit = e => {
        e.preventDefault();
        handleBulkUpdate();
    };
}

function setupColumnSelectorListeners() {
    ui.dom.customizeColsBtn.addEventListener('click', () => {
        ui.populateColumnSelector();
        ui.toggleModal(ui.dom.columnModal, true);
    });
    ui.dom.columnCancelBtn.onclick = () => ui.toggleModal(ui.dom.columnModal, false);
    ui.dom.columnModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(ui.dom.columnModal, false);
    ui.dom.columnSaveBtn.addEventListener('click', () => {
        const selectedCols = [...document.querySelectorAll('#column-checkboxes input:checked')].map(cb => cb.value);
        // "AssetName" is always visible and not in the checkbox list, so we prepend it.
        const visibleColumns = ["AssetName", ...selectedCols]; 
        dispatch({ type: actionTypes.SET_VISIBLE_COLUMNS, payload: visibleColumns });
        localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
        ui.renderFilters();
        ui.toggleModal(ui.dom.columnModal, false);
    });
}

async function handleBulkUpdate() {
    ui.setLoading(true);
    try {
        const selectedAssetIds = [...document.querySelectorAll('.asset-checkbox:checked')].map(cb => cb.dataset.id);
        if (selectedAssetIds.length === 0) {
            ui.toggleModal(ui.dom.bulkEditModal, false);
            ui.setLoading(false);
            return;
        }

        const assetsById = selectors.selectAssetsById(getState().allAssets);
        const assetsToUpdate = selectedAssetIds.map(id => assetsById.get(id)).filter(Boolean);
        
        const parentId = ui.dom.bulkContainer.value || ui.dom.bulkRoom.value || '';
        
        const isLocationChecked = document.getElementById('bulk-update-location-check').checked;
        const isUserTypeChecked = document.getElementById('bulk-update-intended-user-check').checked;
        const isConditionChecked = document.getElementById('bulk-update-condition-check').checked;
        const isAssignedToChecked = document.getElementById('bulk-update-assigned-to-check').checked;

        const updateRequests = [];

        for (const asset of assetsToUpdate) {
            const updatedAsset = { ...asset };

            if (isLocationChecked && parentId) {
                updatedAsset.ParentObjectID = parentId;
                updatedAsset.Site = '';
                updatedAsset.Location = '';
                updatedAsset.Container = '';
            }
            if (isUserTypeChecked) {
                updatedAsset.IntendedUserType = ui.dom.bulkIntendedUserType.value;
            }
            if (isConditionChecked) {
                updatedAsset.Condition = ui.dom.bulkCondition.value;
            }
            if (isAssignedToChecked) {
                updatedAsset.AssignedTo = ui.dom.bulkAssignedTo.value;
            }

            const headers = ASSET_HEADER_MAP.map(h => h.key);
            const rowData = headers.map(header => updatedAsset[header] !== undefined ? updatedAsset[header] : '');
            
            updateRequests.push({
                range: `${ASSET_SHEET}!A${asset.rowIndex}`,
                values: [rowData]
            });
        }

        if (updateRequests.length > 0) {
            await api.batchUpdateSheetValues(updateRequests);
            window.dispatchEvent(new CustomEvent('datachanged'));
        }
    } catch (err) {
        console.error("Error during bulk update:", err);
        ui.showMessage(`Bulk update failed: ${err.result?.error?.message || err.message}`);
    } finally {
        ui.toggleModal(ui.dom.bulkEditModal, false);
        ui.setLoading(false);
    }
}


async function handleDeleteRow(sheetName, rowIndex) {
    const { sheetIds } = getState();
    const sheetId = sheetIds[sheetName];
    if (!sheetId || !rowIndex) {
        ui.showMessage(`Error: Could not find sheet ID or row index for deletion.`);
        return;
    }
    ui.setLoading(true);
    try {
        await api.batchUpdateSheet({
            requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: parseInt(rowIndex) - 1, endIndex: parseInt(rowIndex) } } }]
        });
        window.dispatchEvent(new CustomEvent('datachanged'));
    } catch (err) {
        console.error(`Error deleting from ${sheetName}:`, err);
        ui.showMessage(`Error deleting row: ${err.result?.error?.message || err.message}`);
    } finally {
        ui.setLoading(false);
    }
}

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

    if (tabName === 'overview') {
        renderApp(); 
    }
    if (tabName === 'visual-inventory') {
        initVisualInventory();
    }
}

function handleChartClick(event, elements, filterId) {
    if (!elements || elements.length === 0) return;
    const chart = elements[0].element.$context.chart;
    const label = chart.data.labels[elements[0].index];
    
    // Dispatch an action to set the filter and reset others
    const newFilters = {
        searchTerm: '', site: '', room: '', container: '',
        AssetType: '', Condition: '', IntendedUserType: '', AssignedTo: '', ModelNumber: '',
    };
    
    const { allSites } = getState();
    
    // Map filterId to the correct key in the state
    const filterKeyMap = {
        'filter-site': 'site',
        'filter-condition': 'Condition',
        'filter-asset-type': 'AssetType',
        'filter-assigned-to': 'AssignedTo',
    };
    const stateKey = filterKeyMap[filterId];
    if (stateKey) {
        if (stateKey === 'site') {
            const siteObj = allSites.find(s => s.SiteName === label);
            if (siteObj) newFilters[stateKey] = siteObj.SiteID;
        } else {
            newFilters[stateKey] = label;
        }
    }
    
    dispatch({ type: actionTypes.SET_FILTERS, payload: newFilters });

    // Update the UI dropdown to reflect the change
    const targetFilterEl = document.getElementById(filterId);
    if(targetFilterEl) {
        targetFilterEl.value = newFilters[stateKey] || label;
        // Manually trigger change to update dependent dropdowns
        targetFilterEl.dispatchEvent(new Event('change'));
    }

    switchTab('inventory');
}

