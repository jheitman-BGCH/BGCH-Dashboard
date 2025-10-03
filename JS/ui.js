// JS/ui.js

/**
 * A centralized object to hold references to frequently accessed DOM elements.
 * This improves performance by reducing the number of calls to document.getElementById.
 */
export const dom = {
    // Auth
    authSection: document.getElementById('auth-section'),
    authorizeButton: document.getElementById('authorize_button'),
    signoutButton: document.getElementById('signout_button'),

    // Main Dashboard
    dashboardSection: document.getElementById('dashboard-section'),
    loadingIndicator: document.getElementById('loading-indicator'),
    refreshDataBtn: document.getElementById('refresh-data-btn'),

    // Tabs
    inventoryTab: document.getElementById('inventory-tab'),
    overviewTab: document.getElementById('overview-tab'),
    employeesTab: document.getElementById('employees-tab'),
    visualInventoryTab: document.getElementById('visual-inventory-tab'),
    
    // Panels
    inventoryPanel: document.getElementById('inventory-panel'),
    overviewPanel: document.getElementById('overview-panel'),
    employeesPanel: document.getElementById('employees-panel'),
    
    // Asset Table & Filtering
    assetTableHead: document.getElementById('asset-table-head'),
    assetTableBody: document.getElementById('asset-table-body'),
    noDataMessage: document.getElementById('no-data-message'),
    filterSearch: document.getElementById('filter-search'),
    filterSite: document.getElementById('filter-site'),
    filterRoom: document.getElementById('filter-room'),
    filterContainer: document.getElementById('filter-container'),
    filterAssetType: document.getElementById('filter-asset-type'),
    filterCondition: document.getElementById('filter-condition'),
    filterIntendedUserType: document.getElementById('filter-intended-user-type'),
    filterAssignedTo: document.getElementById('filter-assigned-to'),
    filterModelNumber: document.getElementById('filter-model-number'),
    customizeColsBtn: document.getElementById('customize-cols-btn'),
    paginationControlsTop: document.getElementById('pagination-controls-top'),
    paginationControlsBottom: document.getElementById('pagination-controls-bottom'),

    // Buttons
    addAssetBtn: document.getElementById('add-asset-btn'),
    addContainerBtn: document.getElementById('add-container-btn'),
    bulkEditBtn: document.getElementById('bulk-edit-btn'),

    // Modals
    assetModal: document.getElementById('asset-modal'),
    assetForm: document.getElementById('asset-form'),
    modalTitle: document.getElementById('modal-title'),
    containerModal: document.getElementById('container-modal'),
    containerForm: document.getElementById('container-form'),
    columnModal: document.getElementById('column-modal'),
    columnCheckboxes: document.getElementById('column-checkboxes'),
    detailModal: document.getElementById('detail-modal'),
    contentsModal: document.getElementById('contents-modal'),
    bulkEditModal: document.getElementById('bulk-edit-modal'),
    bulkEditForm: document.getElementById('bulk-edit-form'),
    employeeModal: document.getElementById('employee-modal'),
    employeeForm: document.getElementById('employee-form'),
    employeeDetailModal: document.getElementById('employee-detail-modal'),
    roomModal: document.getElementById('room-modal'),
    roomForm: document.getElementById('room-form'),
    
    // Charts
    siteChartCanvas: document.getElementById('site-chart'),
    conditionChartCanvas: document.getElementById('condition-chart'),
    typeChartCanvas: document.getElementById('type-chart'),
    employeeChartCanvas: document.getElementById('employee-chart'),
    siteChartType: document.getElementById('site-chart-type'),
    conditionChartType: document.getElementById('condition-chart-type'),
    typeChartType: document.getElementById('type-chart-type'),
    employeeChartType: document.getElementById('employee-chart-type'),

    // Employee Panel
    employeeListContainer: document.getElementById('employee-list-container'),
    addEmployeeBtn: document.getElementById('add-employee-btn'),
    employeeSearch: document.getElementById('employee-search'),
    employeeDepartmentFilter: document.getElementById('employee-department-filter'),

    // Visual Inventory
    visualInventoryPanel: document.getElementById('visual-inventory-panel'),
    viSiteSelector: document.getElementById('vi-site-selector'),
    roomSelector: document.getElementById('room-selector'),
    createRoomBtn: document.getElementById('create-room-btn'),
    breadcrumbContainer: document.getElementById('breadcrumb-container'),
    objectToolbar: document.getElementById('object-toolbar'),
    unplacedAssetsList: document.getElementById('unplaced-assets-list'),
    unplacedAssetSearch: document.getElementById('unplaced-asset-search'),
    unplacedGroupBy: document.getElementById('unplaced-group-by'),
    unplacedSortBtn: document.getElementById('unplaced-sort-btn'),
    unplacedSortIcon: document.getElementById('unplaced-sort-icon'),
    gridContainer: document.getElementById('grid-container'),
    drawWallBtn: document.getElementById('draw-wall-btn'),
    
    // Radial Menu
    radialMenu: document.getElementById('radial-menu'),
    radialRenameUse: document.getElementById('radial-rename-use'),
    radialFlipUse: document.getElementById('radial-flip-use'),
    radialRotateUse: document.getElementById('radial-rotate-use'),
    radialResizeUse: document.getElementById('radial-resize-use'),
    radialOpenUse: document.getElementById('radial-open-use'),
    radialDeleteUse: document.getElementById('radial-delete-use'),
    
    // Message Box
    messageBox: document.getElementById('message-box'),
    messageText: document.getElementById('message-text'),
};

/**
 * Toggles the visibility of a modal.
 * @param {HTMLElement} modal - The modal element to show or hide.
 * @param {boolean} show - True to show the modal, false to hide it.
 */
export function toggleModal(modal, show) {
    if (show) {
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}

/**
 * Shows a temporary message box to the user.
 * @param {string} message - The message to display.
 * @param {'success'|'error'|'info'} type - The type of message, which determines its color.
 * @param {number} duration - How long the message should be visible in milliseconds.
 */
export function showMessage(message, type = 'info', duration = 3000) {
    const messageBox = dom.messageBox;
    const messageText = dom.messageText;

    messageText.textContent = message;
    
    // Reset classes
    messageBox.className = 'fixed top-5 right-5 z-50 p-4 rounded-lg shadow-lg text-white';

    switch (type) {
        case 'success':
            messageBox.classList.add('bg-green-600');
            break;
        case 'error':
            messageBox.classList.add('bg-red-600');
            break;
        default:
            messageBox.classList.add('bg-blue-600');
            break;
    }

    messageBox.classList.remove('hidden');
    setTimeout(() => {
        messageBox.classList.add('hidden');
    }, duration);
}

/**
 * Populates a <select> element with options from a data array.
 * @param {HTMLSelectElement} selectElement - The <select> element to populate.
 * @param {Array<Object>} data - The array of objects to create options from.
 * @param {string} valueKey - The key in the data objects to use for the option's value.
 * @param {string} textKey - The key in the data objects to use for the option's displayed text.
 * @param {Object} [options={}] - Additional configuration options.
 * @param {string} [options.initialOptionText] - Text for an initial, non-selectable option (e.g., "-- Select --").
 * @param {boolean} [options.includeAll=false] - Whether to include an "All" option.
 * @param {string} [options.allOptionText="All"] - Text for the "All" option.
 * @param {boolean} [options.includeNone=false] - Whether to include a "None" option.
 * @param {string} [options.noneOptionText="None"] - Text for the "None" option.
 * @param {boolean} [options.clear=true] - Whether to clear existing options before populating.
 */
export function populateSelect(selectElement, data, valueKey, textKey, options = {}) {
    const { 
        initialOptionText, 
        includeAll = false, 
        allOptionText = "All",
        includeNone = false,
        noneOptionText = "None",
        clear = true 
    } = options;

    if (clear) {
        selectElement.innerHTML = '';
    }

    if (initialOptionText) {
        const initialOption = document.createElement('option');
        initialOption.value = '';
        initialOption.textContent = initialOptionText;
        selectElement.appendChild(initialOption);
    }
    if (includeAll) {
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = allOptionText;
        selectElement.appendChild(allOption);
    }
     if (includeNone) {
        const noneOption = document.createElement('option');
        noneOption.value = 'none';
        noneOption.textContent = noneOptionText;
        selectElement.appendChild(noneOption);
    }

    const uniqueValues = new Set();

    data.forEach(item => {
        const value = item[valueKey];
        if (value && !uniqueValues.has(value)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = item[textKey];
            selectElement.appendChild(option);
            uniqueValues.add(value);
        }
    });
}

