// Pulsar protocol constants (vendored from @abndnce/pulsar).
//
// Spec summary: Pulsar is a WebRTC-Direct based transport. The browser
// crafts a remote SDP describing the server and connects without any
// signalling. Hardcoded ICE credentials and DTLS fingerprint are used
// because the server does not validate them.

export const SOCKET_PREFIX = 'socket/';
export const KEEPALIVE_LABEL = 'keepalive';

export const PULSAR_UFRAG = 'pulsar';
export const PULSAR_PWD = 'pulsarpulsarpulsarpuls';
export const PULSAR_FINGERPRINT =
	'F1:85:10:8F:36:FF:58:D8:D0:4B:52:D7:ED:DC:5C:28:AE:7D:DB:54:0E:2A:DD:C7:C3:94:EA:A1:27:D0:4E:78';

// Default official Pulsar server (Abundance / IONOS).
export const DEFAULT_PULSAR_HOST = '216.250.119.217';
export const DEFAULT_PULSAR_PORT = 4393;
