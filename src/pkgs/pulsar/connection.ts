// Direct (no signalling) Pulsar connection.
// Vendored from @abndnce/pulsar-client.

import {
	KEEPALIVE_LABEL,
	PULSAR_FINGERPRINT,
	PULSAR_PWD,
	PULSAR_UFRAG
} from './constants';
import {
	waitForDataChannelOpen,
	waitForPeerConnectionConnected
} from './webrtc';

export interface PulsarClientConnection {
	keepalive: RTCDataChannel;
	pc: RTCPeerConnection;
	close(): Promise<void>;
}

/**
 * Connect to a remote Pulsar server in direct mode.
 *
 * Uses native browser RTCPeerConnection. The server does not validate
 * the client's ICE credentials or DTLS fingerprint (STUN MESSAGE-INTEGRITY
 * unchecked, DTLS verification disabled), so the browser's auto-generated
 * local credentials work fine.
 */
export async function connectDirect(
	host: string,
	port: number
): Promise<PulsarClientConnection> {
	const pc = new RTCPeerConnection();

	// Mandated keepalive data channel (Pulsar spec)
	const keepalive = pc.createDataChannel(KEEPALIVE_LABEL, { ordered: true });

	const offer = await pc.createOffer();
	await pc.setLocalDescription(offer);

	// Craft the remote (server) SDP. Trailing empty line ensures the
	// final \r\n terminator that Chrome's SDP parser requires.
	const remoteSdp = [
		'v=0',
		'o=- 111 222 IN IP4 0.0.0.0',
		's=-',
		't=0 0',
		`m=application ${port} UDP/DTLS/SCTP webrtc-datachannel`,
		`c=IN IP4 ${host}`,
		`a=ice-ufrag:${PULSAR_UFRAG}`,
		`a=ice-pwd:${PULSAR_PWD}`,
		`a=fingerprint:sha-256 ${PULSAR_FINGERPRINT}`,
		'a=setup:active',
		'a=mid:0',
		'a=sctp-port:5000',
		''
	].join('\r\n');

	await pc.setRemoteDescription({ type: 'answer', sdp: remoteSdp });

	await pc.addIceCandidate({
		candidate: `candidate:1 1 UDP 2130706431 ${host} ${port} typ host`,
		sdpMid: '0',
		sdpMLineIndex: 0
	});

	await waitForPeerConnectionConnected(pc);
	await waitForDataChannelOpen(keepalive, pc);

	return {
		keepalive,
		pc,
		async close() {
			keepalive.close();
			pc.close();
		}
	};
}
