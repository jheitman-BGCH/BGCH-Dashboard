// JS/ui.js
import { state, ASSET_HEADERS, CHART_COLORS } from './state.js';

// --- DOM ELEMENT REFERENCES ---
// We use a single object to hold all DOM references for cleaner access.
export const dom = {};

/**
 * Queries the DOM and populates the `dom` object with element references.
 * Should be called once the DOM is fully loaded.
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
        'employee-id', 'employee-row-index'
    ];
    ids.forEach(id => {
        // Convert snake_case and kebab-case to camelCase for property names
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

/**
 * Populates dropdowns in the main asset form and bulk edit form.
 */
export function populateModalDropdowns() {
    const fields = ['Site', 'Location', 'Container', 'AssetType'];
    const bulkFields = ['Site', 'Location', 'Container'];

    const populate = (key, prefix = '') => {
        const select = document.getElementById(`${prefix}${key.toLowerCase()}`);
        if (!select) return;
        const uniqueValues = [...new Set(state.allAssets.map(asset => asset[key]).filter(Boolean))].sort();
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
    
    // Populate standard fields from asset data
    fields.forEach(key => populate(key, ''));
    bulkFields.forEach(key => populate(key, 'bulk-'));

    // Populate "Assigned To" from employee data
    const assignedToSelects = [document.getElementById('assigned-to'), document.getElementById('bulk-assigned-to')];
    assignedToSelects.forEach(select => {
        if (!select) return;
        select.innerHTML = '<option value="">-- Unassigned --</option>';
        state.allEmployees
            .sort((a,b) => a.EmployeeName.localeCompare(b.EmployeeName))
            .forEach(emp => {
                const option = document.createElement('option');
                option.value = emp.EmployeeID; // Use EmployeeID as value
                option.textContent = emp.EmployeeName;
                select.appendChild(option);
        });
    });
}


/**
 * Populates the main filter dropdowns based on available asset data.
 */
export function populateFilterDropdowns() {
    const filters = ['Site', 'AssetType', 'Condition', 'AssignedTo', 'ModelNumber', 'Location', 'IntendedUserType'];

    filters.forEach(key => {
        const select = document.getElementById(`filter-${key.toLowerCase()}`);
        if (!select) return;
        
        let uniqueValues;
        if (key === 'AssignedTo') {
            // For the 'AssignedTo' filter, we want to show names, not IDs.
            uniqueValues = [...new Set(state.allEmployees.map(emp => emp.EmployeeName))].sort();
        } else {
            uniqueValues = [...new Set(state.allAssets.map(asset => asset[key]).filter(Boolean))].sort();
        }

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

/**
 * Renders the main asset data table.
 * @param {Array<Object>} assetsToRender - The array of asset objects to display.
 */
export function renderTable(assetsToRender) {
    dom.assetTableHead.innerHTML = '';
    dom.assetTableBody.innerHTML = '';

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

    // Re-attach the 'select-all' checkbox listener after rendering
    const selectAllCheckbox = dom.assetTableHead.querySelector('#select-all-assets');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            dom.assetTableBody.querySelectorAll('.asset-checkbox').forEach(checkbox => {
                checkbox.checked = e.target.checked;
            });
            updateBulkEditButtonVisibility();
        });
    }

    const sortedAssets = [...assetsToRender].sort((a, b) => {
        const valA = a[state.sortState.column] || '';
        const valB = b[state.sortState.column] || '';
        if (valA < valB) return state.sortState.direction === 'asc' ? -1 : 1;
        if (valA > valB) return state.sortState.direction === 'asc' ? 1 : -1;
        return 0;
    });

    dom.noDataMessage.classList.toggle('hidden', sortedAssets.length > 0);

    sortedAssets.forEach(asset => {
        const tr = document.createElement('tr');
        tr.dataset.id = asset.AssetID;
        let rowHtml = `<td class="relative px-6 py-4"><input type="checkbox" data-id="${asset.AssetID}" class="asset-checkbox h-4 w-4 rounded"></td>`;
        state.visibleColumns.forEach(colName => {
            let value = asset[colName] || '';
            // If column is AssignedTo, display the employee name instead of the ID
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
    updateBulkEditButtonVisibility();
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
        } else if (value && field.id !== 'assigned-to') { // assigned-to doesn't have a 'new' text input
            select.value = '--new--';
            if(newInp) {
                newInp.value = value;
                newInp.classList.remove('hidden');
            }
        } else {
            select.value = '';
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
 * @param {Array<Object>} allAssets - The list of all asset objects.
 */
export function renderEmployeeList(employeesToRender, allAssets) {
    if (!dom.employeeListContainer) return;
    dom.employeeListContainer.innerHTML = '';

    if (!employeesToRender || employeesToRender.length === 0) {
        dom.employeeListContainer.innerHTML = `<p class="text-gray-500 col-span-full text-center">No employees match the current filters.</p>`;
        return;
    }

    const sortedEmployees = [...employeesToRender].sort((a, b) => a.EmployeeName.localeCompare(b.EmployeeName));

    sortedEmployees.forEach(emp => {
        const assignedAssets = allAssets.filter(asset => asset.AssignedTo === emp.EmployeeID);
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
    if (!dom.employeeDepartmentFilter) return;
    const departments = [...new Set(state.allEmployees.map(e => e.Department).filter(Boolean))].sort();
    const currentVal = dom.employeeDepartmentFilter.value;
    dom.employeeDepartmentFilter.innerHTML = '<option value="">All Departments</option>';
    departments.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept;
        option.textContent = dept;
        dom.employeeDepartmentFilter.appendChild(option);
    });
    dom.employeeDepartmentFilter.value = currentVal;
}


/**
 * Shows/hides the "Add New..." text input for a dynamic select dropdown.
 * @param {HTMLSelectElement} selectElement - The dropdown element.
 * @param {HTMLInputElement} newElement - The text input element.
 */
export function handleDynamicSelectChange(selectElement, newElement) {
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
