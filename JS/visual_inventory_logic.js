/* global AppState */

// This file manages the logic for the visual inventory grid, including
// rendering objects and handling drag-and-drop functionality.

// --- Constants and State ---
const GRID_CELL_SIZE = 50; // size of grid cells in pixels
let selectedRoomId = null;
let draggedElement = null;

/**
 * Initializes the visual inventory UI for a specific room.
 * @param {string} roomId - The ID of the room to display.
 */
function initVisualInventory(roomId) {
    selectedRoomId = roomId;
    const room = AppState.getRoomById(roomId);
    if (!room) {
        console.error(`Room with ID ${roomId} not found.`);
        return;
    }

    const gridContainer = document.getElementById('grid-container');
    gridContainer.innerHTML = ''; // Clear previous grid
    setupGrid(gridContainer, room);
    populateGridWithObjects(gridContainer, room);

    // Attach drag-and-drop listeners to the container to handle events efficiently.
    gridContainer.addEventListener('mousedown', onDragStart);
    gridContainer.addEventListener('mousemove', onDrag);
    gridContainer.addEventListener('mouseup', onDragEnd);
    gridContainer.addEventListener('mouseleave', onDragEnd); // Stop dragging if mouse leaves grid
}

/**
 * Sets up the CSS grid layout for the container based on room dimensions.
 * @param {HTMLElement} gridContainer - The container element for the grid.
 * @param {object} room - The room object from the application state.
 */
function setupGrid(gridContainer, room) {
    // Using sanitized keys: gridWidth and gridHeight
    gridContainer.style.gridTemplateColumns = `repeat(${room.gridWidth}, ${GRID_CELL_SIZE}px)`;
    gridContainer.style.gridTemplateRows = `repeat(${room.gridHeight}, ${GRID_CELL_SIZE}px)`;
    gridContainer.style.width = `${room.gridWidth * GRID_CELL_SIZE}px`;
    gridContainer.style.height = `${room.gridHeight * GRID_CELL_SIZE}px`;
}

/**
 * Populates the grid with objects (assets) based on spatial layout data.
 * @param {HTMLElement} gridContainer - The container element for the grid.
 * @param {object} room - The room object from the application state.
 */
function populateGridWithObjects(gridContainer, room) {
    // Using sanitized key: roomID
    const layouts = AppState.getLayoutsByRoomId(room.roomID);

    layouts.forEach(layout => {
        // Using sanitized key: referenceID
        const asset = AppState.getAssetById(layout.referenceID);
        if (!asset) return; // Skip if asset referenced in layout doesn't exist

        const objElement = document.createElement('div');
        objElement.className = 'grid-object';
        objElement.textContent = asset.assetName; // Using sanitized key: assetName
        objElement.setAttribute('data-instance-id', layout.instanceID); // Using sanitized key: instanceID

        // Position and size based on sanitized layout keys
        objElement.style.gridColumnStart = layout.posX;
        objElement.style.gridRowStart = layout.posY;
        objElement.style.gridColumnEnd = `span ${layout.width}`;
        objElement.style.gridRowEnd = `span ${layout.height}`;

        gridContainer.appendChild(objElement);
    });
}

// --- Drag and Drop Handlers ---

function onDragStart(e) {
    // Start drag only on a grid-object and with the left mouse button.
    if (!e.target.classList.contains('grid-object') || e.button !== 0) return;
    
    draggedElement = e.target;
    draggedElement.classList.add('dragging');
}

function onDrag(e) {
    if (!draggedElement) return;
    e.preventDefault(); // Prevent text selection while dragging

    const gridContainer = document.getElementById('grid-container');
    const containerRect = gridContainer.getBoundingClientRect();

    // Calculate mouse position relative to the grid container
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;

    // Snap the position to the grid, ensuring it stays within bounds
    const gridX = Math.min(Math.max(1, Math.floor(x / GRID_CELL_SIZE) + 1), parseInt(gridContainer.style.gridTemplateColumns.split(' ').length));
    const gridY = Math.min(Math.max(1, Math.floor(y / GRID_CELL_SIZE) + 1), parseInt(gridContainer.style.gridTemplateRows.split(' ').length));

    // Update the element's grid position for visual feedback
    draggedElement.style.gridColumnStart = gridX;
    draggedElement.style.gridRowStart = gridY;
}

async function onDragEnd() {
    if (!draggedElement) return;

    const instanceId = draggedElement.getAttribute('data-instance-id');
    const newPosX = parseInt(draggedElement.style.gridColumnStart, 10);
    const newPosY = parseInt(draggedElement.style.gridRowStart, 10);
    
    draggedElement.classList.remove('dragging');
    draggedElement = null;

    console.log(`Object ${instanceId} moved to (${newPosX}, ${newPosY}). Saving...`);

    // Persist the new position using the centralized state management function
    try {
        await AppState.updateSpatialLayout(instanceId, { posX: newPosX, posY: newPosY });
        console.log("Position updated and saved successfully.");
    } catch (error) {
        console.error("Failed to save updated position:", error);
        // On failure, refresh the grid to revert the visual change to its last saved state
        initVisualInventory(selectedRoomId);
    }
}
