export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_MB = 5;
export const IMAGE_BUCKET = "image-assets";

const OUTPUT_TYPE = "image/webp";
const MAX_IMAGE_DIMENSION = 2400;

const readImage = (file) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error("This image could not be read. Try a JPG, PNG, or WebP file."));
  };
  image.src = objectUrl;
});

const canvasToBlob = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob(
    (blob) => (blob ? resolve(blob) : reject(new Error("The browser could not optimize this image."))),
    OUTPUT_TYPE,
    quality
  );
});

/**
 * Converts raster images to WebP, scales oversized dimensions, and guarantees
 * the returned image is at or below the Supabase/Vercel upload limit.
 */
export async function optimizeImageForUpload(file, options = {}) {
  if (!file || !file.type?.startsWith("image/")) return file;

  const maxBytes = options.maxBytes || MAX_IMAGE_BYTES;
  if (file.type === "image/svg+xml") {
    if (file.size > maxBytes) throw new Error(`Images must be ${MAX_IMAGE_MB} MB or smaller.`);
    return file;
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    return file;
  }

  const image = await readImage(file);
  let scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  let width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  let height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));

  for (let dimensionAttempt = 0; dimensionAttempt < 6; dimensionAttempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Your browser could not prepare this image.");

    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.88, 0.8, 0.72, 0.64, 0.56]) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= maxBytes) {
        const baseName = file.name.replace(/\.[^/.]+$/, "") || "image";
        return new File([blob], `${baseName}.webp`, {
          type: OUTPUT_TYPE,
          lastModified: Date.now(),
        });
      }
    }

    width = Math.max(480, Math.round(width * 0.8));
    height = Math.max(480, Math.round(height * 0.8));
  }

  throw new Error(`Images must be ${MAX_IMAGE_MB} MB or smaller after optimization.`);
}

export function getUploadExtension(file) {
  const extension = file?.name?.split(".").pop()?.toLowerCase();
  if (file?.type === "image/webp") return "webp";
  if (file?.type === "image/svg+xml") return "svg";
  return extension || "bin";
}
