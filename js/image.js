/* image.js
 * Bridges File objects <-> Canvas <-> ImageData. Also generates a
 * procedural sample carrier so a person can try VEIL without hunting
 * down a test PNG first (see brief #31 — no shipped external assets).
 */
(function (VEIL) {
  'use strict';

  const SUPPORTED_INPUT = ['image/png', 'image/webp', 'image/jpeg', 'image/jpg'];

  function detectFormatLabel(mime) {
    switch (mime) {
      case 'image/png':
        return 'PNG';
      case 'image/webp':
        return 'WebP';
      case 'image/jpeg':
      case 'image/jpg':
        return 'JPEG';
      default:
        return (mime || 'unknown').toUpperCase();
    }
  }

  /** Decode a File/Blob into { imageData, width, height, canvas }. */
  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        let imageData;
        try {
          imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(new Error('This image could not be read by the browser.'));
          return;
        }
        URL.revokeObjectURL(url);
        resolve({ imageData, width: canvas.width, height: canvas.height, canvas });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('This file is not a readable image.'));
      };
      img.src = url;
    });
  }

  /** Encode ImageData to a PNG Blob (lossless — required for LSB payloads). */
  function imageDataToPngBlob(imageData) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext('2d');
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not encode the output image.'));
      }, 'image/png');
    });
  }

  function imageDataToDataUrl(imageData) {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext('2d').putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  /**
   * A deterministic procedural test carrier: a soft gradient plus a
   * fine dot grid, which behaves realistically under LSB embedding
   * (real photos are rarely flat color) without shipping any external
   * or copyrighted image asset.
   */
  function generateSampleImage(width = 640, height = 420) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#20211f');
    grad.addColorStop(0.5, '#3c3a35');
    grad.addColorStop(1, '#54493a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#ffffff';
    for (let y = 0; y < height; y += 6) {
      for (let x = 0; x < width; x += 6) {
        if ((x / 6 + y / 6) % 2 === 0) ctx.fillRect(x, y, 2, 2);
      }
    }
    ctx.globalAlpha = 1;

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        const file = new File([blob], 'veil-sample-carrier.png', { type: 'image/png' });
        resolve(file);
      }, 'image/png');
    });
  }

  VEIL.image = {
    SUPPORTED_INPUT,
    detectFormatLabel,
    loadImageFromFile,
    imageDataToPngBlob,
    imageDataToDataUrl,
    generateSampleImage,
  };
})(window.VEIL || (window.VEIL = {}));