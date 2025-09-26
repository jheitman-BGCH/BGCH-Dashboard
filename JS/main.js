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
    
    const idKeyIndex = columnIndexMap[idKey];
    if (idKeyIndex === undefined && idKey) {
        console.error(`CRITICAL: ID key "${idKey}" not found in sheet headers. Processing aborted. Headers found:`, actualHeaders);
        return [];
    }

    const processedData = values.slice(1).map((row, index) => {
        if (!row || row.length === 0 || (idKey && !row[idKeyIndex])) return null;
        const item = { rowIndex: index + 2 };
        for (const config of headerMapConfig) {
            const key = config.key;
            const colIndex = columnIndexMap[key];
            item[key] = (colIndex !== undefined && row[colIndex] !== undefined) ? row[colIndex] : '';
        }
        return item;
    }).filter(Boolean);

    // --- NEW DEBUGGING START ---
    if (idKey === 'AssetID' && processedData.length > 0) {
        console.log("--- Debugging Asset Object Creation ---");
        console.log("This is the first asset object created directly from the sheet data. Please check its properties:", processedData[0]);
        console.log("---------------------------------------");
    }
    // --- NEW DEBUGGING END ---

    return processedData;
}


// --- UI LOGIC & EVENT HANDLERS ---
function renderApp() {
    const state = getState();
    const employeesById = selectors.selectEmployeesById(state.allEmployees);
    const employeesByName = selectors.selectEmployeesByName(state.allEmployees);
    const enrichedAssets = selectors.selectEnrichedAssets(state.allAssets, employeesById);
    const stateForFiltering = { ...state, employeesByName };
    const filteredAssets = selectors.selectFilteredAssets(enrichedAssets, state.filters, state.filters.searchTerm, stateForFiltering);
    const sortedAssets = selectors.selectSortedAssets(filteredAssets, state.sortState);
    const { paginatedItems, totalPages } = selectors.selectPaginatedAssets(sortedAssets, state.pagination.currentPage);
    ui.renderTable(paginatedItems, totalPages, state.pagination.currentPage, state.visibleColumns, state.sortState);
    const filteredEmployees = selectors.selectFilteredEmployees(state.allEmployees, state.employeeFilters, state.employeeFilters.searchTerm);
    const sortedEmployees = selectors.selectSortedEmployees(filteredEmployees);
    ui.renderEmployeeList(sortedEmployees);
    const chartData = selectors.selectChartData(enrichedAssets, state.allEmployees);
    ui.renderOverviewCharts(chartData, handleChartClick);
    ui.populateColumnSelector();
}

function handleSortClick(e) {
    const th = e.target.closest('th[data-column]');
    if (!th) return;
    const colName = th.dataset.column;
    const { sortState } = getState();
    let newDirection = (sortState.column === colName && sortState.direction === 'asc') ? 'desc' : 'asc';
    dispatch({ type: actionTypes.SET_SORT_STATE, payload: { column: colName, direction: newDirection } });
}

function openEditModal(assetId) {
    const asset = selectors.selectAssetsById(getState().allAssets).get(assetId);
    if (!asset) return;
    ui.dom.modalTitle.innerText = 'Edit Asset';
    ui.populateAssetForm(asset);
    ui.toggleModal(ui.dom.assetModal, true);
}

function openCloneModal(assetId) {
    const originalAsset = selectors.selectAssetsById(getState().allAssets).get(assetId);
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
        ui.populateAssetForm({});
        ['asset-type', 'assigned-to'].forEach(id => {
            const newEl = document.getElementById(`${id}-new`);
            if (newEl) newEl.classList.add('hidden');
            document.getElementById(id).value = '';
        });
        ui.toggleModal(d.assetModal, true);
    };

    d.cancelBtn.onclick = () => ui.toggleModal(d.assetModal, false);
    d.assetModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(d.assetModal, false);

    ['inventory', 'overview', 'employees', 'visual-inventory'].forEach(tabName => {
        const tab = d[`${tabName.replace('-', '')}Tab`];
        if(tab) tab.addEventListener('click', () => switchTab(tabName));
    });

    d.assetType.addEventListener('change', () => ui.handleDynamicSelectChange(d.assetType, document.getElementById('asset-type-new')));

    // Filter Listeners
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
    ['AssetType', 'Condition', 'IntendedUserType', 'AssignedTo', 'ModelNumber'].forEach(key => {
        const el = d[`filter${key}`];
        if (el) el.addEventListener('change', e => dispatch({ type: actionTypes.SET_FILTERS, payload: { [key]: e.target.value } }));
    });
    
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
        const employee = selectors.selectEmployeesById(getState().allEmployees).get(employeeId);
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
        const getSelectValue = id => (document.getElementById(id).value === '--new--' ? document.getElementById(`${id}-new`).value : document.getElementById(id).value);
        const parentId = ui.dom.modalContainer.value || ui.dom.modalRoom.value || '';

        const assetData = {
            AssetID: ui.dom.assetId.value || `ASSET-${Date.now()}`,
            rowIndex: ui.dom.rowIndex.value,
            AssetName: ui.dom.assetName.value,
            Quantity: ui.dom.quantity.value,
            ParentObjectID: parentId,
            Site: '', Location: '', Container: '', // Deprecated
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
        const rowData = headers.map(header => assetData[header] || '');

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
    const actionsBtn = target.closest('.actions-btn');
    if (actionsBtn) {
        const dropdown = actionsBtn.nextElementSibling;
        document.querySelectorAll('.actions-dropdown.show').forEach(d => d !== dropdown && d.classList.remove('show'));
        dropdown.classList.toggle('show');
        return;
    }
    const action = target.closest('a');
    if (action) {
        e.preventDefault();
        const id = action.dataset.id || action.closest('tr')?.dataset.id;
        const rowIndex = action.dataset.rowIndex || action.closest('tr')?.dataset.rowIndex;
        if (action.classList.contains('edit-btn')) openEditModal(id);
        else if (action.classList.contains('clone-btn')) openCloneModal(id);
        else if (action.classList.contains('delete-btn')) {
            if (confirm("Are you sure you want to delete this asset? This cannot be undone.")) {
                handleDeleteRow(ASSET_SHEET, rowIndex);
            }
        }
        if (action.closest('.actions-dropdown')) {
            action.closest('.actions-dropdown').classList.remove('show');
        }
        return;
    }
    if (assetId) ui.openDetailModal(assetId, openEditModal);
}

function setupBulkEditListeners() {
    ui.dom.bulkEditBtn.addEventListener('click', () => {
        const form = document.getElementById('bulk-edit-form');
        form.reset();
        document.querySelectorAll('#bulk-edit-form select, #bulk-edit-form input').forEach(el => el.disabled = true);
        document.querySelectorAll('#bulk-edit-form input[type="checkbox"]').forEach(cb => cb.disabled = false);
        ui.toggleModal(ui.dom.bulkEditModal, true);
        ui.setupModalHierarchy('bulk-site', 'bulk-room', 'bulk-container');
    });
    document.getElementById('bulk-cancel-btn').onclick = () => ui.toggleModal(ui.dom.bulkEditModal, false);
    ui.dom.bulkEditModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(ui.dom.bulkEditModal, false);
    
    document.querySelectorAll('#bulk-edit-form input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', e => {
            const fieldName = e.target.id.replace('bulk-update-', '').replace('-check', '');
            const isChecked = e.target.checked;
            if (fieldName === 'location') {
                ['bulk-site', 'bulk-room', 'bulk-container'].forEach(id => document.getElementById(id).disabled = !isChecked);
            } else {
                const inputEl = document.getElementById(e.target.dataset.target);
                if (inputEl) inputEl.disabled = !isChecked;
            }
        });
    });

    document.getElementById('bulk-edit-form').onsubmit = e => { e.preventDefault(); handleBulkUpdate(); };
}

function setupColumnSelectorListeners() {
    ui.dom.customizeColsBtn.addEventListener('click', () => {
        ui.populateColumnSelector();
        ui.toggleModal(ui.dom.columnModal, true);
    });
    ui.dom.columnCancelBtn.onclick = () => ui.toggleModal(ui.dom.columnModal, false);
    ui.dom.columnModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(ui.dom.columnModal, false);
    ui.dom.columnSaveBtn.addEventListener('click', () => {
        const visibleColumns = ["AssetName", ...[...document.querySelectorAll('#column-checkboxes input:checked')].map(cb => cb.value)];
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
        if (selectedAssetIds.length === 0) return;

        const assetsToUpdate = selectedAssetIds.map(id => selectors.selectAssetsById(getState().allAssets).get(id)).filter(Boolean);
        const updates = {};
        if (document.getElementById('bulk-update-location-check').checked) updates.ParentObjectID = document.getElementById('bulk-container').value || document.getElementById('bulk-room').value || '';
        if (document.getElementById('bulk-update-intended-user-check').checked) updates.IntendedUserType = document.getElementById('bulk-intended-user-type').value;
        if (document.getElementById('bulk-update-condition-check').checked) updates.Condition = document.getElementById('bulk-condition').value;
        if (document.getElementById('bulk-update-assigned-to-check').checked) updates.AssignedTo = document.getElementById('bulk-assigned-to').value;

        const headers = ASSET_HEADER_MAP.map(h => h.key);
        const updateRequests = assetsToUpdate.map(asset => {
            const updatedAsset = { ...asset, ...updates };
            if(updates.ParentObjectID) { updatedAsset.Site = ''; updatedAsset.Location = ''; updatedAsset.Container = ''; }
            const rowData = headers.map(header => updatedAsset[header] || '');
            return { range: `${ASSET_SHEET}!A${asset.rowIndex}`, values: [rowData] };
        });

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
    if (!sheetId || !rowIndex) return;
    ui.setLoading(true);
    try {
        await api.batchUpdateSheet({ requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: parseInt(rowIndex) - 1, endIndex: parseInt(rowIndex) } } }] });
        window.dispatchEvent(new CustomEvent('datachanged'));
    } catch (err) {
        console.error(`Error deleting from ${sheetName}:`, err);
        ui.showMessage(`Error deleting row: ${err.result?.error?.message || err.message}`);
    } finally {
        ui.setLoading(false);
    }
}

function switchTab(tabName) {
    ['inventory', 'overview', 'employees', 'visual-inventory'].forEach(name => {
        const panel = document.getElementById(`${name}-panel`);
        const button = document.getElementById(`${name}-tab`);
        const isActive = name === tabName;
        panel.classList.toggle('hidden', !isActive);
        button.classList.toggle('active', isActive);
    });

    if (tabName === 'overview') renderApp();
    if (tabName === 'visual-inventory') initVisualInventory();
}

function handleChartClick(event, elements, filterId) {
    if (!elements || elements.length === 0) return;
    const chart = elements[0].element.$context.chart;
    const label = chart.data.labels[elements[0].index];
    
    const newFilters = { searchTerm: '', site: '', room: '', container: '', AssetType: '', Condition: '', IntendedUserType: '', AssignedTo: '', ModelNumber: '' };
    const filterKeyMap = { 'filter-site': 'site', 'filter-condition': 'Condition', 'filter-asset-type': 'AssetType', 'filter-assigned-to': 'AssignedTo' };
    const stateKey = filterKeyMap[filterId];
    
    if (stateKey) {
        const value = (stateKey === 'site') ? getState().allSites.find(s => s.SiteName === label)?.SiteID : label;
        if (value) newFilters[stateKey] = value;
    }
    
    dispatch({ type: actionTypes.SET_FILTERS, payload: newFilters });

    const targetFilterEl = document.getElementById(filterId);
    if(targetFilterEl) {
        targetFilterEl.value = newFilters[stateKey] || label;
        targetFilterEl.dispatchEvent(new Event('change'));
    }
    switchTab('inventory');
}

