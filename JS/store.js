const store = {
    assets: [],
    employees: [],
    sites: [],
    rooms: [],
    containers: [],
    spatialLayouts: [],
    _idCache: {},

    /**
     * Initializes the data store by loading all necessary data from the sheetsService.
     * @param {function} callback - The function to call when all data is loaded and processed.
     */
    init: function(callback) {
        const sheetsToLoad = ['Asset', 'Employees', 'Sites', 'Rooms', 'Containers', 'Spatial Layout'];
        let loadedCount = 0;

        const onSheetLoaded = () => {
            loadedCount++;
            if (loadedCount === sheetsToLoad.length) {
                console.log("All sheets loaded. Processing data relationships.");
                this._buildIdCache();

                // Post-process assets to add backward-compatible location strings.
                // This allows the old filtering UI to continue working until it's updated in Phase 4.
                this.assets.forEach(asset => {
                    if (!asset.ParentID) {
                        asset.Location = 'No Location';
                        return;
                    }

                    const path = this.getFullLocationPath(asset.AssetID);
                    const site = path.find(p => p.SiteID);
                    const room = path.find(p => p.RoomID);

                    if (site && room) {
                        asset.Location = `${site.SiteName} - ${room.RoomName}`;
                    } else if (room) {
                        asset.Location = `Unknown Site - ${room.RoomName}`;
                    } else {
                        asset.Location = 'Unknown Location';
                    }
                });

                console.log("Data processing complete.");
                callback();
            }
        };

        // Load Sites
        sheetsService.load('Sites', (data) => {
            this.sites = data;
            onSheetLoaded();
        });

        // Load Rooms
        sheetsService.load('Rooms', (data) => {
            this.rooms = data.map(r => ({
                RoomID: r['Room ID'],
                RoomName: r['Room Name'],
                SiteID: r['Site ID'],
                GridWidth: r['Grid Width'] ? parseInt(r['Grid Width'], 10) : null,
                GridHeight: r['Grid Height'] ? parseInt(r['Grid Height'], 10) : null,
                Notes: r.Notes,
            }));
            onSheetLoaded();
        });

        // Load Containers
        sheetsService.load('Containers', (data) => {
            this.containers = data;
            onSheetLoaded();
        });

        // Load Spatial Layout
        sheetsService.load('Spatial Layout', (data) => {
            this.spatialLayouts = data;
            onSheetLoaded();
        });

        // Load Assets
        sheetsService.load('Asset', (data) => {
            this.assets = data.map(asset => ({
                ...asset,
                Quantity: parseInt(asset.Quantity, 10) || 1
            }));
            onSheetLoaded();
        });

        // Load Employees
        sheetsService.load('Employees', (data) => {
            this.employees = data;
            onSheetLoaded();
        });
    },
    
    /**
     * Builds a cache of all items with IDs for quick lookups.
     */
    _buildIdCache: function() {
        this._idCache = {};
        const cacheItem = (item, idKey) => {
            if (item && item[idKey]) {
                this._idCache[item[idKey]] = item;
            }
        };

        this.assets.forEach(item => cacheItem(item, 'AssetID'));
        this.sites.forEach(item => cacheItem(item, 'SiteID'));
        this.rooms.forEach(item => cacheItem(item, 'RoomID'));
        this.containers.forEach(item => cacheItem(item, 'ContainerID'));
        this.employees.forEach(item => cacheItem(item, 'EmployeeID'));
    },

    /**
     * Finds any object in the store by its unique ID.
     * @param {string} id - The ID of the object to find.
     * @returns {object|null} The found object or null.
     */
    findObjectById: function(id) {
        if (!id || typeof id !== 'string') return null;
        return this._idCache[id] || null;
    },

    /**
     * Gets the direct parent object of an asset or container.
     * @param {string|object} itemOrId - The item object or its ID.
     * @returns {object|null} The parent object (a Room or Container) or null.
     */
    getParent: function(itemOrId) {
        const item = typeof itemOrId === 'string' ? this.findObjectById(itemOrId) : itemOrId;
        if (!item || !item.ParentID) {
            return null;
        }
        return this.findObjectById(item.ParentID);
    },

    /**
     * Gets the full hierarchical location path for any item.
     * @param {string|object} itemOrId - The item object or its ID.
     * @returns {Array<object>} An array of objects representing the path, e.g., [Site, Room, Container].
     */
    getFullLocationPath: function(itemOrId) {
        const path = [];
        let currentItem = typeof itemOrId === 'string' ? this.findObjectById(itemOrId) : itemOrId;
        if (!currentItem) return [];

        let parent = this.getParent(currentItem);

        while (parent) {
            path.unshift(parent);
            const parentId = parent.ContainerID || parent.RoomID;
            parent = this.getParent(parentId);
        }

        if (path.length > 0 && path[0].RoomID) {
            const room = path[0];
            const site = this.getSiteForRoom(room.RoomID);
            if (site) {
                path.unshift(site);
            }
        }
        return path;
    },

    /**
     * Finds the Site object that a given Room belongs to.
     * @param {string} roomId - The ID of the room.
     * @returns {object|null} The Site object or null.
     */
    getSiteForRoom: function(roomId) {
        const room = this.findObjectById(roomId);
        if (!room || !room.SiteID) return null;
        return this.findObjectById(room.SiteID);
    },

    /**
     * Traverses up the hierarchy from a container to find the Room it's in.
     * @param {string} containerId - The ID of the container.
     * @returns {object|null} The Room object or null.
     */
    getRoomForContainer: function(containerId) {
        let parent = this.getParent(containerId);
        while (parent) {
            if (parent.RoomID) {
                return parent;
            }
            parent = this.getParent(parent.ContainerID);
        }
        return null;
    },

    // --- Existing Functions ---
    getAssets: function() {
        return this.assets;
    },

    getAssetById: function(id) {
        return this.assets.find(asset => asset.AssetID === id);
    },

    getEmployees: function() {
        return this.employees;
    }
};
