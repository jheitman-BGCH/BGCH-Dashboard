// JS/store.js

/**
 * @fileoverview This file implements a simple Redux-like state management pattern.
 * It centralizes the application's state and logic for updating it.
 */

// 1. Defines the initial shape of the application's state.
const initialState = {
    gapiInited: false,
    gisInited: false,
    tokenClient: null,
    allAssets: [],
    allEmployees: [],
    allSites: [],
    allRooms: [],
    allContainers: [],
    spatialLayoutData: [],
    sheetIds: {},
    visibleColumns: ["AssetName", "AssetType", "IDCode", "AssignedTo", "Condition"],
    filters: {
        searchTerm: '',
        site: '',
        room: '',
        container: '',
        AssetType: '',
        Condition: '',
        IntendedUserType: '',
        AssignedTo: '',
        ModelNumber: ''
    },
    employeeFilters: {
        searchTerm: '',
        Department: ''
    },
    sortState: {
        column: 'AssetName',
        direction: 'asc'
    },
    pagination: {
        currentPage: 1
    }
};

// 2. Defines and exports the types of actions that can modify the state.
export const actionTypes = {
    SET_GAPI_STATUS: 'SET_GAPI_STATUS',
    SET_GIS_STATUS: 'SET_GIS_STATUS',
    SET_TOKEN_CLIENT: 'SET_TOKEN_CLIENT',
    SET_APP_DATA: 'SET_APP_DATA',
    SET_VISIBLE_COLUMNS: 'SET_VISIBLE_COLUMNS',
    SET_FILTERS: 'SET_FILTERS',
    SET_EMPLOYEE_FILTERS: 'SET_EMPLOYEE_FILTERS',
    SET_SORT_STATE: 'SET_SORT_STATE',
    SET_CURRENT_PAGE: 'SET_CURRENT_PAGE',
};

// 3. The reducer function calculates the next state based on the current state and a dispatched action.
function reducer(state = initialState, action) {
    switch (action.type) {
        case actionTypes.SET_GAPI_STATUS:
            return { ...state, gapiInited: action.payload };
        case actionTypes.SET_GIS_STATUS:
            return { ...state, gisInited: action.payload };
        case actionTypes.SET_TOKEN_CLIENT:
            return { ...state, tokenClient: action.payload };
        case actionTypes.SET_APP_DATA:
            // When new data is loaded, reset pagination to the first page.
            return {
                ...state,
                ...action.payload,
                pagination: { ...state.pagination, currentPage: 1 }
            };
        case actionTypes.SET_VISIBLE_COLUMNS:
            return { ...state, visibleColumns: action.payload };
        case actionTypes.SET_FILTERS:
            // When filters change, reset pagination.
            return {
                ...state,
                filters: { ...state.filters, ...action.payload },
                pagination: { ...state.pagination, currentPage: 1 }
            };
        case actionTypes.SET_EMPLOYEE_FILTERS:
             return {
                ...state,
                employeeFilters: { ...state.employeeFilters, ...action.payload },
            };
        case actionTypes.SET_SORT_STATE:
             // When sorting changes, reset pagination.
            return {
                ...state,
                sortState: action.payload,
                pagination: { ...state.pagination, currentPage: 1 }
            };
        case actionTypes.SET_CURRENT_PAGE:
            return {
                ...state,
                pagination: { ...state.pagination, currentPage: action.payload }
            };
        default:
            return state;
    }
}

// 4. The store implementation that holds the state and notifies listeners of changes.
let state = reducer(undefined, {});
const listeners = [];

/**
 * Returns the current state tree of the application.
 * @returns {object} The current state.
 */
export function getState() {
    return state;
}

/**
 * Dispatches an action. This is the only way to trigger a state change.
 * @param {object} action A plain object describing the change.
 */
export function dispatch(action) {
    state = reducer(state, action);
    listeners.forEach(listener => listener());
}

/**
 * Adds a change listener. It will be called any time an action is dispatched.
 * @param {function} listener A callback to be invoked on each dispatch.
 * @returns {function} A function to remove this change listener.
 */
export function subscribe(listener) {
    listeners.push(listener);
    return () => {
        const index = listeners.indexOf(listener);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    };
}
