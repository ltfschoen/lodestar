import {Root, SignedBeaconBlock, Slot} from "@chainsafe/lodestar-types";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {bytesToInt, intToBytes} from "@chainsafe/lodestar-utils";

import {IDatabaseController, IFilterOptions} from "../../../controller";
import {Bucket, encodeKey} from "../../schema";
import {ArrayLike} from "@chainsafe/ssz";
import {Repository} from "./abstract";

export interface IBlockFilterOptions extends IFilterOptions<Slot> {
  step?: number;
}

/**
 * Stores finalized blocks. Block slot is identifier.
 */
export class BlockArchiveRepository extends Repository<Slot, SignedBeaconBlock> {

  public constructor(
    config: IBeaconConfig,
    db: IDatabaseController<Buffer, Buffer>,
  ) {
    super(config, db, Bucket.blockArchive, config.types.SignedBeaconBlock);
  }

  public async add(value: SignedBeaconBlock): Promise<void> {
    await Promise.all([
      super.add(value),
      this.storeRootIndex(value),
      this.storeParentRootIndex(value)
    ]);
  }

  public async getByRoot(root: Root): Promise<SignedBeaconBlock|null> {
    const slot = await this.getSlotByRoot(root);
    if(Number.isInteger(slot)) {
      return this.get(slot);
    }
    return null;
  }

  public async getByParentRoot(root: Root): Promise<SignedBeaconBlock|null> {
    const slot = await this.getSlotByParenRoot(root);
    if(Number.isInteger(slot)) {
      return this.get(slot);
    }
    return null;
  }

  public async getSlotByRoot(root: Root): Promise<Slot|null> {
    const value = await this.db.get(
      this.getRootIndexKey(root)
    );
    if(value) {
      return bytesToInt(value, "be");
    }
    return null;
  }

  public async getSlotByParenRoot(root: Root): Promise<Slot|null> {
    const value = await this.db.get(
      this.getParentRootIndexKey(root)
    );
    if(value) {
      return bytesToInt(value, "be");
    }
    return null;
  }

  public async batchAdd(values: ArrayLike<SignedBeaconBlock>): Promise<void> {
    await Promise.all([
      super.batchAdd(values),
      ...Array.from(values).map((block) => this.storeRootIndex(block)),
      ...Array.from(values).map((block) => this.storeParentRootIndex(block))
    ]);
  }

  public decodeKey(data: Buffer): number {
    return bytesToInt(super.decodeKey(data) as unknown as Uint8Array, "be");
  }

  public getId(value: SignedBeaconBlock): Slot {
    return value.message.slot;
  }

  public async values(opts?: IBlockFilterOptions): Promise<SignedBeaconBlock[]> {
    const result = [];
    for await (const value of this.valuesStream(opts)) {
      result.push(value);
    }
    return result;
  }

  public valuesStream(opts?: IBlockFilterOptions): AsyncIterable<SignedBeaconBlock> {
    const dbFilterOpts = this.dbFilterOptions(opts);
    const firstSlot = dbFilterOpts.gt ?
      this.decodeKey(dbFilterOpts.gt) + 1 :
      this.decodeKey(dbFilterOpts.gte);
    const valuesStream = super.valuesStream(opts);
    const step = opts && opts.step || 1;
    return (async function* () {
      for await (const value of valuesStream) {
        if ((value.message.slot - firstSlot) % step === 0) {
          yield value;
        }
      }
    })();
  }

  private async storeRootIndex(block: SignedBeaconBlock): Promise<void> {
    return this.db.put(
      this.getRootIndexKey(this.config.types.BeaconBlock.hashTreeRoot(block.message)),
      intToBytes(block.message.slot, 64, "be")
    );
  }

  private async storeParentRootIndex(block: SignedBeaconBlock): Promise<void> {
    return this.db.put(
      this.getParentRootIndexKey(block.message.parentRoot),
      intToBytes(block.message.slot, 64, "be")
    );
  }

  private getParentRootIndexKey(parentRoot: Root): Buffer {
    return encodeKey(Bucket.blockArchiveParentRootIndex, parentRoot.valueOf() as Uint8Array);
  }

  private getRootIndexKey(root: Root): Buffer {
    return encodeKey(Bucket.blockArchiveRootIndex, root.valueOf() as Uint8Array);
  }
}
