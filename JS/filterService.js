/**
 * @fileoverview Service for unified filtering and searching logic across the application.
 */

/**
 * Recursively finds all child container IDs starting from a given parent ID.
 * @param {Object} fullState - The entire application state.
 * @param {string} parentId - The ID of the room or container to start from.
 * @returns {Set<string>} A set of all descendant container IDs.
 */
function getChildContainerIdsRecursive(fullState, parentId) {
    const children = new Set();
    const directChildren = fullState.allContainers.filter(c => c.ParentID === parentId);
    for (const child of directChildren) {
        children.add(child.ContainerID);
        const grandchildren = getChildContainerIdsRecursive(fullState, child.ContainerID);
        grandchildren.forEach(gc => children.add(gc));
    }
    return children;
}


/**
 * A generic function to filter and search an array of objects based on multiple criteria.
 * @param {Array<Object>} data - The array of objects to filter.
 * @param {string} searchTerm - The string to search for.
 * @param {Array<string>|null} searchFields - An array of object keys to search within. If null, all object values are searched.
 * @param {Object} filters - Key-value pairs for filtering.
 * @param {Object} [fullState={}] - The entire application state, needed for complex lookups.
 * @returns {Array<Object>} The filtered array.
 */
export function filterData(data, searchTerm, searchFields, filters = {}, fullState = {}) {
    const lowercasedSearchTerm = searchTerm.toLowerCase();
    const employeesByName = fullState.employeesByName;

    // --- DEBUGGING START ---
    // Log the active filters at the start of the function call
    const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    if (Object.keys(activeFilters).length > 0 || searchTerm) {
        console.groupCollapsed(`[Filter Service] Applying filters...`);
        console.log("Search Term:", searchTerm || "None");
        console.log("Active Filters:", activeFilters);
        console.groupEnd();
    }
    // --- DEBUGGING END ---

    return data.filter(item => {
        // 1. Match search term
        const matchesSearch = lowercasedSearchTerm
            ? (searchFields
                ? [...searchFields, 'AssignedToName'].some(field => String(item[field] || '').toLowerCase().includes(lowercasedSearchTerm))
                : Object.values(item).some(val => String(val).toLowerCase().includes(lowercasedSearchTerm))
            )
            : true;

        if (!matchesSearch) return false;

        // 2. Match hierarchical location filters
        const { site, room, container } = filters;

        if (site && item.resolvedSiteId !== site) {
            return false;
        }

        let validParentIDs = null;
        if (container) {
            validParentIDs = new Set([container, ...getChildContainerIdsRecursive(fullState, container)]);
        } else if (room) {
            validParentIDs = new Set([room, ...getChildContainerIdsRecursive(fullState, room)]);
        }

        if (validParentIDs && !validParentIDs.has(item.resolvedParentId)) {
            return false;
        }


        // 3. Match other flat filters
        const matchesFilters = Object.entries(filters).every(([key, value]) => {
            if (['site', 'room', 'container', 'searchTerm'].includes(key) || !value) {
                return true;
            }

            const itemValue = item[key] || '';
            let isMatch = false;

            if (key === 'AssignedTo') {
                if (!employeesByName) return false; 
                const employee = employeesByName.get(value);
                isMatch = employee ? itemValue === employee.EmployeeID : false;
            } else {
                isMatch = String(itemValue).toLowerCase() === String(value).toLowerCase();
            }
            
            // --- DEBUGGING START ---
            // If it's a non-location filter and it fails, log the details.
            if (!isMatch) {
                 console.log(
                    `%c[Filter Fail]%c Item: "${item.AssetName}" | Filter: "${key}" | Expected: "${value}" | Got: "${itemValue}"`,
                    "color: red; font-weight: bold;",
                    "color: black;"
                );
            }
            // --- DEBUGGING END ---

            return isMatch;
        });

        return matchesFilters;
    });
}

