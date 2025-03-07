import { HardhatUserConfig, task } from "hardhat/config";
import '@openzeppelin/hardhat-upgrades';
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter"
import "@openzeppelin/hardhat-defender"
import "hardhat-openzeppelin-defender";
import 'solidity-docgen';
require('dotenv').config();

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ARBITRUM_GOERLI_RPC = process.env.ARBITRUM_GOERLI_RPC ?? 'https://goerli.arbitrum.io/rpc';


const config: any = {
  docgen: {},
  defender: {
    apiKey: process.env.DEFENDER_TEAM_API_KEY!,
    apiSecret: process.env.DEFENDER_TEAM_API_SECRET_KEY!,
  },
  OpenzeppelinDefenderCredential: {
    apiKey: process.env.DEFENDER_TEAM_API_KEY!,
    apiSecret: process.env.DEFENDER_TEAM_API_SECRET_KEY!,
  },
  solidity: {
    compilers: [
      {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          }
        },
      },
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          }
        },
      },
      {
        version: "0.4.18"
      },
    ],
  },
  mocha: {
    timeout: 100000000
  },
  networks: {
    hardhat: {
      isLive: false,
    },
    arbitrumGoerli: {
      url: ARBITRUM_GOERLI_RPC,
      accounts: [`0x${PRIVATE_KEY}`],
      chainId: 421613,
      gasLimit: 1000000000,
      isLive: true,
    },
    goerli: {
      url: "https://rpc.ankr.com/eth_goerli",
      accounts: [`0x${PRIVATE_KEY}`],
      chainId: 5,
      // gasPrice: 1000000000000 // 1000 wei
    },
    localhost: {
      url: "http://localhost:8545",
      chainId: 31337,
      isLive: false
    },
  },
  gasReporter: {
    enabled: false,
    currency: 'USD',
    gasPrice: 13,
    coinmarketcap: process.env.CMC_API_KEY
  },
  etherscan:{
    apiKey: {
      arbitrumGoerli: process.env.ARBITRUM_GOERLI_ETHERSCAN ?? ''
    }
  }
};

export default config;