import { createCanvas, loadImage } from '@napi-rs/canvas';

export async function normalizeOcrContrast(bytes) {
  const image = await loadImage(bytes);
  const { width, height } = image;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0);
  const frame = ctx.getImageData(0, 0, width, height);
  const { data } = frame;
  const stride = width + 1;
  const sums = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4;
      const gray = (data[pixel] * 54 + data[pixel + 1] * 183 + data[pixel + 2] * 19) >> 8;
      data[pixel] = gray;
      rowSum += gray;
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + rowSum;
    }
  }

  // Los encabezados y las columnas oscuras deben pasar a texto oscuro sobre fondo claro.
  const radius = Math.round(width / 55);
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius);
      const right = Math.min(width, x + radius + 1);
      const sum = sums[bottom * stride + right] - sums[bottom * stride + left]
        - sums[top * stride + right] + sums[top * stride + left];
      const pixel = (y * width + x) * 4;
      const gray = sum < 105 * (right - left) * (bottom - top) ? 255 - data[pixel] : data[pixel];
      data[pixel] = data[pixel + 1] = data[pixel + 2] = gray;
    }
  }
  ctx.putImageData(frame, 0, 0);
  return canvas.toBuffer('image/png');
}
