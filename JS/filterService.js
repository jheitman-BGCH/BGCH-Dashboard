/**
 * @fileoverview Service for unified filtering and searching logic across the application.
 */

/**
 * A generic function to filter and search an array of objects based on multiple criteria.
 * @param {Array<Object>} data - The array of objects to filter.
 * @param {string} searchTerm - The string to search for.
 * @param {Array<string>|null} searchFields - An array of object keys to search within. If null, all object values are searched.
 * @param {Object} filters - Key-value pairs for exact (but case-insensitive) filtering.
 * @param {Object} [fullState={}] - The entire application state, needed for complex lookups (e.g., resolving employee names to IDs).
 * @returns {Array<Object>} The filtered array.
 */
export function filterData(data, searchTerm, searchFields, filters = {}, fullState = {}) {
    const lowercasedSearchTerm = searchTerm.toLowerCase();

    // Memoized selector for employeesByName is now passed in fullState.
    const employeesByName = fullState.employeesByName;

    return data.filter(item => {
        // 1. Match search term: Check if the search term appears in the specified fields or any value if no fields are specified.
        const matchesSearch = lowercasedSearchTerm
            ? (searchFields
                // For assets, we also want to search the enriched 'AssignedToName' field.
                ? [...searchFields, 'AssignedToName'].some(field => String(item[field] || '').toLowerCase().includes(lowercasedSearchTerm))
                : Object.values(item).some(val => String(val).toLowerCase().includes(lowercasedSearchTerm))
            )
            : true; // If no search term, it's a match.

        if (!matchesSearch) {
            return false;
        }

        // 2. Match filters: Check if the item passes all active dropdown filters.
        const matchesFilters = Object.entries(filters).every(([key, value]) => {
            if (!value) { // Skip if filter value is empty/falsy (e.g., "All").
                return true;
            }

            // Special handling for the 'AssignedTo' filter, which uses an EmployeeName from a dropdown
            // to filter assets that store an EmployeeID. We now use the fast lookup map.
            if (key === 'AssignedTo' && employeesByName) {
                const employee = employeesByName.get(value);
                return employee ? item[key] === employee.EmployeeID : false;
            }

            // Default filter behavior: case-insensitive match.
            return String(item[key] || '').toLowerCase() === String(value).toLowerCase();
        });

        return matchesFilters;
    });
}
