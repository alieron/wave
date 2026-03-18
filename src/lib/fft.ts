/**
 * In-place Cooley-Tukey FFT (radix-2)
 * re and im arrays must have length that is a power of 2
 */
export function fft(re: number[], im: number[]): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len *= 2) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cRe = 1, cIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tRe = re[b] * cRe - im[b] * cIm;
        const tIm = re[b] * cIm + im[b] * cRe;
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const tmp = cRe * wRe - cIm * wIm;
        cIm = cRe * wIm + cIm * wRe;
        cRe = tmp;
      }
    }
  }
}

/**
 * Inverse FFT using the conjugate trick
 */
export function ifft(re: number[], im: number[]): void {
  for (let i = 0; i < im.length; i++) im[i] = -im[i];
  fft(re, im);
  const n = re.length;
  for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] = -im[i] / n;
  }
}

/**
 * Compute magnitude spectrum from FFT output
 */
export function magnitude(re: number[], im: number[]): number[] {
  return re.map((r, i) => Math.sqrt(r * r + im[i] * im[i]));
}

/**
 * Zero out FFT bins outside [lowHz, highHz] bandpass
 */
export function applyBandpass(
  re: number[], im: number[],
  sampleRate: number, lowHz: number, highHz: number
): void {
  const n = re.length;
  for (let k = 0; k < n; k++) {
    const freq = k <= n / 2 ? k * sampleRate / n : (n - k) * sampleRate / n;
    if (freq < lowHz || freq > highHz) {
      re[k] = 0;
      im[k] = 0;
    }
  }
}

