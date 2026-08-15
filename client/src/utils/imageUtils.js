/**
 * Compress a base64 image string to reduce payload size.
 * If the image is already small enough, it returns the original string.
 *
 * @param {string} base64Str - The original base64 image string (data:image/...)
 * @param {number} maxWidth - Maximum width of the compressed image
 * @param {number} maxHeight - Maximum height of the compressed image
 * @param {number} quality - JPEG compression quality (0.0 to 1.0)
 * @returns {Promise<string>} - A promise that resolves to the compressed base64 string
 */
export const compressImage = (base64Str, maxWidth = 1200, maxHeight = 1200, quality = 0.7) => {
  return new Promise((resolve, reject) => {
    // Check if it's already a base64 image
    if (!base64Str || !base64Str.startsWith('data:image')) {
      return resolve(base64Str);
    }

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      
      // Calculate new dimensions while maintaining aspect ratio
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }

      // Create a canvas and draw the resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      // Draw white background (in case of transparent PNGs being converted to JPEG)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // Compress to JPEG to save space
      const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
      
      // Return the compressed string, or the original if somehow the compressed one is larger
      if (compressedBase64.length < base64Str.length) {
        resolve(compressedBase64);
      } else {
        resolve(base64Str);
      }
    };
    
    img.onerror = (error) => {
      console.warn('Image compression failed, returning original.', error);
      resolve(base64Str);
    };
    
    img.src = base64Str;
  });
};
