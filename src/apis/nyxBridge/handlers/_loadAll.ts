// src/apis/nyxBridge/handlers/_loadAll.ts
//
// Importing this file registers every handler in HANDLERS. New handler
// files MUST be added here so they're side-effect-imported.

import './tabs';            // Task 4.3
import './webNavigation';   // Task 4.4
import './dom';             // Phase 5
import './input';           // Task 7.3
import './cookies';         // Task 7.1
import './dialogs';         // Task 7.2
import './storage';         // Task 8.1
import './history';         // Task 8.2
import './bookmarks';       // Task 8.3
import './windows';         // Task 8.4
import './debugger';        // Task 8.5
import './search';          // Task 8.6
import './runtime';         // Task 8.7
import './auth';            // Task 8.7
import './host';            // Task 8.7
import './scripting';       // Task 8.7

export {};
