// @ts-nocheck
declare const SCRAMJET_EXPECTED_VERSION: string;

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