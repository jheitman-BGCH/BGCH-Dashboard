// JS/ui.js
import { ASSET_HEADER_MAP } from './state.js';
import { getState, dispatch, actionTypes } from './store.js';
import * as selectors from './selectors.js';

// --- DOM ELEMENT REFERENCES ---
export const dom = {};
// This holds Chart.js instances. It's UI state, not application data, so it lives here.
let charts = {};

/**
 * Queries the DOM and populates the `dom` object with element references.
 */
export function initUI() {
    const ids = [
        'auth-section', 'dashboard-section', 'authorize_button', 'signout_button',
        'add-asset-btn', 'bulk-edit-btn', 'refresh-data-btn', 'asset-modal',
        'asset-form', 'cancel-btn', 'loading-indicator', 'no-data-message',
        'detail-modal', 'bulk-edit-modal', 'column-modal', 'inventory-tab',
        'overview-tab', 'employees-tab', 'visual-inventory-tab', 'inventory-panel',
        'overview-panel', 'employees-panel', 'visual-inventory-panel',
        'asset-table-head', 'asset-table-body', 'filter-search',
        'filter-site-wrapper', 'filter-site', 'filter-room-wrapper', 'filter-room',
        'filter-container-wrapper', 'filter-container',
        'filter-asset-type', 'filter-condition',
        'filter-intended-user-type', 'filter-assigned-to', 'filter-model-number',
        'detail-modal-title', 'detail-modal-content', 'detail-modal-edit-btn',
        'modal-title', 'asset-id', 'row-index', 'asset-name', 'quantity',
        'intended-user-type', 'condition', 'id-code', 'serial-number',
        'model-number', 'date-issued', 'purchase-date', 'specs', 'login-info',
        'notes', 'modal-site', 'modal-room', 'modal-container', 'asset-type', 'assigned-to',
        'detail-modal-close-btn', 'customize-cols-btn', 'column-checkboxes',
        'column-cancel-btn', 'column-save-btn', 'add-employee-btn', 'employee-list-container',
        'employee-modal', 'employee-form', 'employee-cancel-btn', 'employee-modal-title',
        'employee-detail-modal', 'employee-detail-name', 'employee-detail-title-dept',
        'employee-detail-info', 'employee-detail-assets', 'employee-detail-close-btn',
        'employee-search', 'employee-department-filter', 'employee-detail-edit-btn',
        'employee-id', 'employee-row-index', 'bulk-location',
        'bulk-intended-user-type', 'bulk-condition', 'bulk-assigned-to',
        'pagination-controls-top', 'pagination-controls-bottom', 'vi-site-selector',
        // Visual Inventory Elements
        'room-selector', 'grid-container', 'create-room-btn',
        'breadcrumb-container', 'room-modal', 'room-form', 'contents-modal',
        'radial-menu', 'radial-rename-use', 'radial-flip-use', 'radial-rotate-use',
        'radial-resize-use', 'radial-open-use', 'radial-delete-use',
        'unplaced-asset-search', 'unplaced-assets-list', 'unplaced-group-by', 'unplaced-sort-btn',
        'unplaced-sort-icon', 'draw-wall-btn',
        // New Container Modal Elements
        'add-container-btn', 'container-modal', 'container-form', 'cancel-container-btn',
        'container-modal-site', 'container-modal-room', 'container-modal-parent'
    ];
    ids.forEach(id => {
        const key = id.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        dom[key] = document.getElementById(id);
    });

    // Swipe navigation for pagination
    let touchstartX = 0;
    let touchendX = 0;
    const swipeThreshold = 50; // Minimum distance for a swipe

    function handleSwipe(totalPages) {
        const { pagination } = getState();
        if (touchendX < touchstartX - swipeThreshold) { // Swiped left
            if (pagination.currentPage < totalPages) {
                dispatch({ type: actionTypes.SET_CURRENT_PAGE, payload: pagination.currentPage + 1 });
            }
        }
        if (touchendX > touchstartX + swipeThreshold) { // Swiped right
             if (pagination.currentPage > 1) {
                dispatch({ type: actionTypes.SET_CURRENT_PAGE, payload: pagination.currentPage - 1 });
            }
        }
    }

    if (dom.assetTableBody) {
        dom.assetTableBody.addEventListener('touchstart', e => {
            touchstartX = e.changedTouches[0].screenX;
        }, false);

        dom.assetTableBody.addEventListener('touchend', e => {
            touchendX = e.changedTouches[0].screenX;
            const { totalPages } = e.target.closest('table').dataset;
            if(totalPages) handleSwipe(parseInt(totalPages));
        }, false);
    }
}

/**
 * Toggles the visibility of authentication and dashboard sections.
 * @param {boolean} isSignedIn - Whether the user is signed in.
 */
export function updateSigninStatus(isSignedIn) {
    dom.authSection.classList.toggle('hidden', isSignedIn);
    dom.dashboardSection.classList.toggle('hidden', !isSignedIn);
}

/**
 * Toggles the loading indicator visibility.
 * @param {boolean} isLoading - True to show the loader, false to hide.
 */
export function setLoading(isLoading) {
    dom.loadingIndicator.classList.toggle('hidden', !isLoading);
    dom.loadingIndicator.classList.toggle('flex', isLoading);
}

/**
 * Displays a temporary message to the user.
 * @param {string} text - The message to display.
 * @param {string} [type='error'] - The type of message ('error' or 'success').
 */
export function showMessage(text, type = 'error') {
    const box = document.getElementById('message-box');
    const textEl = document.getElementById('message-text');
    if (!box || !textEl) return;
    textEl.innerText = text;
    box.className = 'fixed top-5 right-5 text-white py-3 px-5 rounded-lg shadow-lg z-50';
    box.classList.add(type === 'error' ? 'bg-red-500' : 'bg-green-500');
    box.classList.remove('hidden');
    setTimeout(() => box.classList.add('hidden'), 5000);
}

/**
 * Toggles the visibility of a modal with smooth transitions.
 * @param {HTMLElement} modal - The modal element to toggle.
 * @param {boolean} show - True to show the modal, false to hide.
 */
export function toggleModal(modal, show) {
    if (!modal) return;
    modal.classList.toggle('hidden', !show);
}

/**
 * Centralized helper to populate a <select> element.
 * @param {HTMLSelectElement} selectEl - The dropdown element to populate.
 * @param {Array<Object>} data - The source data array.
 * @param {string} valueKey - The property to use for the option's value.
 * @param {string} [textKey=valueKey] - The property to use for the option's text.
 * @param {Object} [options={}] - Configuration options.
 */
export function populateSelect(selectEl, data, valueKey, textKey, options = {}) {
    if (!selectEl) return;
    textKey = textKey || valueKey;
    const { initialOptionText, addNew } = options;
    const sortedData = [...data].sort((a, b) => String(a[textKey]).localeCompare(String(b[textKey])));

    const currentValue = selectEl.value;
    selectEl.innerHTML = initialOptionText ? `<option value="">${initialOptionText}</option>` : '';

    sortedData.forEach(item => {
        if (item && item[valueKey]) {
            const option = document.createElement('option');
            option.value = item[valueKey];
            option.textContent = item[textKey];
            selectEl.appendChild(option);
        }
    });

    if (addNew) {
        selectEl.innerHTML += `<option value="--new--">Add New...</option>`;
    }
    
    // Restore previous value if it still exists
    if ([...selectEl.options].some(opt => opt.value === currentValue)) {
        selectEl.value = currentValue;
    }
}

/**
 * Populates all dropdowns in the main asset form and bulk edit form.
 */
export function populateModalDropdowns() {
    const { allAssets, allEmployees } = getState();
    populateSelect(dom.assetType, [...new Map(allAssets.map(item => [item.AssetType, item])).values()], 'AssetType', 'AssetType', { initialOptionText: '-- Select --', addNew: true });
    populateSelect(dom.assignedTo, allEmployees, 'EmployeeID', 'EmployeeName', { initialOptionText: '-- Unassigned --' });
    
    const bulkAssignedTo = document.getElementById('bulk-assigned-to');
    if (bulkAssignedTo) {
        populateSelect(bulkAssignedTo, allEmployees, 'EmployeeID', 'EmployeeName', { initialOptionText: '-- Unassigned --' });
    }
}

/**
 * Manages the new chained hierarchical location filters for the main inventory view.
 */
export function populateChainedFilters() {
    const state = getState();
    
    populateSelect(dom.filterSite, state.allSites, 'SiteID', 'SiteName', { initialOptionText: 'All Sites' });
    dom.filterSite.value = state.filters.site;
    
    const roomsForSite = selectors.selectRoomsBySiteId(state, state.filters.site);
    populateSelect(dom.filterRoom, roomsForSite, 'RoomID', 'RoomName', { initialOptionText: 'All Rooms' });
    dom.filterRoom.disabled = !state.filters.site;
    dom.filterRoom.value = state.filters.room;

    const containersForRoom = selectors.selectContainersByParentId(state, state.filters.room);
    populateSelect(dom.filterContainer, containersForRoom, 'ContainerID', 'ContainerName', { initialOptionText: 'All Containers' });
    dom.filterContainer.disabled = !state.filters.room;
    dom.filterContainer.value = state.filters.container;
}

/**
 * Populates the main inventory filter dropdowns based on available data.
 */
export function populateFilterDropdowns() {
    populateChainedFilters();
    
    const { allAssets, allEmployees } = getState();
    const uniqueAssets = (key) => [...new Map(allAssets.map(item => [item[key], item])).values()];
    
    populateSelect(dom.filterAssetType, uniqueAssets('AssetType'), 'AssetType', 'AssetType', { initialOptionText: 'All' });
    populateSelect(dom.filterCondition, uniqueAssets('Condition'), 'Condition', 'Condition', { initialOptionText: 'All' });
    populateSelect(dom.filterModelNumber, uniqueAssets('ModelNumber'), 'ModelNumber', 'ModelNumber', { initialOptionText: 'All' });
    populateSelect(dom.filterIntendedUserType, uniqueAssets('IntendedUserType'), 'IntendedUserType', 'IntendedUserType', { initialOptionText: 'All' });
    populateSelect(dom.filterAssignedTo, allEmployees, 'EmployeeName', 'EmployeeName', { initialOptionText: 'All' });

    renderFilters();
}

/**
 * Renders the main asset data table.
 */
export function renderTable(paginatedAssets, totalPages, currentPage, visibleColumns, sortState) {
    if (!dom.assetTableHead || !dom.assetTableBody) return;
    dom.assetTableHead.innerHTML = '';
    dom.assetTableBody.innerHTML = '';
    dom.assetTableBody.closest('table').dataset.totalPages = totalPages;

    const headerRow = document.createElement('tr');
    let headerHTML = `<th class="relative px-6 py-3"><input type="checkbox" id="select-all-assets" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"></th>`;
    visibleColumns.forEach(colName => {
        let sortArrow = '';
        if (sortState.column === colName) {
            sortArrow = sortState.direction === 'asc' ? '▲' : '▼';
        }
        headerHTML += `<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" data-column="${colName}">${colName.replace(/([A-Z])/g, ' $1')} <span class="sort-arrow">${sortArrow}</span></th>`;
    });
    headerHTML += `<th scope="col" class="relative px-6 py-3"><span class="sr-only">Actions</span></th>`;
    headerRow.innerHTML = headerHTML;
    dom.assetTableHead.appendChild(headerRow);

    const selectAllCheckbox = dom.assetTableHead.querySelector('#select-all-assets');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            dom.assetTableBody.querySelectorAll('.asset-checkbox').forEach(checkbox => {
                checkbox.checked = e.target.checked;
            });
            updateBulkEditButtonVisibility();
        });
    }

    dom.noDataMessage.classList.toggle('hidden', paginatedAssets.length > 0);

    paginatedAssets.forEach(asset => {
        const tr = document.createElement('tr');
        tr.dataset.id = asset.AssetID;
        const displayColumns = visibleColumns.map(colName => {
            const value = colName === 'AssignedTo' ? asset.AssignedToName : asset[colName];
            return `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${value || ''}</td>`;
        }).join('');

        tr.innerHTML = `
            <td class="relative px-6 py-4"><input type="checkbox" data-id="${asset.AssetID}" class="asset-checkbox h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"></td>
            ${displayColumns}
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="actions-menu">
                    <button class="actions-btn p-1 rounded-full text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                         <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
                    </button>
                    <div class="actions-dropdown">
                        <a href="#" class="edit-btn" data-id="${asset.AssetID}">Edit</a>
                        <a href="#" class="clone-btn" data-id="${asset.AssetID}">Clone</a>
                        <a href="#" class="delete-btn" data-row-index="${asset.rowIndex}">Delete</a>
                    </div>
                </div>
            </td>`;
        dom.assetTableBody.appendChild(tr);
    });

    renderPagination(totalPages, currentPage);
    updateBulkEditButtonVisibility();
}

function renderPagination(totalPages, currentPage) {
    const containers = [dom.paginationControlsTop, dom.paginationControlsBottom];
    containers.forEach(container => {
        if (!container) return;
        container.innerHTML = '';
        if (totalPages <= 1) {
            container.classList.add('hidden');
            return;
        }
        container.classList.remove('hidden');
        container.className = 'pagination-controls';

        const prevButton = document.createElement('button');
        prevButton.className = 'pagination-arrow';
        prevButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>`;
        prevButton.disabled = currentPage === 1;
        if (currentPage > 1) {
            prevButton.addEventListener('click', () => dispatch({ type: actionTypes.SET_CURRENT_PAGE, payload: currentPage - 1 }));
        }
        if(prevButton.disabled) prevButton.classList.add('disabled');
        container.appendChild(prevButton);

        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'pagination-dots';
        
        const pages = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (currentPage > 3) pages.push('...');
            
            let start = Math.max(2, currentPage - 1);
            let end = Math.min(totalPages - 1, currentPage + 1);

            for (let i = start; i <= end; i++) pages.push(i);

            if (currentPage < totalPages - 2) pages.push('...');
            pages.push(totalPages);
        }
        
        pages.forEach(page => {
            if (page === '...') {
                 dotsContainer.appendChild(createEllipsis());
            } else {
                 dotsContainer.appendChild(createDot(page, page === currentPage));
            }
        });
        
        container.appendChild(dotsContainer);

        const nextButton = document.createElement('button');
        nextButton.className = 'pagination-arrow';
        nextButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg>`;
        nextButton.disabled = currentPage === totalPages;
        if (currentPage < totalPages) {
            nextButton.addEventListener('click', () => dispatch({ type: actionTypes.SET_CURRENT_PAGE, payload: currentPage + 1 }));
        }
        if (nextButton.disabled) nextButton.classList.add('disabled');
        container.appendChild(nextButton);
    });
}

function createDot(pageNumber, isActive = false) {
    const dot = document.createElement('span');
    dot.className = 'pagination-dot';
    if (isActive) dot.classList.add('active');
    dot.dataset.page = pageNumber;
    // dot.textContent = pageNumber; // Commented out to show dots instead of numbers
    dot.addEventListener('click', (e) => dispatch({ type: actionTypes.SET_CURRENT_PAGE, payload: parseInt(e.target.dataset.page, 10) }));
    return dot;
}

function createEllipsis() {
    const ellipsis = document.createElement('span');
    ellipsis.className = 'pagination-ellipsis';
    ellipsis.textContent = '...';
    return ellipsis;
}


export function openDetailModal(assetId, openEditCallback) {
    const state = getState();
    const asset = selectors.selectAssetsById(state.allAssets).get(assetId);
    if (!asset) return;

    const parentId = selectors.selectResolvedAssetParentId(asset, state);
    const locationPath = selectors.selectFullLocationPathString(state, parentId);
    
    dom.detailModalTitle.textContent = asset.AssetName || 'Asset Details';
    const detailHeaders = ASSET_HEADER_MAP.map(h => h.key).filter(h => !['Site', 'Location', 'Container', 'LoginInfo', 'ParentObjectID', 'AssetID'].includes(h));

    dom.detailModalContent.innerHTML = `
        <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            <div><dt class="font-semibold text-gray-600">Location Path:</dt><dd class="text-gray-800">${locationPath || 'N/A'}</dd></div>
            ${detailHeaders.map(key => {
                let displayValue = asset[key] || 'N/A';
                if (key === 'AssignedTo') {
                    displayValue = selectors.selectEmployeesById(state.allEmployees).get(asset[key])?.EmployeeName || 'Unassigned';
                }
                return `<div><dt class="font-semibold text-gray-600">${key.replace(/([A-Z])/g, ' $1')}:</dt><dd class="text-gray-800">${displayValue}</dd></div>`
            }).join('')}
        </dl>
    `;

    const newEditBtn = dom.detailModalEditBtn.cloneNode(true);
    dom.detailModalEditBtn.parentNode.replaceChild(newEditBtn, dom.detailModalEditBtn);
    dom.detailModalEditBtn = newEditBtn;
    dom.detailModalEditBtn.addEventListener('click', () => {
        toggleModal(dom.detailModal, false);
        openEditCallback(assetId);
    });
    toggleModal(dom.detailModal, true);
}

export function populateAssetForm(asset = {}) {
    dom.assetForm.reset();
    dom.assetId.value = asset.AssetID || '';
    dom.rowIndex.value = asset.rowIndex || '';
    dom.assetName.value = asset.AssetName || '';
    dom.quantity.value = asset.Quantity || '1';
    dom.intendedUserType.value = asset.IntendedUserType || 'Staff';
    dom.condition.value = asset.Condition || 'Good';
    dom.idCode.value = asset.IDCode || '';
    dom.serialNumber.value = asset.SerialNumber || '';
    dom.modelNumber.value = asset.ModelNumber || '';
    dom.dateIssued.value = asset.DateIssued || '';
    dom.purchaseDate.value = asset.PurchaseDate || '';
    dom.specs.value = asset.Specs || '';
    dom.loginInfo.value = asset.LoginInfo ? atob(asset.LoginInfo) : '';
    dom.notes.value = asset.Notes || '';
    dom.assetType.value = asset.AssetType || '';
    dom.assignedTo.value = asset.AssignedTo || '';

    // Handle hierarchical location dropdowns
    const state = getState();
    const parentId = selectors.selectResolvedAssetParentId(asset, state);
    const path = selectors.selectFullLocationPath(state, parentId);
    const site = path.find(p => p.SiteID);
    const room = path.find(p => p.RoomID);
    const container = path.find(p => p.ContainerID);

    dom.modalSite.value = site ? site.SiteID : '';
    // Trigger change to populate children, then set their values
    dom.modalSite.dispatchEvent(new Event('change'));
    dom.modalRoom.value = room ? room.RoomID : '';
    dom.modalRoom.dispatchEvent(new Event('change'));
    dom.modalContainer.value = container ? container.ContainerID : '';
}

export function renderEmployeeList(sortedEmployees) {
    if (!dom.employeeListContainer) return;
    dom.employeeListContainer.innerHTML = '';
    const { allAssets } = getState();

    if (!sortedEmployees || sortedEmployees.length === 0) {
        dom.employeeListContainer.innerHTML = `<p class="text-gray-500 col-span-full text-center">No employees match the current filters.</p>`;
        return;
    }

    const assetCounts = allAssets.reduce((acc, asset) => {
        if (asset.AssignedTo) {
            acc[asset.AssignedTo] = (acc[asset.AssignedTo] || 0) + 1;
        }
        return acc;
    }, {});

    sortedEmployees.forEach(emp => {
        const card = document.createElement('div');
        card.className = 'employee-card';
        card.dataset.id = emp.EmployeeID;
        card.innerHTML = `
            <h3 class="text-lg font-bold text-gray-900 truncate">${emp.EmployeeName}</h3>
            <p class="text-sm text-gray-600">${emp.Title || 'N/A'}</p>
            <div class="mt-4 pt-4 border-t border-gray-200">
                <p class="text-sm text-gray-500">
                    <span class="font-semibold text-gray-700">${assetCounts[emp.EmployeeID] || 0}</span>
                    assets assigned
                </p>
            </div>
        `;
        dom.employeeListContainer.appendChild(card);
    });
}

export function openEmployeeDetailModal(employeeId) {
    const state = getState();
    const employee = selectors.selectEmployeesById(state.allEmployees).get(employeeId);
    if (!employee) return;

    dom.employeeDetailName.textContent = employee.EmployeeName;
    dom.employeeDetailTitleDept.textContent = `${employee.Title || 'No Title'} | ${employee.Department || 'No Department'}`;
    dom.employeeDetailInfo.innerHTML = `
        <div><dt class="font-semibold text-gray-600">Email:</dt><dd class="text-gray-800">${employee.Email || 'N/A'}</dd></div>
        <div><dt class="font-semibold text-gray-600">Phone:</dt><dd class="text-gray-800">${employee.Phone || 'N/A'}</dd></div>
    `;
    const assignedAssets = state.allAssets.filter(a => a.AssignedTo === employee.EmployeeID);
    dom.employeeDetailAssets.innerHTML = assignedAssets.length > 0 ? `
        <ul class="divide-y divide-gray-200">
            ${assignedAssets.map(a => `<li class="py-2 cursor-pointer hover:bg-gray-100 rounded-md p-2 employee-asset-item" data-asset-id="${a.AssetID}"><p class="text-sm font-medium text-gray-900">${a.AssetName}</p><p class="text-xs text-gray-500">${a.AssetType || ''}</p></li>`).join('')}
        </ul>` : `<p class="text-sm text-gray-500">No assets assigned.</p>`;

    dom.employeeDetailEditBtn.dataset.employeeId = employeeId;
    toggleModal(dom.employeeDetailModal, true);
}

export function populateEmployeeForm(employee) {
    dom.employeeForm.reset();
    dom.employeeId.value = employee.EmployeeID || '';
    dom.employeeRowIndex.value = employee.rowIndex || '';
    document.getElementById('employee-name').value = employee.EmployeeName || '';
    document.getElementById('employee-title').value = employee.Title || '';
    document.getElementById('employee-department').value = employee.Department || '';
    document.getElementById('employee-email').value = employee.Email || '';
    document.getElementById('employee-phone').value = employee.Phone || '';
    dom.employeeModalTitle.textContent = 'Edit Employee';
}

export function populateEmployeeFilterDropdowns() {
    const { allEmployees } = getState();
    populateSelect(dom.employeeDepartmentFilter, [...new Map(allEmployees.map(e => [e.Department, e])).values()], 'Department', 'Department', { initialOptionText: 'All Departments' });
}

export function handleDynamicSelectChange(selectElement, newElement) {
    if (!newElement) return;
    newElement.classList.toggle('hidden', selectElement.value !== '--new--');
    if (selectElement.value === '--new--') newElement.focus();
    else newElement.value = '';
}

export function updateBulkEditButtonVisibility() {
    const selectedCount = document.querySelectorAll('.asset-checkbox:checked').length;
    dom.bulkEditBtn.classList.toggle('hidden', selectedCount === 0);
    if (selectedCount > 0) dom.bulkEditBtn.textContent = `Bulk Edit (${selectedCount}) Selected`;
}

export function renderFilters() {
    const filterMap = {
        "AssetType": "filter-asset-type-wrapper", "Condition": "filter-condition-wrapper",
        "AssignedTo": "filter-assigned-to-wrapper", "ModelNumber": "filter-model-number-wrapper",
        "IntendedUserType": "filter-intended-user-type-wrapper"
    };
    Object.values(filterMap).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    getState().visibleColumns.forEach(colName => {
        const el = document.getElementById(filterMap[colName]);
        if (el) el.classList.remove('hidden');
    });
}

export function populateColumnSelector() {
    dom.columnCheckboxes.innerHTML = '';
    const { visibleColumns } = getState();
    const selectableColumns = ASSET_HEADER_MAP.map(h => h.key).filter(h => !["AssetID", "Specs", "LoginInfo", "Notes", "AssetName", "ParentObjectID", "Site", "Location", "Container"].includes(h));
    selectableColumns.forEach(colName => {
        const isChecked = visibleColumns.includes(colName);
        dom.columnCheckboxes.innerHTML += `
            <div class="flex items-center">
                <input id="col-${colName}" type="checkbox" value="${colName}" ${isChecked ? 'checked' : ''} class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                <label for="col-${colName}" class="ml-2 block text-sm text-gray-700">${colName.replace(/([A-Z])/g, ' $1')}</label>
            </div>
        `;
    });
}

export function renderOverviewCharts(chartData, clickCallback) {
    const chartConfigs = {
        siteChart: { data: chartData.siteData, el: 'site-chart', typeEl: 'site-chart-type', filterId: 'filter-site' },
        conditionChart: { data: chartData.conditionData, el: 'condition-chart', typeEl: 'condition-chart-type', filterId: 'filter-condition' },
        typeChart: { data: chartData.typeData, el: 'type-chart', typeEl: 'type-chart-type', filterId: 'filter-asset-type' },
        employeeChart: { data: chartData.employeeData, el: 'employee-chart', typeEl: 'employee-chart-type', filterId: 'filter-assigned-to' },
    };

    for (const [key, config] of Object.entries(chartConfigs)) {
        const canvas = document.getElementById(config.el);
        if(!canvas) continue;
        const typeEl = document.getElementById(config.typeEl);
        if(!typeEl) continue;
        const type = typeEl.value;
        if (charts[key] && charts[key].config.type === type) {
            charts[key].data = config.data;
            charts[key].update();
        } else {
            if (charts[key]) charts[key].destroy();
            charts[key] = new Chart(canvas, {
                type: type,
                data: config.data,
                options: { 
                    onClick: (e, el) => clickCallback(e, el, config.filterId), 
                    scales: (type === 'bar' || type === 'line') ? { y: { beginAtZero: true } } : {},
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                        }
                    }
                }
            });
        }
    }
}

// --- HIERARCHICAL MODAL DROPDOWNS ---
function populateRoomDropdownForSite(siteId, roomEl, containerEl) {
    if (!roomEl || !containerEl) return;
    const rooms = siteId ? selectors.selectRoomsBySiteId(getState(), siteId) : [];
    populateSelect(roomEl, rooms, 'RoomID', 'RoomName', { initialOptionText: '-- Select Room --' });
    roomEl.disabled = !siteId;
    
    const placeholder = containerEl.id.includes('parent') ? '-- Select Parent Container --' : '-- Select Container --';
    containerEl.innerHTML = `<option value="">${placeholder}</option>`;
    containerEl.disabled = true;
}

function populateContainerDropdownForRoom(roomId, containerEl) {
    if (!containerEl) return;
    const containers = roomId ? selectors.selectContainersByParentId(getState(), roomId) : [];
    const placeholder = containerEl.id.includes('parent') ? '-- Select Parent Container --' : '-- Select Container --';
    populateSelect(containerEl, containers, 'ContainerID', 'ContainerName', { initialOptionText: placeholder });
    containerEl.disabled = !roomId;
}

export function setupModalHierarchy() {
    // For Asset Modal
    populateSelect(dom.modalSite, getState().allSites, 'SiteID', 'SiteName', { initialOptionText: '-- Select Site --' });
    dom.modalSite.addEventListener('change', () => {
        populateRoomDropdownForSite(dom.modalSite.value, dom.modalRoom, dom.modalContainer);
    });
    dom.modalRoom.addEventListener('change', () => {
        populateContainerDropdownForRoom(dom.modalRoom.value, dom.modalContainer);
    });

    // For New Container Modal
    populateSelect(dom.containerModalSite, getState().allSites, 'SiteID', 'SiteName', { initialOptionText: '-- Select Site --' });
    dom.containerModalSite.addEventListener('change', () => {
        populateRoomDropdownForSite(dom.containerModalSite.value, dom.containerModalRoom, dom.containerModalParent);
    });
    dom.containerModalRoom.addEventListener('change', () => {
        populateContainerDropdownForRoom(dom.containerModalRoom.value, dom.containerModalParent);
    });
    
    // For Bulk Edit Modal
    const bulkSiteEl = document.getElementById('bulk-site');
    const bulkRoomEl = document.getElementById('bulk-room');
    const bulkContainerEl = document.getElementById('bulk-container');
    if (bulkSiteEl && bulkRoomEl && bulkContainerEl) {
        populateSelect(bulkSiteEl, getState().allSites, 'SiteID', 'SiteName', { initialOptionText: '-- Select Site --' });
        bulkSiteEl.addEventListener('change', (e) => {
            populateRoomDropdownForSite(e.target.value, bulkRoomEl, bulkContainerEl);
        });
        bulkRoomEl.addEventListener('change', (e) => {
            populateContainerDropdownForRoom(e.target.value, bulkContainerEl);
        });
    }
}
