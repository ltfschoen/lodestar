import {Options} from "yargs";

export {chainGenesisStateFile} from "../../beacon/cmds/run/options/chain";

export const chainPreset: Options = {
  alias: [
    "chain.preset",
    "chain.name",
  ],
  description: "Specifies the default eth2 spec type",
  type: "string",
  choices: ["mainnet", "minimal"],
  default: "minimal",
};

export interface IChainArgs {
  chain?: {
    name?: string;
    genesisStateFile?: string;
  };
}
