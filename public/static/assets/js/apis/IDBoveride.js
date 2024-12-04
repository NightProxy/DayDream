// Simple GPT created API to help me trace IDB to fix stuff

const originalOpen = indexedDB.open;
const originalGet = indexedDB.get;
const originalPut = indexedDB.put;
const originalDelete = indexedDB.delete;

// Utility function to log interactions
function logDBInteraction(type, ...args) {
    console.log(`IndexedDB ${type} called with arguments:`, args);
    console.trace(); // This will log a stack trace
}

// Override the open method
indexedDB.open = function(name, version) {
    logDBInteraction('open', name, version);
    return originalOpen.apply(this, arguments);
};

// Override the get method
indexedDB.get = function(storeName, key) {
    logDBInteraction('get', storeName, key);
    return originalGet.apply(this, arguments);
};

// Override the put method
indexedDB.put = function(value, storeName) {
    logDBInteraction('put', value, storeName);
    return originalPut.apply(this, arguments);
};

// Override the delete method
indexedDB.delete = function(storeName, key) {
    logDBInteraction('delete', storeName, key);
    return originalDelete.apply(this, arguments);
};

