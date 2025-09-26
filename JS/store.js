// JS/store.js

/**
 * @fileoverview A simple, reactive state management store based on the Observer pattern.
 */

// The single source of truth for the application's state.
// We keep this as a mutable let variable that the reducer will replace.
let state = {
    tokenClient: null,
    gapiInited: false,
    gisInited: false,
    allAssets: [],
    allEmployees: [],
    allRooms: [],
    spatialLayoutData: [],
    visibleColumns: [],
    sortState: { column: 'AssetName', direction: 'asc' },
    sheetIds: {},
    pagination: {
        currentPage: 1,
    },
};

// A list of callback functions to be executed when the state changes.
const subscribers = [];

// --- Action Types ---
export const actionTypes = {
    SET_GAPI_STATUS: 'SET_GAPI_STATUS',
    SET_GIS_STATUS: 'SET_GIS_STATUS',
    SET_TOKEN_CLIENT: 'SET_TOKEN_CLIENT',
    SET_APP_DATA: 'SET_APP_DATA',
    SET_VISIBLE_COLUMNS: 'SET_VISIBLE_COLUMNS',
    SET_SORT_STATE: 'SET_SORT_STATE',
    SET_CURRENT_PAGE: 'SET_CURRENT_PAGE',
};

/**
 * The reducer function. It takes the current state and an action, and returns the new state.
 * It is the only place where state mutations should occur. It must be a "pure" function.
 * @param {Object} currentState - The current state.
 * @param {Object} action - The action to be processed.
 * @returns {Object} The new state.
 */
function reducer(currentState, action) {
    switch (action.type) {
        case actionTypes.SET_GAPI_STATUS:
            return { ...currentState, gapiInited: action.payload };
        
        case actionTypes.SET_GIS_STATUS:
            return { ...currentState, gisInited: action.payload };

        case actionTypes.SET_TOKEN_CLIENT:
            return { ...currentState, tokenClient: action.payload };

        case actionTypes.SET_APP_DATA:
            // This action replaces all the core data from the spreadsheet in one go.
            return {
                ...currentState,
                allAssets: action.payload.allAssets || [],
                allEmployees: action.payload.allEmployees || [],
                allRooms: action.payload.allRooms || [],
                spatialLayoutData: action.payload.spatialLayoutData || [],
                sheetIds: action.payload.sheetIds || {},
            };

        case actionTypes.SET_VISIBLE_COLUMNS:
            return { ...currentState, visibleColumns: action.payload };

        case actionTypes.SET_SORT_STATE:
            return { ...currentState, sortState: action.payload };
        
        case actionTypes.SET_CURRENT_PAGE:
            // To update a nested property immutably, we copy both levels.
            return {
                ...currentState,
                pagination: { ...currentState.pagination, currentPage: action.payload },
            };

        default:
            // If the action type is unknown, return the state unchanged.
            return currentState;
    }
}


/**
 * Allows a module to register a callback function that will be called whenever the state changes.
 * @param {Function} callback - The function to call on state updates.
 * @returns {Function} An unsubscribe function to remove the listener.
 */
export function subscribe(callback) {
    subscribers.push(callback);
    // Return an unsubscribe function to prevent memory leaks
    return () => {
        const index = subscribers.indexOf(callback);
        if (index > -1) {
            subscribers.splice(index, 1);
        }
    };
}

/**
 * Dispatches an action to update the state via the reducer and notifies all subscribers.
 * @param {Object} action - An object describing the change (e.g., { type: 'SET_ASSETS', payload: [...] }).
 */
export function dispatch(action) {
    // Calculate the new state by running the reducer.
    const newState = reducer(state, action);

    // Replace the old state with the new state.
    state = newState;
    
    // Notify all subscribers that the state has changed.
    console.log(`Dispatched Action: ${action.type}`);
    subscribers.forEach(callback => callback());
}

/**
 * Returns a copy of the current state.
 * @returns {Object} The current application state.
 */
export function getState() {
    // Returning the state directly is fine as the reducer ensures it's a new object.
    return state;
}

