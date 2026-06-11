export const imgUrl = (url) => {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto/');
};
