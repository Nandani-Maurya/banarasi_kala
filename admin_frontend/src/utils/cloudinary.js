/**
 * Adds f_auto,q_auto to Cloudinary image URLs so the CDN converts
 * HEIC/HEIF to a browser-compatible format (WebP or JPEG) on the fly.
 * Non-Cloudinary URLs are returned unchanged.
 */
export const imgUrl = (url) => {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto/');
};
