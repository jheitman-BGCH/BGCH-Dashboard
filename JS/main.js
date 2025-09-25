// JS/main.js
import { state, CLIENT_ID, SCOPES, ASSET_SHEET, EMPLOYEES_SHEET, ROOMS_SHEET, SPATIAL_LAYOUT_SHEET, ASSET_HEADERS, EMPLOYEE_HEADERS, ROOMS_HEADERS, SPATIAL_LAYOUT_HEADERS, ASSET_HEADER_MAP, EMPLOYEE_HEADER_MAP, ROOMS_HEADER_MAP, SPATIAL_LAYOUT_HEADER_MAP, SPREADSHEET_ID } from './state.js';
import * as api from './sheetsService.js';
import * as ui from './ui.js';
import { initVisualInventory } from './visual_inventory_logic.js';

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    ui.initUI();
    loadVisibleColumns();
    setupEventListeners();
    loadGoogleApiScripts();
});

function loadGoogleApiScripts() {
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.async = true;
    gapiScript.defer = true;
    gapiScript.onload = () => gapi.load('client', () => {
        state.gapiInited = true;
        checkAndInitialize();
    });
    document.body.appendChild(gapiScript);

    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.async = true;
    gisScript.defer = true;
    gisScript.onload = () => {
        state.gisInited = true;
        checkAndInitialize();
    };
    document.body.appendChild(gisScript);
}

function loadVisibleColumns() {
    try {
        const savedCols = localStorage.getItem('visibleColumns');
        state.visibleColumns = savedCols ? JSON.parse(savedCols) : ["AssetName", "AssetType", "IDCode", "AssignedTo", "Condition"];
    } catch (e) {
        state.visibleColumns = ["AssetName", "AssetType", "IDCode", "AssignedTo", "Condition"];
    }
}

function checkAndInitialize() {
    if (state.gapiInited && state.gisInited) {
        initializeGoogleClients();
    }
}

async function initializeGoogleClients() {
    try {
        await gapi.client.init({ discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'] });
        state.tokenClient = google.accounts.oauth2.initTokenClient({
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
        state.tokenClient.requestAccessToken({ prompt: 'none' });
    } catch (error) {
        console.error("Error initializing Google clients:", error);
        ui.showMessage("Failed to initialize Google services. Check Client ID & API permissions.");
    }
}

// --- AUTHENTICATION ---
function handleAuthClick() {
    if (state.tokenClient) {
        state.tokenClient.requestAccessToken({ prompt: 'consent' });
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
        const ranges = [`${ASSET_SHEET}!A:Z`, `${ROOMS_SHEET}!A:Z`, `${SPATIAL_LAYOUT_SHEET}!A:Z`, `${EMPLOYEES_SHEET}!A:Z`];
        const { meta, data } = await api.fetchSheetMetadataAndData(ranges);
        
        state.sheetIds = meta.sheets.reduce((acc, sheet) => {
            acc[sheet.properties.title] = sheet.properties.sheetId;
            return acc;
        }, {});
        
        const [assetValues, roomValues, layoutValues, employeeValues] = data.map(range => range.values || []);

        state.allAssets = processSheetData(assetValues, ASSET_HEADER_MAP, 'AssetID');
        state.allRooms = processSheetData(roomValues, ROOMS_HEADER_MAP, 'RoomID');
        state.spatialLayoutData = processSheetData(layoutValues, SPATIAL_LAYOUT_HEADER_MAP, 'InstanceID');
        state.allEmployees = processSheetData(employeeValues, EMPLOYEE_HEADER_MAP, 'EmployeeID');
        
        // Populate UI
        applyFiltersAndSearch();
        applyEmployeeFiltersAndSearch();
        ui.populateFilterDropdowns();
        ui.populateEmployeeFilterDropdowns();
        ui.populateModalDropdowns();
        ui.renderOverviewCharts(handleChartClick);
        ui.populateColumnSelector();

        if (document.getElementById('visual-inventory-tab').classList.contains('active')) {
            initVisualInventory();
        }
    } catch (err) {
        console.error("Error during data load:", err);
        const errorMessage = err.result?.error?.message || err.message || 'An unknown error occurred';
        if (errorMessage.includes("Unable to parse range")) {
            ui.showMessage(`Error: A required sheet is missing. Ensure 'Asset', 'Rooms', 'Spatial Layout', and 'Employees' sheets exist.`);
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
    if (idKeyIndex === undefined) {
        console.error(`CRITICAL: ID key "${idKey}" not found in sheet headers. Processing aborted. Headers found:`, actualHeaders);
        return [];
    }

    return values.slice(1).map((row, index) => {
        if (!row || row.length === 0 || !row[idKeyIndex]) return null;
        const item = { rowIndex: index + 2 };
        for (const config of headerMapConfig) {
            const key = config.key;
            const colIndex = columnIndexMap[key];
            item[key] = (colIndex !== undefined && row[colIndex] !== undefined) ? row[colIndex] : '';
        }
        return item;
    }).filter(Boolean);
}

// --- UI LOGIC & EVENT HANDLERS ---
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

    const filteredAssets = state.allAssets.filter(asset => {
        const matchesSearch = searchTerm ? Object.values(asset).some(val => String(val).toLowerCase().includes(searchTerm)) : true;
        const matchesFilters = Object.entries(filters).every(([key, value]) => {
            if (!value) return true;
            if (key === 'AssignedTo') {
                const employee = state.allEmployees.find(e => e.EmployeeName === value);
                return employee ? asset[key] === employee.EmployeeID : false;
            }
            return asset[key] === value;
        });
        return matchesSearch && matchesFilters;
    });

    ui.renderTable(filteredAssets);
}

function applyEmployeeFiltersAndSearch() {
    const searchTerm = ui.dom.employeeSearch.value.toLowerCase();
    const department = ui.dom.employeeDepartmentFilter.value;

    const filteredEmployees = state.allEmployees.filter(emp => {
        const matchesSearch = searchTerm ? emp.EmployeeName.toLowerCase().includes(searchTerm) : true;
        const matchesDept = department ? emp.Department === department : true;
        return matchesSearch && matchesDept;
    });

    ui.renderEmployeeList(filteredEmployees);
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
    const clonedAsset = { ...originalAsset, AssetID: '', rowIndex: '', IDCode: '', SerialNumber: '' };
    ui.dom.modalTitle.innerText = 'Clone Asset';
    ui.populateAssetForm(clonedAsset);
    ui.toggleModal(ui.dom.assetModal, true);
}

function setupEventListeners() {
    const d = ui.dom;
    d.authorizeButton.onclick = handleAuthClick;
    d.signoutButton.onclick = handleSignoutClick;
    d.refreshDataBtn.onclick = initializeAppData;

    window.addEventListener('datachanged', initializeAppData);

    d.addAssetBtn.onclick = () => {
        d.assetForm.reset();
        d.modalTitle.innerText = 'Add New Asset';
        d.assetId.value = '';
        d.rowIndex.value = '';
        ['site', 'location', 'container', 'asset-type', 'assigned-to'].forEach(id => {
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

    d.site.addEventListener('change', () => ui.handleDynamicSelectChange(d.site, document.getElementById('site-new')));
    d.location.addEventListener('change', () => ui.handleDynamicSelectChange(d.location, document.getElementById('location-new')));
    d.container.addEventListener('change', () => ui.handleDynamicSelectChange(d.container, document.getElementById('container-new')));
    d.assetType.addEventListener('change', () => ui.handleDynamicSelectChange(d.assetType, document.getElementById('asset-type-new')));

    document.querySelectorAll('#filter-section input, #filter-section select').forEach(el => {
        el.addEventListener('input', applyFiltersAndSearch);
    });
    
    document.querySelectorAll('.chart-type-select').forEach(sel => sel.addEventListener('change', () => ui.renderOverviewCharts(handleChartClick)));

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
    d.employeeSearch.addEventListener('input', applyEmployeeFiltersAndSearch);
    d.employeeDepartmentFilter.addEventListener('change', applyEmployeeFiltersAndSearch);
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
        const employee = state.allEmployees.find(emp => emp.EmployeeID === employeeId);
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

        const assetData = {
            AssetID: ui.dom.assetId.value || `ASSET-${Date.now()}`,
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
            LoginInfo: ui.dom.loginInfo.value ? btoa(ui.dom.loginInfo.value) : '',
            Notes: ui.dom.notes.value,
        };

        const isUpdate = !!assetData.rowIndex;
        const rowData = ASSET_HEADERS.map(header => assetData[header] || '');

        if (isUpdate) {
            await api.updateSheetValues(`${ASSET_SHEET}!A${assetData.rowIndex}`, [rowData]);
        } else {
            await api.appendSheetValues(ASSET_SHEET, [rowData]);
        }
        await initializeAppData();
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
        const rowData = EMPLOYEE_HEADERS.map(header => employeeData[header] || '');

        if (isUpdate) {
            await api.updateSheetValues(`${EMPLOYEES_SHEET}!A${employeeData.rowIndex}`, [rowData]);
        } else {
            await api.appendSheetValues(EMPLOYEES_SHEET, [rowData]);
        }
        await initializeAppData();
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

function setupBulkEditListeners() {
    ui.dom.bulkEditBtn.addEventListener('click', () => {
        document.getElementById('bulk-edit-form').reset();
        document.querySelectorAll('#bulk-edit-form select').forEach(el => el.disabled = true);
        ui.toggleModal(ui.dom.bulkEditModal, true);
    });
    document.getElementById('bulk-cancel-btn').onclick = () => ui.toggleModal(ui.dom.bulkEditModal, false);
    ui.dom.bulkEditModal.querySelector('.modal-backdrop').onclick = () => ui.toggleModal(ui.dom.bulkEditModal, false);
    
    document.querySelectorAll('#bulk-edit-form input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', e => {
            const fieldName = e.target.id.replace('bulk-update-', '').replace('-check', '');
            const inputEl = document.getElementById(`bulk-${fieldName.replace(/-(.)/g, (m, g) => g.toUpperCase())}`);
            if (inputEl) inputEl.disabled = !e.target.checked;
        });
    });

    document.getElementById('bulk-site').addEventListener('change', () => ui.handleDynamicSelectChange(document.getElementById('bulk-site'), document.getElementById('bulk-site-new')));
    document.getElementById('bulk-location').addEventListener('change', () => ui.handleDynamicSelectChange(document.getElementById('bulk-location'), document.getElementById('bulk-location-new')));
    document.getElementById('bulk-container').addEventListener('change', () => ui.handleDynamicSelectChange(document.getElementById('bulk-container'), document.getElementById('bulk-container-new')));
    
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
        state.visibleColumns = ["AssetName", ...selectedCols];
        localStorage.setItem('visibleColumns', JSON.stringify(state.visibleColumns));
        applyFiltersAndSearch();
        ui.renderFilters();
        ui.toggleModal(ui.dom.columnModal, false);
    });
}

async function handleBulkUpdate() {
    ui.setLoading(true);
    try {
        const selectedAssetIds = [...document.querySelectorAll('.asset-checkbox:checked')].map(cb => cb.dataset.id);
        if (selectedAssetIds.length === 0) return;

        const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${ASSET_SHEET}!1:1` });
        const sheetHeaders = response.result.values?.[0] || [];
        const headerMap = {};
        sheetHeaders.forEach((header, i) => {
            const foundHeader = ASSET_HEADER_MAP.find(h => h.aliases.includes(header));
            if(foundHeader) headerMap[foundHeader.key] = String.fromCharCode(65 + i);
        });

        const getSelectValue = (id) => {
            const select = document.getElementById(id);
            const newInp = document.getElementById(`${id}-new`);
            return select.value === '--new--' && newInp ? newInp.value : select.value;
        };

        const fields = [
            { check: 'bulk-update-site-check', key: 'Site', value: () => getSelectValue('bulk-site') },
            { check: 'bulk-update-location-check', key: 'Location', value: () => getSelectValue('bulk-location') },
            { check: 'bulk-update-container-check', key: 'Container', value: () => getSelectValue('bulk-container') },
            { check: 'bulk-update-intended-user-check', key: 'IntendedUserType', value: () => ui.dom.bulkIntendedUserType.value },
            { check: 'bulk-update-condition-check', key: 'Condition', value: () => ui.dom.bulkCondition.value },
            { check: 'bulk-update-assigned-to-check', key: 'AssignedTo', value: () => ui.dom.bulkAssignedTo.value }
        ];

        const data = [];
        for (const field of fields) {
            if (document.getElementById(field.check).checked) {
                const value = field.value();
                const colLetter = headerMap[field.key];
                if (colLetter) {
                    for (const id of selectedAssetIds) {
                        const asset = state.allAssets.find(a => a.AssetID === id);
                        if (asset) data.push({ range: `${ASSET_SHEET}!${colLetter}${asset.rowIndex}`, values: [[value]] });
                    }
                }
            }
        }

        if (data.length > 0) {
            await api.batchUpdateSheetValues(data);
            await initializeAppData();
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
    const sheetId = state.sheetIds[sheetName];
    if (!sheetId) {
        ui.showMessage(`Error: Could not find sheet ID for ${sheetName}`);
        return;
    }
    ui.setLoading(true);
    try {
        await api.batchUpdateSheet({
            requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex - 1, endIndex: rowIndex } } }]
        });
        await initializeAppData();
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

    if (tabName === 'overview') ui.renderOverviewCharts(handleChartClick);
    if (tabName === 'visual-inventory') initVisualInventory();
}

function handleChartClick(event, elements, filterId) {
    if (!elements || elements.length === 0) return;
    const chart = elements[0].element.$context.chart;
    const label = chart.data.labels[elements[0].index];

    document.querySelectorAll('#filter-section select, #filter-section input[type="text"]').forEach(el => el.value = '');
    
    const targetFilterEl = document.getElementById(filterId);
    if (targetFilterEl) targetFilterEl.value = label;
    
    switchTab('inventory');
    applyFiltersAndSearch();
}
