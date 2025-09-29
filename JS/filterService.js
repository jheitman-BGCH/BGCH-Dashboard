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

    // --- Hierarchical Location Filtering ---
    let validParentIDs = null; // null means don't filter by parent
    const { site, room, container } = filters;

    if (container) {
        validParentIDs = new Set([container]);
        const children = getChildContainerIdsRecursive(fullState, container);
        children.forEach(c => validParentIDs.add(c));
    } else if (room) {
        validParentIDs = new Set([room]);
        const children = getChildContainerIdsRecursive(fullState, room);
        children.forEach(c => validParentIDs.add(c));
    } else if (site) {
        validParentIDs = new Set();
        const roomsInSite = fullState.allRooms.filter(r => r.SiteID === site);
        for (const r of roomsInSite) {
            validParentIDs.add(r.RoomID);
            const children = getChildContainerIdsRecursive(fullState, r.RoomID);
            children.forEach(c => validParentIDs.add(c));
        }
    }

    return data.filter(item => {
        // 1. Match search term
        const matchesSearch = lowercasedSearchTerm
            ? (searchFields
                ? [...searchFields, 'AssignedToName'].some(field => String(item[field] || '').toLowerCase().includes(lowercasedSearchTerm))
                : Object.values(item).some(val => String(val).toLowerCase().includes(lowercasedSearchTerm))
            )
            : true;

        if (!matchesSearch) return false;

        // 2. Match hierarchical location filter
        if (validParentIDs && !validParentIDs.has(item.ParentID)) {
            return false;
        }

        // 3. Match other flat filters
        const matchesFilters = Object.entries(filters).every(([key, value]) => {
            // Skip handled hierarchical filters, the search term, and empty filters
            if (['site', 'room', 'container', 'searchTerm'].includes(key) || !value) {
                return true;
            }

            if (key === 'AssignedTo' && employeesByName) {
                const employee = employeesByName.get(value);
                // The item's AssignedTo is an ID, the filter value is a name.
                return employee ? item[key] === employee.EmployeeID : false;
            }

            // Default filter behavior: case-insensitive match.
            return String(item[key] || '').toLowerCase() === String(value).toLowerCase();
        });

        return matchesFilters;
    });
}
