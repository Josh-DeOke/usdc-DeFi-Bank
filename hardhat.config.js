require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config()
require("solidity-coverage");

const { API_URL, PRIVATE_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.17",
  networks: {
    hardhat: {},
    goerli: {
      url: API_URL,
      accounts: [PRIVATE_KEY]
    }
  }
};

