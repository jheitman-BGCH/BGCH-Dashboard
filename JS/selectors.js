/**
 * @fileoverview Memoized selectors for deriving data from the application state.
 *
 * Selectors are pure functions that take the state as an argument and return derived data.
 * Memoization ensures that the derived data is only recomputed when the relevant parts of the state change,
 * preventing expensive calculations on every render.
 */

import { filterData } from './filterService.js';
import { ITEMS_PER_PAGE, CHART_COLORS } from './state.js';

/**
 * A simple memoization utility. It caches the result of a function based on its arguments.
 * @param {Function} func The function to memoize.
 * @returns {Function} The memoized function.
 */
function memoize(func) {
    let lastArgs = null;
    let lastResult = null;
    return (...args) => {
        if (
            lastArgs &&
            args.length === lastArgs.length &&
            args.every((arg, i) => arg === lastArgs[i])
        ) {
            return lastResult;
        }
        lastArgs = args;
        lastResult = func(...args);
        return lastResult;
    };
}

// --- Base Data Transformation Selectors ---

/**
 * Creates a map of assets by their ID for fast O(1) lookups.
 * @param {Array<Object>} allAssets - The array of all assets.
 * @returns {Map<string, Object>} A map where keys are AssetIDs and values are asset objects.
 */
export const selectAssetsById = memoize((allAssets) =>
    new Map(allAssets.map(asset => [asset.AssetID, asset]))
);

export const selectSitesById = memoize((allSites) =>
    new Map(allSites.map(site => [site.SiteID, site]))
);

export const selectRoomsById = memoize((allRooms) =>
    new Map(allRooms.map(room => [room.RoomID, room]))
);

export const selectContainersById = memoize((allContainers) =>
    new Map(allContainers.map(container => [container.ContainerID, container]))
);

/**
 * Creates a map of employees by their ID for fast O(1) lookups.
 * @param {Array<Object>} allEmployees - The array of all employees.
 * @returns {Map<string, Object>} A map where keys are EmployeeIDs and values are employee objects.
 */
export const selectEmployeesById = memoize((allEmployees) =>
    new Map(allEmployees.map(emp => [emp.EmployeeID, emp]))
);

/**
 * Creates a map of employees by their name for filtering.
 * @param {Array<Object>} allEmployees - The array of all employees.
 * @returns {Map<string, Object>} A map where keys are EmployeeNames.
 */
export const selectEmployeesByName = memoize((allEmployees) =>
    new Map(allEmployees.map(emp => [emp.EmployeeName, emp]))
);


/**
 * Enriches the assets list by adding the employee's name to each asset.
 * This prevents repeated lookups in the UI rendering layer.
 * @param {Array<Object>} allAssets - The array of all assets.
 * @param {Map<string, Object>} employeesById - The map of employees by ID.
 * @returns {Array<Object>} A new array of assets with an `AssignedToName` property.
 */
export const selectEnrichedAssets = memoize((allAssets, employeesById) => {
    return allAssets.map(asset => {
        const employee = employeesById.get(asset.AssignedTo);
        return {
            ...asset,
            AssignedToName: employee ? employee.EmployeeName : (asset.AssignedTo || ''),
        };
    });
});


// --- Asset Filtering and Sorting Selectors ---

/**
 * Filters the list of enriched assets based on the current filter state.
 * @param {Array<Object>} enrichedAssets - The assets with employee names.
 * @param {Object} filters - The current filter values.
 * @param {string} searchTerm - The current search term.
 * @param {Object} fullState - The entire application state for complex lookups.
 * @returns {Array<Object>} The filtered list of assets.
 */
export const selectFilteredAssets = memoize((enrichedAssets, filters, searchTerm, fullState) => {
    return filterData(enrichedAssets, searchTerm, null, filters, fullState);
});

/**
 * Sorts the list of filtered assets based on the current sort state.
 * @param {Array<Object>} filteredAssets - The assets that have already been filtered.
 * @param {Object} sortState - The current sort column and direction.
 * @returns {Array<Object>} The sorted list of assets.
 */
export const selectSortedAssets = memoize((filteredAssets, sortState) => {
    return [...filteredAssets].sort((a, b) => {
        // Use the enriched 'AssignedToName' for sorting if that's the selected column.
        const column = sortState.column === 'AssignedTo' ? 'AssignedToName' : sortState.column;
        const valA = a[column] || '';
        const valB = b[column] || '';
        if (valA < valB) return sortState.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortState.direction === 'asc' ? 1 : -1;
        return 0;
    });
});

/**
 * Paginates the sorted list of assets.
 * @param {Array<Object>} sortedAssets - The assets that have been filtered and sorted.
 * @param {number} currentPage - The current page number.
 * @returns {Object} An object containing the assets for the current page and total pages.
 */
export const selectPaginatedAssets = (sortedAssets, currentPage) => {
    const totalPages = Math.ceil(sortedAssets.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedItems = sortedAssets.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    return { paginatedItems, totalPages };
};


// --- Employee Filtering and Sorting Selectors ---

export const selectFilteredEmployees = memoize((allEmployees, filters, searchTerm) => {
    const searchFields = ['EmployeeName', 'Title', 'Email', 'Department'];
    return filterData(allEmployees, searchTerm, searchFields, filters);
});

export const selectSortedEmployees = memoize((filteredEmployees) => {
    return [...filteredEmployees].sort((a, b) => a.EmployeeName.localeCompare(b.EmployeeName));
});


// --- Chart Data Selectors ---

export const selectChartData = memoize((enrichedAssets, allEmployees) => {
    const processData = (key) => {
        const displayKey = key === 'AssignedTo' ? 'AssignedToName' : key;
        const sourceData = key === 'AssignedTo' ? enrichedAssets : enrichedAssets;

        const counts = sourceData.reduce((acc, item) => {
            const value = item[displayKey] || 'Uncategorized';
            if (value !== 'Uncategorized' && value !== '') {
                 acc[value] = (acc[value] || 0) + 1;
            }
            return acc;
        }, {});
        
        const sortedEntries = Object.entries(counts).sort(([, a], [, b]) => b - a);

        return {
            labels: sortedEntries.map(([label]) => label),
            data: sortedEntries.map(([, count]) => count)
        };
    };
    
    const createChartConfig = (data, label) => ({
        labels: data.labels,
        datasets: [{ label, data: data.data, backgroundColor: CHART_COLORS, borderWidth: 1 }]
    });

    return {
        siteData: createChartConfig(processData('Site'), 'Assets per Site'),
        conditionData: createChartConfig(processData('Condition'), 'Assets by Condition'),
        typeData: createChartConfig(processData('AssetType'), 'Assets by Type'),
        employeeData: createChartConfig(processData('AssignedTo'), 'Assignments per Employee'),
    };
});

// --- Hierarchical Data Selectors ---

export const selectRoomsBySiteId = memoize((state, siteId) => {
    if (!siteId) return [];
    return state.allRooms.filter(room => room.SiteID === siteId);
});

export const selectContainersByParentId = memoize((state, parentId) => {
    if (!parentId) return [];
    return state.allContainers.filter(container => container.ParentID === parentId);
});

/**
 * Tries to find the ParentObjectID from old deprecated fields (Site, Location, Container).
 */
const findIdFromOldData = memoize((asset, allSites, allRooms, allContainers) => {
    if (!asset.Site) return null;
    const site = allSites.find(s => s.SiteName === asset.Site);
    if (!site) return null;

    if (!asset.Location) return null;
    const room = allRooms.find(r => r.RoomName === asset.Location && r.SiteID === site.SiteID);
    if (!room) return null;

    if (asset.Container) {
        const container = allContainers.find(c => c.ContainerName === asset.Container && c.ParentID === room.RoomID);
        return container ? container.ContainerID : room.RoomID; // Fallback to room ID if container not found
    }

    return room.RoomID;
});

/**
 * Gets the definitive ParentObjectID for an asset, using the new field first and falling back to old ones.
 */
export const selectResolvedAssetParentId = (asset, state) => {
    return asset.ParentObjectID || findIdFromOldData(asset, state.allSites, state.allRooms, state.allContainers);
};

/**
 * Builds the full hierarchical location path for a given parent ID.
 */
export const selectFullLocationPath = memoize((state, parentId) => {
    const path = [];
    if (!parentId) return path;

    const sitesById = selectSitesById(state.allSites);
    const roomsById = selectRoomsById(state.allRooms);
    const containersById = selectContainersById(state.allContainers);

    let currentId = parentId;
    // Loop up the chain of parents until there are no more
    while (currentId) {
        const container = containersById.get(currentId);
        if (container) {
            path.push(container);
            currentId = container.ParentID;
            continue;
        }

        const room = roomsById.get(currentId);
        if (room) {
            path.push(room);
            const site = sitesById.get(room.SiteID);
            if (site) {
                path.push(site);
            }
            // A room's parent is a site, which is the top of the hierarchy.
            break;
        }
        
        // If we reach here, the ID was not found in rooms or containers.
        break; 
    }

    return path.reverse(); // Reverse to get Site > Room > Container order
});


export const selectFullLocationPathString = (state, parentId) => {
    const path = selectFullLocationPath(state, parentId);
    return path.map(p => p.SiteName || p.RoomName || p.ContainerName).join(' > ');
};

