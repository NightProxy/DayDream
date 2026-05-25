// @ts-nocheck
declare const SCRAMJET_EXPECTED_VERSION: string;

// Hardcoded local controller version.
//
// Upstream injects this via a `CONTROLLER_VERSION` build-time constant
// (rspack DefinePlugin). Our rolldown bundle could mirror that, but the
// literal is just as good and removes one moving part: every consumer
// of the controller IIFE sees the same string regardless of which
// rolldown config built it.
//
// The `-dd` suffix marks this as a DDX-modified local build, distinct
// from the upstream `0.0.11` release shape — useful when reading
// `$scramjetController.VERSION` in the console.
export const VERSION = '0.0.11-dd';

function assertVersionMatch(
	packageName: string,
	expected: string,
	actual: string
) {
	if (expected !== actual) {
		throw new Error(
			`${packageName} version mismatch: this build expects ${expected}, but the loaded runtime is ${actual}`
		);
	}
}

export function assertRuntimeScramjetVersion() {
	if (typeof $scramjet === "undefined") {
		throw new Error(
			"@mercuryworkshop/scramjet is not loaded. Load scramjet before the controller."
		);
	}

	assertVersionMatch(
		"@mercuryworkshop/scramjet",
		SCRAMJET_EXPECTED_VERSION,
		$scramjet.versionInfo.version
	);
}