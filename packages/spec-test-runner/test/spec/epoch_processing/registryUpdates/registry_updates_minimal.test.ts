import {join} from "path";
import {expect} from "chai";

import {config} from "@chainsafe/lodestar-config/lib/presets/minimal";
import {processRegistryUpdates} from "@chainsafe/lodestar-beacon-state-transition";
import {BeaconState} from "@chainsafe/lodestar-types";
import {describeDirectorySpecTest, InputType} from "@chainsafe/lodestar-spec-test-util/lib/single";
import {StateTestCase} from "../../../utils/specTestTypes/stateTestCase";
import {SPEC_TEST_LOCATION} from "../../../utils/specTestCases";

describeDirectorySpecTest<StateTestCase, BeaconState>(
  "epoch registry updates minimal",
  join(SPEC_TEST_LOCATION, "tests/minimal/phase0/epoch_processing/registry_updates/pyspec_tests"),
  (testcase) => {
    const state = testcase.pre;
    processRegistryUpdates(config, state);
    return state;
  },
  {
    inputTypes: {
      pre: InputType.SSZ,
      post: InputType.SSZ,
    },
    sszTypes: {
      pre: config.types.BeaconState,
      post: config.types.BeaconState,
    },
    getExpected: (testCase => testCase.post),
    expectFunc: (testCase, expected, actual) => {
      expect(config.types.BeaconState.equals(actual, expected)).to.be.true;
    }
  }
);

