// Storage keys keep the original "pinpoint:" prefix so saved settings and best scores survive the rename.
export function readPref(key: string) {
  try {
    return localStorage.getItem(`pinpoint:${key}`) ?? '';
  } catch {
    return '';
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(`pinpoint:${key}`, value);
  } catch {
    /* storage unavailable */
  }
}
