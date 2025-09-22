/* global gapi, API_KEY, CLIENT_ID, initializeUI */

// This file handles the application's entry point, Google API initialization,
// and the user authentication flow.

let authorizeButton;
let signoutButton;

/**
 * Entry point, called when the GAPI script is loaded from index.html.
 */
function onGapiLoad() {
    gapi.load('client:auth2', initClient);
}

/**
 * Initializes the GAPI client, sets up auth listeners, and binds UI events.
 */
function initClient() {
    authorizeButton = document.getElementById('authorize_button');
    signoutButton = document.getElementById('signout_button');

    gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
    }).then(() => {
        // Listen for sign-in state changes.
        gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);

        // Handle the initial sign-in state.
        updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());

        authorizeButton.onclick = handleAuthClick;
        signoutButton.onclick = handleSignoutClick;
    }).catch(error => {
        console.error("Error initializing GAPI client:", error);
        const contentDiv = document.getElementById('content');
        if(contentDiv) {
            contentDiv.innerHTML = `<p style="color: red; padding: 1em;">
                <strong>Error initializing application.</strong><br>
                Please ensure you have created an <code>api-keys.js</code> file with your Google API Key and Client ID, 
                and that the Google Sheets API is enabled in your Google Cloud project.
            </p>`;
        }
    });
}

/**
 * Handles changes in the user's sign-in status, updating the UI and loading data.
 * @param {boolean} isSignedIn - True if the user is signed in.
 */
function updateSigninStatus(isSignedIn) {
    const contentDiv = document.getElementById('content');
    if (isSignedIn) {
        authorizeButton.style.display = 'none';
        signoutButton.style.display = 'block';
        if (contentDiv) contentDiv.innerHTML = '<p>Loading data...</p>';
        loadApplicationData();
    } else {
        authorizeButton.style.display = 'block';
        signoutButton.style.display = 'none';
        if (contentDiv) contentDiv.innerHTML = '<p>Please sign in to view data.</p>';
    }
}

/**
 * Initiates the Google sign-in process.
 */
function handleAuthClick() {
    gapi.auth2.getAuthInstance().signIn();
}

/**
 * Initiates the Google sign-out process.
 */
function handleSignoutClick() {
    gapi.auth2.getAuthInstance().signOut();
}

/**
 * Loads all application data using the AppState module and then initializes the UI.
 */
async function loadApplicationData() {
    console.log("Authentication successful. Loading application data...");
    
    // Call the new centralized state initializer
    await window.AppState.initializeState();

    if (window.AppState.isLoaded) {
        console.log("Data loaded successfully. Initializing UI.");
        // This function is expected to be in ui.js.
        if (typeof initializeUI === 'function') {
            initializeUI();
        } else {
            console.warn('Global function initializeUI() not found. The UI will not be rendered.');
        }
    } else {
        console.error("A critical error occurred while loading application data. UI cannot be initialized.");
        const contentDiv = document.getElementById('content');
        if(contentDiv) {
            contentDiv.innerHTML = `<p style="color: red; padding: 1em;"><strong>Failed to load data from Google Sheets.</strong><br> Please check the browser console for errors and verify spreadsheet permissions.</p>`;
        }
    }
}
