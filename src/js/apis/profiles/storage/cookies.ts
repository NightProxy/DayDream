export async function getAllCookies(): Promise<Record<string, string>> {
  const cookies: Record<string, string> = {};
  const cookieString = document.cookie;

  if (!cookieString?.trim()) return cookies;

  cookieString.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name?.trim()) {
      cookies[name.trim()] = rest.join("=");
    }
  });

  return cookies;
}

export async function setCookies(
  cookies: Record<string, string>,
): Promise<void> {
  for (const [name, value] of Object.entries(cookies)) {
    document.cookie = `${name}=${value}; path=/; max-age=31536000`;
  }
}

export async function clearAllCookies(): Promise<void> {
  const cookies = await getAllCookies();
  for (const name of Object.keys(cookies)) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
  }
}
