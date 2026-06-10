const MAX_EDGE = 1568; // Claude downscales beyond this anyway
const JPEG_QUALITY = 0.85;

// Converts HEIC if needed, downscales to MAX_EDGE, returns JPEG blob + base64.
export async function prepareImageForUpload(file: File): Promise<{
  blob: Blob;
  base64: string;
  mimeType: string;
}> {
  let source: Blob = file;

  const lowerName = file.name.toLowerCase();
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    lowerName.endsWith(".heic") ||
    lowerName.endsWith(".heif");

  if (isHeic) {
    const heic2any = (await import("heic2any")).default;
    const converted = (await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    })) as Blob | Blob[];
    source = Array.isArray(converted) ? converted[0] : converted;
  }

  const blob = await downscaleToJpeg(source);
  const base64 = await blobToBase64(blob);
  return { blob, base64, mimeType: "image/jpeg" };
}

async function downscaleToJpeg(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported");
    ctx.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Image encode failed"))),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
