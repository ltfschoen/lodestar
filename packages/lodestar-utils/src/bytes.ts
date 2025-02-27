import {
  toBufferLE, toBigIntLE,
  toBufferBE, toBigIntBE,
} from "bigint-buffer";
import {ArrayLike} from "@chainsafe/ssz";

type Endianness = "le" | "be";

/**
 * Return a byte array from a number or BigInt
 */
export function intToBytes(value: bigint | number, length: number, endianness: Endianness = "le"): Buffer {
  return bigIntToBytes(BigInt(value), length, endianness);
}

/**
 * Convert byte array in LE to integer.
 */
export function bytesToInt(value: Uint8Array, endianness: Endianness = "le"): number {
  return Number(bytesToBigInt(value, endianness));
}

export function bigIntToBytes(value: bigint, length: number, endianness: Endianness = "le"): Buffer {
  if (endianness === "le") {
    return toBufferLE(value, length);
  } else if (endianness === "be") {
    return toBufferBE(value, length);
  }
  throw new Error("endianness must be either 'le' or 'be'");
}

export function bytesToBigInt(value: Uint8Array, endianness: Endianness = "le"): bigint {
  if (endianness === "le") {
    return toBigIntLE(value as Buffer);
  } else if (endianness === "be") {
    return toBigIntBE(value as Buffer);
  }
  throw new Error("endianness must be either 'le' or 'be'");
}


export function toHex(buffer: ArrayLike<number>): string {
  if(buffer instanceof Uint8Array) {
    return "0x" + Buffer.from(buffer.buffer, buffer.byteOffset).toString("hex");
  } else {
    return "0x" + Buffer.from(buffer).toString("hex");
  }

}

export function fromHex(hex: string): Uint8Array {
  const b = Buffer.from(hex.replace("0x", ""), "hex");
  return new Uint8Array(b.buffer, b.byteOffset, b.length);
}
