
const hre = require("hardhat");

async function main() {
  const amount = ethers.utils.parseEther('100');

  const DeFiBank = await hre.ethers.getContractFactory("DeFiBank");
  const deFiBank = await DeFiBank.deploy(amount);

  await deFiBank.deployed();

  console.log("DeFiBank deployed to:", deFiBank.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
