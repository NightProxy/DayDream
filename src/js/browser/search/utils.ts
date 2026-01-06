export const DOMAIN_REGEX =
  /^(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/.*)?$/;

export function isValidUrl(input: string): boolean {
  if (
    window.protocols?.isRegisteredProtocol(input) ||
    input.startsWith("http://") ||
    input.startsWith("https://")
  ) {
    return true;
  }

  return (
    DOMAIN_REGEX.test(input) ||
    (input.includes(".") && !input.includes(" "))
  );
}

export function generatePredictedSettingsUrls(query: string): string[] {
  const basePaths = [
    "settings",
    "settings/about",
    "settings/profile",
    "settings/privacy",
    "settings/security",
    "settings/notifications",
  ];
  query = query.replace(/ /g, "");
  return basePaths.map((base) => `${base}${query ? `/${query}` : ""}`);
}
