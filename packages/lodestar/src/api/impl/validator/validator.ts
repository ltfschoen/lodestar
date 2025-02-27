/**
 * @module api/rpc
 */

import {
  AggregateAndProof,
  Attestation,
  AttestationData,
  AttesterDuty,
  BeaconBlock,
  BLSPubkey,
  BLSSignature,
  Bytes96,
  CommitteeIndex,
  Epoch,
  ProposerDuty,
  SignedAggregateAndProof,
  SignedBeaconBlock,
  Slot
} from "@chainsafe/lodestar-types";
import {IBeaconConfig} from "@chainsafe/lodestar-config";
import {assert} from "@chainsafe/lodestar-utils";
import {IBeaconDb} from "../../../db";
import {IBeaconChain} from "../../../chain";
import {IValidatorApi} from "./interface";
import {assembleBlock} from "../../../chain/factory/block";
import {ApiNamespace, IApiModules} from "../../index";
import {IApiOptions} from "../../options";
import {ILogger} from "@chainsafe/lodestar-utils/lib/logger";
import {INetwork} from "../../../network";
import {
  computeEpochAtSlot,
  computeSigningRoot,
  computeStartSlotAtEpoch,
  getBeaconProposerIndex,
  getDomain,
  computeSubnetForSlot,
} from "@chainsafe/lodestar-beacon-state-transition";
import {
  processSlots,
} from "@chainsafe/lodestar-beacon-state-transition/lib/fast/slot";
import {Signature, verify} from "@chainsafe/bls";
import {DomainType, EMPTY_SIGNATURE} from "../../../constants";
import {assembleAttesterDuty} from "../../../chain/factory/duties";
import {assembleAttestation} from "../../../chain/factory/attestation";
import {IBeaconSync} from "../../../sync";

export class ValidatorApi implements IValidatorApi {

  public namespace: ApiNamespace;

  private config: IBeaconConfig;
  private chain: IBeaconChain;
  private db: IBeaconDb;
  private network: INetwork;
  private sync: IBeaconSync;
  private logger: ILogger;

  public constructor(
    opts: Partial<IApiOptions>,
    modules: Pick<IApiModules, "config"|"chain"|"db"|"sync"|"network"|"logger">
  ) {
    this.namespace = ApiNamespace.VALIDATOR;
    this.config = modules.config;
    this.chain = modules.chain;
    this.db = modules.db;
    this.network = modules.network;
    this.sync = modules.sync;
    this.logger = modules.logger;
  }

  public async produceBlock(slot: Slot, validatorPubkey: BLSPubkey, randaoReveal: Bytes96): Promise<BeaconBlock> {
    const validatorIndex = (await this.chain.getHeadEpochContext()).pubkey2index.get(validatorPubkey);
    return await assembleBlock(
      this.config, this.chain, this.db, slot, validatorIndex, randaoReveal
    );
  }

  public async produceAttestation(
    validatorPubKey: BLSPubkey,
    index: CommitteeIndex,
    slot: Slot,
  ): Promise<Attestation> {
    try {
      const [headBlock, {state: headState, epochCtx}] = await Promise.all([
        this.chain.getHeadBlock(),
        this.chain.getHeadStateContext(),
      ]);
      if (slot > headState.slot) {
        processSlots(epochCtx, headState, slot);
      }
      return await assembleAttestation(
        {config: this.config, db: this.db},
        headState,
        headBlock.message,
        epochCtx.pubkey2index.get(validatorPubKey),
        index,
        slot
      );
    } catch (e) {
      this.logger.warn(`Failed to produce attestation because: ${e.message}`);
    }
  }

  public async publishBlock(signedBlock: SignedBeaconBlock): Promise<void> {
    await Promise.all([
      this.chain.receiveBlock(signedBlock),
      this.network.gossip.publishBlock(signedBlock)
    ]);
  }

  public async publishAttestation(attestation: Attestation): Promise<void> {
    await Promise.all([
      this.network.gossip.publishCommiteeAttestation(attestation),
      this.db.attestation.add(attestation)
    ]);
  }

  public async getProposerDuties(epoch: Epoch): Promise<ProposerDuty[]> {
    const {state, epochCtx} = await this.chain.getHeadStateContext();
    assert.gte(epoch, 0, "Epoch must be positive");
    assert.lte(
      epoch,
      computeEpochAtSlot(this.config, state.slot) + 2,
      "Cannot get duties for epoch more than two ahead"
    );
    const startSlot = computeStartSlotAtEpoch(this.config, epoch);
    if(state.slot < startSlot) {
      processSlots(epochCtx, state, startSlot);
    }
    const duties: ProposerDuty[] = [];

    for(let slot = startSlot; slot < startSlot + this.config.params.SLOTS_PER_EPOCH; slot++) {
      const blockProposerIndex = getBeaconProposerIndex(this.config, {...state, slot});
      duties.push({slot, proposerPubkey: state.validators[blockProposerIndex].pubkey});
    }
    return duties;
  }

  public async getAttesterDuties(epoch: number, validatorPubKeys: BLSPubkey[]): Promise<AttesterDuty[]> {
    const {epochCtx, state} = await this.chain.getHeadStateContext();
    const validatorIndexes = validatorPubKeys.map((key) => epochCtx.pubkey2index.get(key));

    return validatorIndexes.map((validatorIndex) => {
      return assembleAttesterDuty(
        this.config,
        {publicKey: state.validators[validatorIndex].pubkey, index: validatorIndex},
        state,
        epoch
      );
    });
  }

  public async publishAggregateAndProof(
    signedAggregateAndProof: SignedAggregateAndProof,
  ): Promise<void> {
    await Promise.all([
      this.db.aggregateAndProof.add(signedAggregateAndProof.message),
      this.network.gossip.publishAggregatedAttestation(signedAggregateAndProof)
    ]);
  }

  public async getWireAttestations(epoch: number, committeeIndex: number): Promise<Attestation[]> {
    return await this.db.attestation.getCommiteeAttestations(epoch, committeeIndex);
  }

  public async produceAggregateAndProof(
    attestationData: AttestationData, aggregator: BLSPubkey
  ): Promise<AggregateAndProof> {
    const attestations = (await this.getWireAttestations(
      computeEpochAtSlot(this.config, attestationData.slot),
      attestationData.index
    )
    );
    const epochCtx = await this.chain.getHeadEpochContext();
    const aggregate = attestations.filter((a) => {
      return this.config.types.AttestationData.equals(a.data, attestationData);
    }).reduce((current, attestation) => {
      try {
        current.signature = Signature
          .fromCompressedBytes(current.signature.valueOf() as Uint8Array)
          .add(Signature.fromCompressedBytes(attestation.signature.valueOf() as Uint8Array))
          .toBytesCompressed();
        let index = 0;
        for(const bit of attestation.aggregationBits) {
          if(bit) {
            current.aggregationBits[index] = true;
          }
          index++;
        }
      } catch (e) {
        //ignored
      }
      return current;
    });

    return {
      aggregate,
      aggregatorIndex: epochCtx.pubkey2index.get(aggregator),
      selectionProof: EMPTY_SIGNATURE
    };
  }

  public async subscribeCommitteeSubnet(
    slot: Slot, slotSignature: BLSSignature, committeeIndex: CommitteeIndex, aggregatorPubkey: BLSPubkey
  ): Promise<void> {
    const state = await this.chain.getHeadState();
    const domain = getDomain(
      this.config,
      state,
      DomainType.SELECTION_PROOF,
      computeEpochAtSlot(this.config, slot));
    const signingRoot = computeSigningRoot(this.config, this.config.types.Slot, slot, domain);
    const valid = verify(
      aggregatorPubkey.valueOf() as Uint8Array,
      signingRoot,
      slotSignature.valueOf() as Uint8Array,
    );
    if(!valid) {
      throw new Error("Invalid slot signature");
    }
    await this.sync.collectAttestations(
      slot,
      committeeIndex
    );
    const subnet = computeSubnetForSlot(this.config, state, slot, committeeIndex);
    await this.network.searchSubnetPeers(String(subnet));
  }

}
