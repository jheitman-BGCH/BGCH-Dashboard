/* global gapi */

// This file provides a universal service for reading from and writing to Google Sheets.
// It handles header sanitization to prevent data mismatches and offers a full-sync write method.

// Configuration
const SPREADSHEET_ID = '10a_4v14T1n2ag553kChh__gGgwzvP2b2A3vc5aPj-1g';

// Centralized configuration for all sheets.
// This will store original headers and the mapping to sanitized keys after the first read.
const sheetConfigurations = {
    'Asset': { range: 'Asset!A:S', headers: [], headerMap: {} },
    'Rooms': { range: 'Rooms!A:D', headers: [], headerMap: {} },
    'Spatial Layout': { range: 'Spatial Layout!A:J', headers: [], headerMap: {} }
};

/**
 * Sanitizes a header string to be used as a consistent JavaScript object key.
 * Converts "Some Header Name" to "someHeaderName".
 * @param {string} header The original header string from the sheet.
 * @returns {string} The sanitized camelCase key.
 */
function sanitizeHeader(header) {
    if (!header || typeof header !== 'string') return '';
    return header
        .trim()
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
        .replace(/\s+(.)/g, (_match, group1) => group1.toUpperCase()) // Convert to camelCase
        .replace(/\s/g, '') // Remove any remaining spaces
        .replace(/^(.)/, (_match, group1) => group1.toLowerCase()); // Ensure first letter is lowercase
}

/**
 * Universal method to read data from any configured sheet.
 * It fetches all rows, uses the first row as headers, sanitizes them for use
 * as object keys, and returns an array of objects.
 * @param {string} sheetName The name of the sheet (e.g., 'Asset', 'Rooms').
 * @returns {Promise<Array<Object>|null>} A promise that resolves to the data as an array of objects, or null on error.
 */
async function readSheetData(sheetName) {
    const config = sheetConfigurations[sheetName];
    if (!config) {
        console.error(`No configuration found for sheet: ${sheetName}`);
        return null;
    }

    console.log(`Reading data from sheet: ${sheetName}`);
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: config.range,
        });

        const values = response.result.values;
        if (!values || values.length < 2) { // Need at least a header row and one data row
            console.warn(`No data found in sheet: ${sheetName}`);
            return [];
        }

        const originalHeaders = values[0];
        config.headers = originalHeaders; // Store original headers for writing back
        config.headerMap = {};

        const sanitizedHeaders = originalHeaders.map(header => {
            const sanitized = sanitizeHeader(header);
            if (sanitized) {
                config.headerMap[sanitized] = header; // Map sanitized key back to original header
            }
            return sanitized;
        });

        const data = values.slice(1).map(row => {
            const obj = {};
            sanitizedHeaders.forEach((key, i) => {
                if (key) { // Only create properties for non-empty headers
                    obj[key] = row[i] !== undefined && row[i] !== null ? row[i] : '';
                }
            });
            return obj;
        });

        console.log(`Successfully parsed ${data.length} rows from ${sheetName}.`);
        return data;

    } catch (err) {
        console.error(`Error reading from sheet ${sheetName}:`, err);
        if (err.result && (err.result.error.status === 'UNAUTHENTICATED' || err.result.error.status === 'PERMISSION_DENIED')) {
            alert('Authentication error. Please sign in again and grant necessary permissions.');
            // This can be replaced with a more user-friendly modal.
            if (typeof handleAuthClick === 'function') {
                handleAuthClick();
            }
        }
        return null;
    }
}

/**
 * Universal method to write data to any configured sheet.
 * This function performs a full sync: it clears all data (except headers)
 * and writes the provided data array back to the sheet.
 * @param {string} sheetName The name of the sheet (e.g., 'Asset', 'Rooms').
 * @param {Array<Object>} data The array of objects to write. The objects must use sanitized keys.
 * @returns {Promise<boolean>} A promise that resolves to true on success, false on failure.
 */
async function writeSheetData(sheetName, data) {
    const config = sheetConfigurations[sheetName];
    if (!config) {
        console.error(`No configuration found for sheet: ${sheetName}`);
        return false;
    }
    if (config.headers.length === 0) {
        console.error(`Headers for sheet '${sheetName}' are not loaded. Must read data before writing.`);
        return false;
    }

    console.log(`Writing ${data.length} rows to sheet: ${sheetName}`);
    
    // Create a reverse map from original header to sanitized key for efficient lookup.
    const originalToSanitizedMap = Object.fromEntries(
        Object.entries(config.headerMap).map(([sanitized, original]) => [original, sanitized])
    );

    // Convert array of objects back to 2D array of values, in the original header order.
    const values = data.map(obj => {
        return config.headers.map(header => {
            const sanitizedKey = originalToSanitizedMap[header];
            return obj[sanitizedKey] !== undefined && obj[sanitizedKey] !== null ? obj[sanitizedKey] : '';
        });
    });

    try {
        // 1. Clear existing data (from row 2 downwards).
        const sheetId = sheetName.includes('!') ? sheetName.split('!')[0] : sheetName;
        const rangeEndColumn = config.range.split(':')[1].replace(/\d+/g, '');
        const clearRange = `${sheetId}!A2:${rangeEndColumn}`;
        
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: SPREADSHEET_ID,
            range: clearRange,
        });

        // 2. Write new data (if any).
        if (values.length > 0) {
             const writeRange = `${sheetId}!A2`;
             const resource = { values };
             await gapi.client.sheets.spreadsheets.values.update({
                 spreadsheetId: SPREADSHEET_ID,
                 range: writeRange,
                 valueInputOption: 'USER_ENTERED',
                 resource,
             });
        }

        console.log(`Successfully wrote ${values.length} rows to ${sheetName}.`);
        return true;
    } catch (err) {
        console.error(`Error writing to sheet ${sheetName}:`, err);
        return false;
    }
}

// Expose the service on the window object for global access from other scripts.
window.sheetsService = {
    readSheetData,
    writeSheetData,
};
