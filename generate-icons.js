// Script to generate valid PNG icons for the extension using pure Node.js zlib
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(size, primaryColor, secondaryColor) {
  // Simple PNG encoder
  const width = size;
  const height = size;
  const rawData = Buffer.alloc(height * (width * 4 + 1));

  const [r1, g1, b1] = primaryColor;
  const [r2, g2, b2] = secondaryColor;

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      // Rounded icon with gradient and a "FB scraper" symbol
      const cx = width / 2;
      const cy = height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      const maxRadius = width * 0.46;
      
      if (dist <= maxRadius) {
        // Gradient from top to bottom
        const t = y / height;
        let r = Math.round(r1 * (1 - t) + r2 * t);
        let g = Math.round(g1 * (1 - t) + g2 * t);
        let b = Math.round(b1 * (1 - t) + b2 * t);

        // Draw a neat "f" / comment bubble symbol
        // Bubble body:
        const inBubble = (x >= width * 0.22 && x <= width * 0.78 && y >= height * 0.22 && y <= height * 0.70);
        // Bubble tail:
        const inTail = (x >= width * 0.28 && x <= width * 0.44 && y >= height * 0.65 && y <= height * 0.82 && (x - width * 0.28) < (height * 0.82 - y) * 1.5);

        if (inBubble || inTail) {
          // Inside bubble
          // Horizontal lines inside bubble (representing text / comments)
          const line1 = (y >= height * 0.35 && y <= height * 0.42 && x >= width * 0.34 && x <= width * 0.66);
          const line2 = (y >= height * 0.48 && y <= height * 0.55 && x >= width * 0.34 && x <= width * 0.58);
          
          if (line1 || line2) {
            // Lines in bubble (FB Blue)
            rawData[offset++] = 24;
            rawData[offset++] = 119;
            rawData[offset++] = 242;
            rawData[offset++] = 255;
          } else {
            // White bubble
            rawData[offset++] = 255;
            rawData[offset++] = 255;
            rawData[offset++] = 255;
            rawData[offset++] = 255;
          }
        } else {
          // Background blue circle
          rawData[offset++] = r;
          rawData[offset++] = g;
          rawData[offset++] = b;
          rawData[offset++] = 255;
        }
      } else {
        // Transparent
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
      }
    }
  }

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type 6 (RGBA)
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT chunk
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuf, data]);

  const crc = crc32(crcData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

// Simple CRC32 implementation for PNG
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c;
    }
    crc32.table = table;
  }

  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Facebook Blue gradient: #1877F2 -> #0056b3
const primary = [24, 119, 242];
const secondary = [10, 75, 175];

[16, 48, 128].forEach(size => {
  const png = createPNG(size, primary, secondary);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
  console.log(`Generated icon${size}.png (${png.length} bytes)`);
});
