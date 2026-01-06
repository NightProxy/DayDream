# Night+ Auth Client

WebSocket authentication for Night+ using Enigma protocol injection.

## How It Works

Since browsers block custom WebSocket headers, authentication data is passed via the `protocols` parameter:
1. Session token is stored in IndexedDB (NightPlus database)
2. Enigma module reads token and encodes as base64 JSON
3. Token is injected into WebSocket protocols array
4. Reverse proxy decodes protocol and validates token

## Installation

```bash
npm install @nightnetwork/plus-client localforage
```

## Usage

### As Enigma Module (Recommended)

Load the module via Enigma for automatic authentication injection:

```javascript
import { BareMuxConnection } from '@mercuryworkshop/bare-mux';
import { authenticate } from '@nightnetwork/plus-client';

const accessToken = '...';
await authenticate(accessToken, '/auth');

const connection = new BareMuxConnection('/baremux/worker.js');
await connection.setTransport('/enigma/index.mjs', {
  base: '/epoxy/index.mjs',
  wisp: 'wss://wisp.example.com/',
  modules: [
    '/plusClient/module.mjs'
  ]
});
```

### As JavaScript Import

Import functions directly for manual token management:

```javascript
import { setSessionToken, getSessionToken, clearSessionToken, createPlusAuthModule } from '@nightnetwork/plus-client';

const accessToken = '...';
await authenticate(accessToken, '/auth');

const connection = new BareMuxConnection('/baremux/worker.js');
await connection.setTransport('/enigma/index.mjs', {
  base: '/epoxy/index.mjs',
  wisp: 'wss://wisp.example.com/',
  modules: [
    createPlusAuthModule()
  ]
});

// Set token
await setSessionToken('your-session-token');

// Get token
const token = await getSessionToken();

// Clear token
await clearSessionToken();
```

### Validate Session

```javascript
import { validateSession } from '@nightnetwork/plus-client';

const isValid = await validateSession('/validate');
if (!isValid) {
  // Re-authenticate
  await authenticate(accessToken);
}
```

## API

### `authenticate(accessToken, authUrl?)`
Exchanges access token for session token. Stores in IndexedDB.
- `accessToken`: JWT access token from login
- `authUrl`: Auth endpoint (default: `/auth`)
- Returns: `Promise<string>` - Session token

### `setSessionToken(token)`
Stores session token in IndexedDB (NightPlus database).
- `token`: Session token string
- Returns: `Promise<void>`

### `getSessionToken()`
Retrieves session token from IndexedDB.
- Returns: `Promise<string | null>`

### `clearSessionToken()`
Removes session token from IndexedDB.
- Returns: `Promise<void>`

### `validateSession(validateUrl?)`
Checks if current session token is valid.
- `validateUrl`: Validation endpoint (default: `/validate`)
- Returns: `Promise<boolean>`

### `createPlusAuthModule()`
Creates Enigma module for WebSocket protocol injection.
- Returns: `EnigmaModule`

## Protocol Format

Authentication data is encoded as:
```javascript
const authData = { "Night-Auth": "session-token" };
const protocol = btoa(JSON.stringify(authData));
```

The reverse proxy decodes this:
```javascript
const decoded = JSON.parse(atob(protocol));
const token = decoded['Night-Auth'];
```

## Storage

Uses localforage with IndexedDB:
- **Database**: `NightPlus`
- **Store**: `session`
- **Key**: `token`

Works in web workers - NO localStorage dependency.

## Example: Full Flow

```javascript
import BareMux from '@mercuryworkshop/bare-mux';
import { authenticate, createPlusAuthModule, validateSession } from '@nightnetwork/plus-client';

// 1. Login to get access token
const loginRes = await fetch('https://auth.night-x.com/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', password: 'pass' })
});
const { access_token } = await loginRes.json();

// 2. Exchange for session token
await authenticate(access_token, 'http://localhost:8081/auth');

// 3. Setup transport with auth module
const connection = new BareMux.BareClient();
await connection.setTransport('/enigma/index.mjs', {
  base: '/epoxy/index.mjs',
  modules: [createPlusAuthModule()]
});

// 4. WebSockets are now authenticated
const ws = new WebSocket('wss://api.example.com/ws');

// 5. Handle session expiry
ws.addEventListener('close', async (event) => {
  if (event.code === 1008) { // Unauthorized
    await authenticate(access_token);
    // Retry connection
  }
});
```

## Session Expiry

Sessions expire 15 minutes after inactivity. When expired:
- Server closes WebSocket with code 1008
- Client must re-authenticate
- New session token is issued and stored
