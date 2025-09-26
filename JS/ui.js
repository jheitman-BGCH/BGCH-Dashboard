// JS/ui.js
import { state, ASSET_HEADERS, CHART_COLORS, ITEMS_PER_PAGE } from './state.js';

// --- DOM ELEMENT REFERENCES ---
export const dom = {};

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
        'asset-table-head', 'asset-table-body', 'filter-search', 'filter-site', 
        'filter-location', 'filter-asset-type', 'filter-condition', 
        'filter-intended-user-type', 'filter-assigned-to', 'filter-model-number', 
        'detail-modal-title', 'detail-modal-content', 'detail-modal-edit-btn', 
        'modal-title', 'asset-id', 'row-index', 'asset-name', 'quantity', 
        'intended-user-type', 'condition', 'id-code', 'serial-number', 
        'model-number', 'date-issued', 'purchase-date', 'specs', 'login-info', 
        'notes', 'site', 'location', 'container', 'asset-type', 'assigned-to', 
        'detail-modal-close-btn', 'customize-cols-btn', 'column-checkboxes', 
        'column-cancel-btn', 'column-save-btn', 'add-employee-btn', 'employee-list-container',
        'employee-modal', 'employee-form', 'employee-cancel-btn', 'employee-modal-title',
        'employee-detail-modal', 'employee-detail-name', 'employee-detail-title-dept',
        'employee-detail-info', 'employee-detail-assets', 'employee-detail-close-btn',
        'employee-search', 'employee-department-filter', 'employee-detail-edit-btn',
        'employee-id', 'employee-row-index', 'bulk-site', 'bulk-location', 'bulk-container',
        'bulk-intended-user-type', 'bulk-condition', 'bulk-assigned-to', 
        'pagination-controls-top', 'pagination-controls-bottom'
    ];
    ids.forEach(id => {
        const key = id.replace(/[-_]([a-z])/g, (g) => g[1].toUpperCase());
        dom[key] = document.getElementById(id);
    });
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
    const backdrop = modal.querySelector('.modal-backdrop');
    const content = modal.querySelector('.modal-content');

    if (show) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            backdrop?.classList.remove('opacity-0');
            content?.classList.remove('scale-95');
        }, 10);
    } else {
        backdrop?.classList.add('opacity-0');
        content?.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

/**
 * Centralized helper to populate a <select> element.
 * @param {HTMLSelectElement} selectEl - The dropdown element to populate.
 * @param {Array<Object>} data - The source data array (e.g., state.allAssets).
 * @param {string} valueKey - The property to use for the option's value.
 * @param {string} [textKey=valueKey] - The property to use for the option's text.
 * @param {Object} [options={}] - Configuration options.
 * @param {string} [options.initialOptionText] - Text for the first, default option (e.g., "All").
 * @param {boolean} [options.addNew=false] - Whether to add an "Add New..." option.
 */
function populateSelect(selectEl, data, valueKey, textKey, options = {}) {
    if (!selectEl) return;
    textKey = textKey || valueKey;
    const { initialOptionText, addNew } = options;
    
    const uniqueItems = Array.from(new Map(data.map(item => [item[valueKey], item])).values());
    const currentValue = selectEl.value;
    selectEl.innerHTML = initialOptionText ? `<option value="">${initialOptionText}</option>` : '';

    uniqueItems
        .filter(item => item && item[valueKey])
        .sort((a, b) => String(a[textKey]).localeCompare(String(b[textKey])))
        .forEach(item => {
            const option = document.createElement('option');
            option.value = item[valueKey];
            option.textContent = item[textKey];
            selectEl.appendChild(option);
        });

    if (addNew) {
        const addNewOption = document.createElement('option');
        addNewOption.value = '--new--';
        addNewOption.textContent = 'Add New...';
        selectEl.appendChild(addNewOption);
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
    // Asset-based dropdowns
    const assetFields = ['Site', 'Location', 'Container', 'AssetType'];
    assetFields.forEach(field => {
        const key = field.charAt(0).toLowerCase() + field.slice(1);
        populateSelect(dom[key], state.allAssets, field, field, { initialOptionText: '-- Select --', addNew: true });
        populateSelect(dom[`bulk${field}`], state.allAssets, field, field, { initialOptionText: '-- Select --', addNew: true });
    });

    // Employee-based dropdowns
    populateSelect(dom.assignedTo, state.allEmployees, 'EmployeeID', 'EmployeeName', { initialOptionText: '-- Unassigned --' });
    populateSelect(dom.bulkAssignedTo, state.allEmployees, 'EmployeeID', 'EmployeeName', { initialOptionText: '-- Unassigned --' });
}


/**
 * Populates the main inventory filter dropdowns based on available data.
 */
export function populateFilterDropdowns() {
    populateSelect(dom.filterSite, state.allAssets, 'Site', 'Site', { initialOptionText: 'All' });
    populateSelect(dom.filterAssetType, state.allAssets, 'AssetType', 'AssetType', { initialOptionText: 'All' });
    populateSelect(dom.filterCondition, state.allAssets, 'Condition', 'Condition', { initialOptionText: 'All' });
    populateSelect(dom.filterModelNumber, state.allAssets, 'ModelNumber', 'ModelNumber', { initialOptionText: 'All' });
    populateSelect(dom.filterLocation, state.allAssets, 'Location', 'Location', { initialOptionText: 'All' });
    populateSelect(dom.filterIntendedUserType, state.allAssets, 'IntendedUserType', 'IntendedUserType', { initialOptionText: 'All' });
    
    // The AssignedTo filter shows employee names but filters by them.
    const assignedToData = state.allEmployees.map(e => ({ EmployeeName: e.EmployeeName }));
    populateSelect(dom.filterAssignedTo, assignedToData, 'EmployeeName', 'EmployeeName', { initialOptionText: 'All' });
    
    renderFilters();
}

/**
 * Renders the main asset data table with pagination.
 * @param {Array<Object>} assetsToRender - The full array of asset objects to display (before pagination).
 */
export function renderTable(assetsToRender) {
    if (!dom.assetTableHead || !dom.assetTableBody) return;
    dom.assetTableHead.innerHTML = '';
    dom.assetTableBody.innerHTML = '';

    // Sorting should be applied to the full list before pagination
    const sortedAssets = [...assetsToRender].sort((a, b) => {
        const valA = a[state.sortState.column] || '';
        const valB = b[state.sortState.column] || '';
        if (valA < valB) return state.sortState.direction === 'asc' ? -1 : 1;
        if (valA > valB) return state.sortState.direction === 'asc' ? 1 : -1;
        return 0;
    });

    // Pagination logic
    const startIndex = (state.pagination.currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedAssets = sortedAssets.slice(startIndex, endIndex);

    // Render Table Header
    const headerRow = document.createElement('tr');
    let headerHTML = `<th scope="col" class="relative px-6 py-3"><input type="checkbox" id="select-all-assets" class="h-4 w-4 rounded"></th>`;
    state.visibleColumns.forEach(colName => {
        let sortArrow = '';
        if (state.sortState.column === colName) {
            sortArrow = state.sortState.direction === 'asc' ? '▲' : '▼';
        }
        headerHTML += `<th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer" data-column="${colName}">${colName} <span class="sort-arrow">${sortArrow}</span></th>`;
    });
    headerHTML += `<th scope="col" class="px-6 py-3">Actions</th>`;
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

    dom.noDataMessage.classList.toggle('hidden', assetsToRender.length > 0);

    // Render Table Body for the current page
    paginatedAssets.forEach(asset => {
        const tr = document.createElement('tr');
        tr.dataset.id = asset.AssetID;
        let rowHtml = `<td class="relative px-6 py-4"><input type="checkbox" data-id="${asset.AssetID}" class="asset-checkbox h-4 w-4 rounded"></td>`;
        state.visibleColumns.forEach(colName => {
            let value = asset[colName] || '';
            if (colName === 'AssignedTo') {
                const employee = state.allEmployees.find(e => e.EmployeeID === value);
                value = employee ? employee.EmployeeName : (value || '');
            }
            rowHtml += `<td class="px-6 py-4 whitespace-nowrap text-sm">${value}</td>`;
        });
        rowHtml += `
            <td class="px-6 py-4 text-right text-sm font-medium">
                <div class="actions-menu">
                    <button class="actions-btn p-1 rounded-full hover:bg-gray-200">
                         <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600" viewBox="0 0 20 20" fill="currentColor"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
                    </button>
                    <div class="actions-dropdown">
                        <a class="edit-btn" data-id="${asset.AssetID}">Edit</a>
                        <a class="clone-btn" data-id="${asset.AssetID}">Clone</a>
                        <a class="delete-btn" data-row-index="${asset.rowIndex}">Delete</a>
                    </div>
                </div>
            </td>`;
        tr.innerHTML = rowHtml;
        dom.assetTableBody.appendChild(tr);
    });
    
    // Render pagination controls
    renderPagination(assetsToRender.length);

    updateBulkEditButtonVisibility();
}


/**
 * Renders pagination controls.
 * @param {number} totalItems - Total number of items to paginate.
 */
function renderPagination(totalItems) {
    const containers = [dom.paginationControlsTop, dom.paginationControlsBottom];
    
    if (containers.some(c => !c)) return;

    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    containers.forEach(container => {
        container.innerHTML = '';
        if (totalPages <= 1) {
            container.classList.add('hidden');
        } else {
            container.classList.remove('hidden');
            
            // Set specific classes for each container
            if (container.id === 'pagination-controls-top') {
                container.className = 'flex justify-between items-center';
            } else {
                container.className = 'flex justify-center items-center mt-6';
            }

            // Previous Button
            const prevButton = document.createElement('button');
            prevButton.className = 'pagination-arrow';
            prevButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>`;
            if (state.pagination.currentPage === 1) {
                prevButton.classList.add('disabled');
                prevButton.disabled = true;
            } else {
                prevButton.addEventListener('click', () => {
                    state.pagination.currentPage--;
                    window.dispatchEvent(new CustomEvent('paginationchange'));
                });
            }
            container.appendChild(prevButton);

            // Page Numbers Container
            const numbersContainer = document.createElement('div');
            numbersContainer.className = 'pagination-numbers flex-grow mx-4';
            
            for (let i = 1; i <= totalPages; i++) {
                const pageBtn = document.createElement('button');
                pageBtn.className = 'page-number';
                pageBtn.textContent = i;
                if (i === state.pagination.currentPage) {
                    pageBtn.classList.add('active');
                }
                pageBtn.dataset.page = i;
                pageBtn.addEventListener('click', (e) => {
                    const page = parseInt(e.target.dataset.page, 10);
                    if (page !== state.pagination.currentPage) {
                        state.pagination.currentPage = page;
                        window.dispatchEvent(new CustomEvent('paginationchange'));
                    }
                });
                numbersContainer.appendChild(pageBtn);
            }
            container.appendChild(numbersContainer);

            // Next Button
            const nextButton = document.createElement('button');
            nextButton.className = 'pagination-arrow';
            nextButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg>`;
            if (state.pagination.currentPage === totalPages) {
                nextButton.classList.add('disabled');
                nextButton.disabled = true;
            } else {
                nextButton.addEventListener('click', () => {
                    state.pagination.currentPage++;
                    window.dispatchEvent(new CustomEvent('paginationchange'));
                });
            }
            container.appendChild(nextButton);

            // Scroll active page into view
            const activePage = numbersContainer.querySelector('.page-number.active');
            if (activePage) {
                setTimeout(() => {
                    activePage.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }, 100);
            }
        }
    });
}


/**
 * Opens the detail modal and populates it with asset information.
 * @param {string} assetId - The ID of the asset to display.
 * @param {function} openEditCallback - A callback function to open the edit modal.
 */
export function openDetailModal(assetId, openEditCallback) {
    const asset = state.allAssets.find(a => a.AssetID === assetId);
    if (!asset) return;
    dom.detailModalTitle.textContent = asset.AssetName || 'Asset Details';
    dom.detailModalContent.innerHTML = `
        <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            ${ASSET_HEADERS.filter(h => h !== "LoginInfo").map(key => {
                let displayValue = asset[key] || 'N/A';
                if (key === 'AssignedTo') {
                    const employee = state.allEmployees.find(e => e.EmployeeID === asset[key]);
                    displayValue = employee ? employee.EmployeeName : 'Unassigned';
                }
                return `
                <div>
                    <dt>${key}:</dt>
                    <dd>${displayValue}</dd>
                </div>
            `}).join('')}
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


/**
 * Fills the asset form with data from an asset object.
 * @param {Object} asset - The asset object.
 */
export function populateAssetForm(asset) {
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
    dom.loginInfo.value = asset.LoginInfo || '';
    dom.notes.value = asset.Notes || '';

    const dynamicFields = [
        { id: 'site', key: 'Site' }, { id: 'location', key: 'Location' },
        { id: 'container', key: 'Container' }, { id: 'asset-type', key: 'AssetType' },
        { id: 'assigned-to', key: 'AssignedTo' }
    ];
    dynamicFields.forEach(field => {
        const select = document.getElementById(field.id);
        const newInp = document.getElementById(`${field.id}-new`);
        const value = asset[field.key];
        const optionExists = [...select.options].some(opt => opt.value === value);

        if (value && optionExists) {
            select.value = value;
            if(newInp) newInp.classList.add('hidden');
        } else if (value && field.id !== 'assigned-to') {
            select.value = '--new--';
            if(newInp) {
                newInp.value = value;
                newInp.classList.remove('hidden');
            }
        } else {
            select.value = value || ''; // Set to value if it exists, otherwise empty string
            if(newInp) {
                newInp.classList.add('hidden');
                newInp.value = '';
            }
        }
    });
}

/**
 * Renders the list of employees as cards in the Employees tab.
 * @param {Array<Object>} employeesToRender - The list of employee objects to display.
 */
export function renderEmployeeList(employeesToRender) {
    if (!dom.employeeListContainer) return;
    dom.employeeListContainer.innerHTML = '';

    if (!employeesToRender || employeesToRender.length === 0) {
        dom.employeeListContainer.innerHTML = `<p class="text-gray-500 col-span-full text-center">No employees match the current filters.</p>`;
        return;
    }

    const sortedEmployees = [...employeesToRender].sort((a, b) => a.EmployeeName.localeCompare(b.EmployeeName));

    sortedEmployees.forEach(emp => {
        const assignedAssets = state.allAssets.filter(asset => asset.AssignedTo === emp.EmployeeID);
        const card = document.createElement('div');
        card.className = 'employee-card bg-white p-5 rounded-lg shadow-md cursor-pointer border border-gray-200';
        card.dataset.id = emp.EmployeeID;
        card.innerHTML = `
            <h3 class="text-lg font-bold text-gray-900 truncate">${emp.EmployeeName}</h3>
            <p class="text-sm text-gray-600">${emp.Title || 'N/A'}</p>
            <div class="mt-4 pt-4 border-t border-gray-200">
                <p class="text-sm text-gray-500">
                    <span class="font-semibold text-gray-700">${assignedAssets.length}</span>
                    assets assigned
                </p>
            </div>
        `;
        dom.employeeListContainer.appendChild(card);
    });
}

/**
 * Opens and populates the employee detail modal.
 * @param {string} employeeId - The ID of the employee to show.
 */
export function openEmployeeDetailModal(employeeId) {
    const employee = state.allEmployees.find(e => e.EmployeeID === employeeId);
    if (!employee) {
        showMessage('Employee not found.');
        return;
    }

    dom.employeeDetailName.textContent = employee.EmployeeName;
    dom.employeeDetailTitleDept.textContent = `${employee.Title || 'No Title'} | ${employee.Department || 'No Department'}`;

    dom.employeeDetailInfo.innerHTML = `
        <div>
            <dt class="font-semibold text-gray-600">Email:</dt>
            <dd class="text-gray-800">${employee.Email || 'N/A'}</dd>
        </div>
        <div>
            <dt class="font-semibold text-gray-600">Phone:</dt>
            <dd class="text-gray-800">${employee.Phone || 'N/A'}</dd>
        </div>
    `;

    const assignedAssets = state.allAssets.filter(a => a.AssignedTo === employee.EmployeeID);
    if (assignedAssets.length > 0) {
        dom.employeeDetailAssets.innerHTML = `
            <ul class="divide-y divide-gray-200">
                ${assignedAssets.map(a => `
                    <li class="py-2 cursor-pointer hover:bg-gray-100 rounded-md p-2 employee-asset-item" data-asset-id="${a.AssetID}">
                        <p class="text-sm font-medium text-gray-900 pointer-events-none">${a.AssetName}</p>
                        <p class="text-xs text-gray-500 pointer-events-none">${a.AssetType || ''} (ID: ${a.IDCode || 'N/A'})</p>
                    </li>
                `).join('')}
            </ul>
        `;
    } else {
        dom.employeeDetailAssets.innerHTML = `<p class="text-sm text-gray-500">No assets currently assigned.</p>`;
    }
    
    dom.employeeDetailEditBtn.dataset.employeeId = employeeId;
    toggleModal(dom.employeeDetailModal, true);
}


/**
 * Populates the employee form for editing.
 * @param {object} employee - The employee object to edit.
 */
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

/**
 * Populates the department filter dropdown on the Employees tab.
 */
export function populateEmployeeFilterDropdowns() {
    populateSelect(dom.employeeDepartmentFilter, state.allEmployees, 'Department', 'Department', { initialOptionText: 'All Departments' });
}


/**
 * Shows/hides the "Add New..." text input for a dynamic select dropdown.
 * @param {HTMLSelectElement} selectElement - The dropdown element.
 * @param {HTMLInputElement} newElement - The text input element.
 */
export function handleDynamicSelectChange(selectElement, newElement) {
    if (!newElement) return;
    if (selectElement.value === '--new--') {
        newElement.classList.remove('hidden');
        newElement.focus();
    } else {
        newElement.classList.add('hidden');
        newElement.value = '';
    }
}

/**
 * Updates the visibility and text of the bulk edit button based on selection count.
 */
export function updateBulkEditButtonVisibility() {
    const selectedCount = document.querySelectorAll('.asset-checkbox:checked').length;
    dom.bulkEditBtn.classList.toggle('hidden', selectedCount === 0);
    if (selectedCount > 0) dom.bulkEditBtn.textContent = `Bulk Edit (${selectedCount}) Selected`;
}


/**
 * Shows or hides filter controls based on which columns are visible.
 */
export function renderFilters() {
    const filterMap = {
        "Site": "filter-site-wrapper", "AssetType": "filter-asset-type-wrapper",
        "Condition": "filter-condition-wrapper", "AssignedTo": "filter-assigned-to-wrapper",
        "ModelNumber": "filter-model-number-wrapper", "Location": "filter-location-wrapper",
        "IntendedUserType": "filter-intended-user-type-wrapper"
    };
    Object.values(filterMap).forEach(id => document.getElementById(id)?.classList.add('hidden'));
    state.visibleColumns.forEach(colName => document.getElementById(filterMap[colName])?.classList.remove('hidden'));
}


/**
 * Populates the column selection modal with checkboxes for each asset header.
 */
export function populateColumnSelector() {
    dom.columnCheckboxes.innerHTML = '';
    const selectableColumns = ASSET_HEADERS.filter(h => !["AssetID", "Specs", "LoginInfo", "Notes", "AssetName"].includes(h));
    selectableColumns.forEach(colName => {
        const isChecked = state.visibleColumns.includes(colName);
        const div = document.createElement('div');
        div.className = "flex items-center";
        div.innerHTML = `
            <input id="col-${colName.replace(/\s+/g, '')}" type="checkbox" value="${colName}" ${isChecked ? 'checked' : ''} class="h-4 w-4 rounded">
            <label for="col-${colName.replace(/\s+/g, '')}" class="ml-2 block text-sm">${colName}</label>
        `;
        dom.columnCheckboxes.appendChild(div);
    });
}

/**
 * Renders all charts on the overview panel.
 * @param {function} clickCallback - The callback function to execute when a chart segment is clicked.
 */
export function renderOverviewCharts(clickCallback) {
    Object.values(state.charts).forEach(chart => {
        if(chart.destroy) chart.destroy();
    });
    const processData = (key) => {
        const counts = state.allAssets.reduce((acc, asset) => {
            let value;
            if (key === 'AssignedTo') {
                const employee = state.allEmployees.find(e => e.EmployeeID === asset.AssignedTo);
                value = employee ? employee.EmployeeName : 'Unassigned';
            } else {
                value = asset[key] || 'Uncategorized';
            }
    
            if (key !== 'AssignedTo' && value === 'Uncategorized') {
                return acc;
            }
    
            acc[value] = (acc[value] || 0) + 1;
            return acc;
        }, {});
    
        if (key === 'AssignedTo') {
            delete counts.Unassigned; 
        }
        return { labels: Object.keys(counts), data: Object.values(counts) };
    };
    
    const createChartConfig = (type, data, label, filterId) => ({
        type: type,
        data: { labels: data.labels, datasets: [{ label, data: data.data, backgroundColor: CHART_COLORS, borderWidth: 1 }] },
        options: { onClick: (e, el) => clickCallback(e, el, filterId), scales: (type === 'bar' || type === 'line') ? { y: { beginAtZero: true } } : {} }
    });
    
    state.charts.siteChart = new Chart(document.getElementById('site-chart'), createChartConfig(document.getElementById('site-chart-type').value, processData('Site'), 'Assets per Site', 'filter-site'));
    state.charts.conditionChart = new Chart(document.getElementById('condition-chart'), createChartConfig(document.getElementById('condition-chart-type').value, processData('Condition'), 'Assets by Condition', 'filter-condition'));
    state.charts.typeChart = new Chart(document.getElementById('type-chart'), createChartConfig(document.getElementById('type-chart-type').value, processData('AssetType'), 'Assets by Type', 'filter-asset-type'));
    state.charts.employeeChart = new Chart(document.getElementById('employee-chart'), createChartConfig(document.getElementById('employee-chart-type').value, processData('AssignedTo'), 'Assignments per Employee', 'filter-assigned-to'));
}

