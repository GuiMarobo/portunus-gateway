const LITTLE_ENDIAN = true;

export function float32LittleEndianBase64(vector: Float32Array): string {
  const bytes = new DataView(new ArrayBuffer(vector.length * Float32Array.BYTES_PER_ELEMENT));
  vector.forEach((component, index) => {
    bytes.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, component, LITTLE_ENDIAN);
  });
  return Buffer.from(bytes.buffer).toString('base64');
}
