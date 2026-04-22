export async function getAllLocalStorage(): Promise<Record<string, string>> {
  const data: Record<string, string> = {};

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          data[key] = value;
        }
      }
    }
  } catch (error) {
    console.error("Error collecting localStorage:", error);
  }

  return data;
}

export async function setLocalStorage(
  data: Record<string, string>,
): Promise<void> {
  for (const [key, value] of Object.entries(data)) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`Failed to restore localStorage key "${key}":`, error);
    }
  }
}

export async function clearAllLocalStorage(): Promise<void> {
  localStorage.clear();
}
