require("@nomicfoundation/hardhat-toolbox");

require("dotenv").config();

module.exports = {
 solidity: "0.8.10",
 networks: {
  hardhat: {
    forking: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.INFURA_API_KEY}`,
    },
    allowUnlimitedContractSize: true
  }
 }
};
