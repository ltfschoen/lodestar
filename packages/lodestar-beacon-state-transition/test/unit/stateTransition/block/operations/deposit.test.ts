/* eslint-disable @typescript-eslint/no-unused-vars */
import sinon from "sinon";
import mockery from "mockery";
import {expect} from "chai";
import {afterEach, beforeEach, describe, it} from "mocha";
import {config} from "@chainsafe/lodestar-config/lib/presets/mainnet";
import * as utils from "../../../../../src/util";
import {bigIntMin, intToBytes, assert} from "@chainsafe/lodestar-utils";
import {generateState} from "../../../../utils/state";
import {generateDeposit} from "../../../../utils/deposit";
import {generateValidator} from "../../../../utils/validator";

describe("process block - deposits", function () {

  const sandbox = sinon.createSandbox();
  const verifyMerkleBranchStub = sinon.stub();
  let processDeposit: Function, getTemporaryBlockHeaderStub, getBeaconProposeIndexStub, blsStub = sinon.stub();

  before(function () {
    mockery.registerMock("@chainsafe/lodestar-utils", {
      "verifyMerkleBranch": verifyMerkleBranchStub,
      "bigIntMin": bigIntMin,
      "intToBytes": intToBytes,
      "assert": assert
    });
    mockery.registerMock("@chainsafe/bls", {
      verify: blsStub
    });
    mockery.enable({useCleanCache: true, warnOnReplace: false, warnOnUnregistered: false});
  });

  beforeEach(() => {
    getTemporaryBlockHeaderStub = sandbox.stub(utils, "getTemporaryBlockHeader");
    getBeaconProposeIndexStub = sandbox.stub(utils, "getBeaconProposerIndex");
    blsStub.resetHistory();
    verifyMerkleBranchStub.resetHistory();
    processDeposit = require("../../../../../src/block/operations").processDeposit;
  });

  afterEach(() => {
    sandbox.restore();
  });

  after(function () {
    mockery.deregisterMock("@chainsafe/lodestar-utils");
    mockery.disable();
  });

  it("should fail to process deposit - invalid merkle branch", function () {
    const state = generateState();
    verifyMerkleBranchStub.returns(false);
    try {
      processDeposit(config, state, generateDeposit());
    } catch (e) {
      expect(verifyMerkleBranchStub.calledOnce).to.be.true;
    }
  });

  it("should fail to process deposit - invalid deposit index", function () {
    const state = generateState({eth1DepositIndex: 3});
    verifyMerkleBranchStub.returns(true);
    try {
      processDeposit(config, state, generateDeposit());
    } catch (e) {
      expect(verifyMerkleBranchStub.calledOnce).to.be.true;
    }
  });

  it("should process deposit - new validator - invalid signature", function () {
    const state = generateState({eth1DepositIndex: 3});
    verifyMerkleBranchStub.returns(true);
    const deposit = generateDeposit();
    try {
      processDeposit(config, state, deposit);
    } catch (e) {
      expect(verifyMerkleBranchStub.calledOnce).to.be.true;
      expect(state.validators.length).to.be.equal(0);
      expect(state.balances.length).to.be.equal(0);
    }
  });

  it("should process deposit - new validator", function () {
    const state = generateState({eth1DepositIndex: 3});
    verifyMerkleBranchStub.returns(true);
    const deposit = generateDeposit();
    deposit.data.amount = config.params.MAX_EFFECTIVE_BALANCE;
    blsStub.returns(true);
    try {
      processDeposit(config, state, deposit);
      expect(verifyMerkleBranchStub.calledOnce).to.be.true;
      expect(state.validators.length).to.be.equal(1);
      expect(state.balances.length).to.be.equal(1);
      expect(blsStub.calledOnce).to.be.true;
    } catch (e) {
      expect.fail(e.stack);
    }
  });

  it("should process deposit - increase deposit", function () {
    const state = generateState({eth1DepositIndex: 3});
    verifyMerkleBranchStub.returns(true);
    const deposit = generateDeposit();
    const validator = generateValidator();
    state.validators.push(validator);
    state.balances.push(0n);
    deposit.data.pubkey = validator.pubkey;
    try {
      processDeposit(config, state, deposit);
      expect(verifyMerkleBranchStub.calledOnce).to.be.true;
      expect(state.balances[0].toString()).to.be.equal(deposit.data.amount.toString());
    } catch (e) {
      expect.fail(e);
    }
  });

});
