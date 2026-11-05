// client/src/lib/photo.js
/** Shrinks a photo to <= 1024px JPEG so it stays well under the server's ~1 MB limit. */
export async function photoToPayload(file, maxSide = 1024) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // The API wants raw base64, without the "data:...;base64," prefix.
  return { mediaType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.8).split(',')[1] };
}
