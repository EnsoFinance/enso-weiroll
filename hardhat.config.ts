import "@nomiclabs/hardhat-waffle";
import type { HardhatUserConfig } from "hardhat/types";

const userConfig: HardhatUserConfig = {
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 2000000,
  },
  solidity: {
    compilers: [
      {
        version: '0.8.16',
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 100000,
          },
        },
      },
    ],
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
  },
};
export default userConfig;
