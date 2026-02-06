/**
 * Image validation utilities
 * Provides validation for base64-encoded images
 */

import { logger } from './logger';

// Common image MIME types and their magic bytes (in base64)
const IMAGE_SIGNATURES: Record<string, string[]> = {
  'image/jpeg': ['/9j/'],
  'image/png': ['iVBORw0KGgo'],
  'image/gif': ['R0lGODlh', 'R0lGODdh'],
  'image/webp': ['UklGR'],
  'image/bmp': ['Qk'],
  'image/tiff': ['SUkq', 'TU0A'],
};

/**
 * Check if a string is valid base64
 */
export function isValidBase64(str: string): boolean {
  if (!str || typeof str !== 'string') {
    return false;
  }

  // Remove data URL prefix if present
  const base64Data = str.replace(/^data:[^;]+;base64,/, '');

  // Check if the string matches base64 pattern
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;

  // Check if length is valid for base64 (must be multiple of 4)
  if (base64Data.length % 4 !== 0) {
    return false;
  }

  return base64Regex.test(base64Data);
}

/**
 * Detect image type from base64 string
 */
export function detectImageType(base64: string): string | null {
  // Remove data URL prefix if present
  const base64Data = base64.replace(/^data:[^;]+;base64,/, '');

  for (const [mimeType, signatures] of Object.entries(IMAGE_SIGNATURES)) {
    for (const signature of signatures) {
      if (base64Data.startsWith(signature)) {
        return mimeType;
      }
    }
  }

  return null;
}

/**
 * Extract base64 data and MIME type from data URL
 */
export function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (match) {
    return {
      mimeType: match[1],
      data: match[2],
    };
  }

  // If no data URL prefix, try to detect type
  if (isValidBase64(dataUrl)) {
    const detectedType = detectImageType(dataUrl);
    return {
      mimeType: detectedType || 'image/jpeg', // Default to JPEG if unknown
      data: dataUrl,
    };
  }

  return null;
}

/**
 * Validate an image string (base64 or data URL)
 */
export function validateImage(imageString: string): {
  valid: boolean;
  error?: string;
  mimeType?: string;
  data?: string;
  sizeBytes?: number;
} {
  if (!imageString || typeof imageString !== 'string') {
    return { valid: false, error: 'Image data is required and must be a string' };
  }

  // Check for empty string
  if (imageString.trim() === '') {
    return { valid: false, error: 'Image data cannot be empty' };
  }

  // Parse the data URL or base64 string
  const parsed = parseDataUrl(imageString);

  if (!parsed) {
    return { valid: false, error: 'Invalid base64 image data' };
  }

  // Validate base64 format
  if (!isValidBase64(parsed.data)) {
    return { valid: false, error: 'Malformed base64 encoding' };
  }

  // Calculate approximate size (base64 is ~33% larger than binary)
  const sizeBytes = Math.floor((parsed.data.length * 3) / 4);

  // Check for reasonable image size (max 20MB)
  const maxSize = 20 * 1024 * 1024;
  if (sizeBytes > maxSize) {
    return {
      valid: false,
      error: `Image too large: ${(sizeBytes / 1024 / 1024).toFixed(2)}MB (max ${maxSize / 1024 / 1024}MB)`
    };
  }

  // Detect image type if not provided in data URL
  const detectedType = detectImageType(parsed.data);

  // Warn if detected type doesn't match declared type
  if (detectedType && parsed.mimeType !== detectedType) {
    logger.warn(`Image MIME type mismatch: declared ${parsed.mimeType}, detected ${detectedType}`);
  }

  return {
    valid: true,
    mimeType: parsed.mimeType,
    data: parsed.data,
    sizeBytes,
  };
}

/**
 * Validate multiple images
 */
export function validateImages(images: string[]): {
  valid: boolean;
  validImages: Array<{ mimeType: string; data: string; sizeBytes: number }>;
  errors: string[];
} {
  const validImages: Array<{ mimeType: string; data: string; sizeBytes: number }> = [];
  const errors: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const result = validateImage(images[i]);

    if (result.valid && result.mimeType && result.data) {
      validImages.push({
        mimeType: result.mimeType,
        data: result.data,
        sizeBytes: result.sizeBytes || 0,
      });
    } else {
      errors.push(`Image ${i + 1}: ${result.error || 'Unknown error'}`);
    }
  }

  return {
    valid: errors.length === 0,
    validImages,
    errors,
  };
}

/**
 * Convert Buffer to validated base64
 */
export function bufferToValidatedBase64(buffer: Buffer, mimeType: string = 'image/jpeg'): {
  data: string;
  mimeType: string;
  sizeBytes: number;
} {
  const data = buffer.toString('base64');
  return {
    data,
    mimeType,
    sizeBytes: buffer.length,
  };
}

export default {
  isValidBase64,
  detectImageType,
  parseDataUrl,
  validateImage,
  validateImages,
  bufferToValidatedBase64,
};
