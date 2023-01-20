const { expect, assert } = require("chai");
const { ethers, faucet } = require("hardhat");

describe('DeFiBank', function () {
  let deFiBank;
  let usdc;
  let aUsdc;
  let depositors;
  const amount = ethers.utils.parseEther('100');
  
  this.beforeEach(async () => {
    usdc = await ethers.getContractAt("IERC20", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    aUsdc = await ethers.getContractAt("IERC20", "0x9bA00D6856a4eDF4665BcA2C2309936572473B7E");
    pool = await ethers.getContractAt("ILendingPool", "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9");

    depositors = (await ethers.provider.listAccounts()).slice(1, 4);

    const DeFiBank = await ethers.getContractFactory("DeFiBank");
    deFiBank = await DeFiBank.deploy(amount);
    await deFiBank.deployed();    

  });

  it('should set the banks take fee', async () => {
    const fee = await deFiBank.fee();
    assert(fee);
  });

  it('should deposit usdc into bank smart contract and update depositors balance', async () => {
    for (let i = 0; i < depositors.length; i++) {
      const signer = await ethers.provider.getSigner(depositors[i]);
      // ensure each depositor has approved the contract to transfer amount to smart contract
      await usdc.connect(signer).approve(deFiBank.address, amount);
      // depositors intial usdc balance
      const initialUsdcBalance = await usdc.balanceOf(depositors[i]);
      // call deposit function
      await deFiBank.connect(signer).deposit({value: amount});
      // depositors new usdc balance
      const finalUsdcBalance = await usdc.balanceOf(depositors[i]);
      // Check that the depositor's USDC balance decreases by the deposit amount
      expect.equal(finalUsdcBalance.toString(), (initialUsdcBalance.sub(amount)).toString());
      // check the transfer was successful
      const contractUsdcBalance = await usdc.balanceOf(deFiBank.address);
      expect.equal(contractUsdcBalance.toString(), (contractUsdcBalance.add(amount).toString()));
      // revert if transfer was unsuccessful
      await assert.reverts(deFiBank.connect(signer).deposit({value: amount}), "transfer of funds failed");
      // approve and deposit the usdc into the leding pool
      const fee = await deFiBank.fee();
      assert(fee);
      // bank only deposits amount - fees
      const newAmount = amount - fee;
      await usdc.connect(signer).approve(pool.address, newAmount);
      // revert if approval fails
      await assert.reverts(usdc.connect(signer).approve(pool.address, newAmount), "approval failed");
      // check that the DeFiBank contract now has an aUsdc balance
      const contractAUsdcBalance = await aUsdc.balanceOf(deFiBank.address);
      expect((contractAUsdcBalance.gte(newAmount.mul(depositors.length))).toString());
      // Check that the depositor's bank balance(mapping) increases by 
      // (amount - fee) after deposit() is called
      const initalBankBalance = await deFiBank.bankBalance(depositors[i]);
      const finalBankBalance = await deFiBank.bankBalance(depositors[i]);
      expect.equal(finalBankBalance.toString(), (initalBankBalance.add(newAmount)).toString());
      // check the depositor has been added to the list of depositors if they have not already deposited
      const depositorAdded = await deFiBank.hasDeposited(depositors[i]);
      assert.isTrue(depositorAdded);
    }
  });
  
  it('should withdrawal Interest and update deopsitors balance', async () => {
    for(let i = 0; i < depositors.length; i++) {
      const signer = await ethers.provider.getSigner(depositors[i]);
      const initBankAusdcBalance = await aUsdc.balanceOf(deFiBank.address);
      const interest = await (aUsdc.balanceOf(deFiBank.address)).sub(initBankAusdcBalance);
      const finBankAusdcBalance = await aUsdc.balanceOf(deFiBank.address);

      // ensure depositors have approved the pool to spend their aUsdc to transfer the interest earned
      await aUsdc.connect(signer).approve(pool.address, interest);
      // revert transaction if the approval failed
      await assert.reverts(aUsdc.connect(signer).approve(pool.address, interest), "approval failed");

      // withdrawl interest
      const withdrawn = await pool.connect(signer).withdrawlInterest({value: interest});
      // check the withdrawn amount is equal to expected amount
      assert.isTrue(withdrawn == interest);
      // revert if amount withdrawn is not equal to interest rate
      await assert.reverts(pool.connect(signer).withdrawlInterest({value: interest}), "Incorrect amount withdrawn");

      // check the bank contract's intial aUsdc balance decreases by the interest amount
      expect.equal(finBankAusdcBalance, initBankAusdcBalance.sub(interest));
      
      // check that the depositers usdc balance increases by the interest amount
      const initDepositorUsdcBalance = await usdc.balanceOf(depositors[i]);
      const finDepositorUsdcBalance = await usdc.balanceOf(depositors[i]);
      expect.equal(finDepositorUsdcBalance, initDepositorUsdcBalance.add(interest));

      // Check that the depositor's bank balance(mapping) decreases by 
      // the interest amount after withdrawlInterest() has been called only if interest > 0
      if(interest > 0) {
        const initlBankBalance = await deFiBank.bankBalance(depositors[i]);
        const finBankBalance = await deFiBank.bankBalance(depositors[i]);
        expect.equal(finBankBalance, initlBankBalance.sub(interest));
      }
      // check to make sure depositor can't withdraw interest more than once by calling the function recursively
      await pool.connect(signer).withdrawlInterest({value: interest});
      await assert.reverts(pool.connect(signer).withdrawlInterest({value: interest}), "reentrancy detected");
    }
  });

  it('should withdrawl total usdc balance and update depositors bank balance', async () => {
    for(let i = 0; i < depositors.length; i++) {
      const signer = await ethers.provider.getSigner(depositors[i]);
      const initialBankAusdcBalance = await aUsdc.balanceOf(deFiBank.address);
      const interest = await (aUsdc.balanceOf(deFiBank.address)).sub(initialBankAusdcBalance);

      // ensure depositors have approved the pool to spend their aUsdc to transfer their total balance
      await aUsdc.connect(signer).approve(pool.address, (initialBankAusdcBalance + interest));
      // revert transaction if the approval failed
      await assert.reverts(aUsdc.connect(signer).approve(pool.address, (initialBankAusdcBalance + interest), "approval failed"));

      // withdrawl total balance
      const withdrawl = await pool.connect(signer).withdrawlBalance({value: amount + interest});
      // check the withdrawn amount is equal to expected amount
      assert.isTrue(withdrawl == (initialBankAusdcBalance + interest));
      // revert if amount withdrawn is not equal to expected amount
      await assert.reverts(pool.connect(signer).withdrawlBalance({value: initialBankAusdcBalance}), "Incorrect amount withdrawn");

      // check the bank contract's intial aUsdc balance decreases by the interest amount
      const finalBankAusdcBalance = await aUsdc.balanceOf(deFiBank.address);
      expect.equal(finalBankAusdcBalance, initialBankAusdcBalance.sub(amount + interest));
      
      // check that the depositers usdc balance increases by the interest amount
      const initialDepositorUsdcBalance = await usdc.balanceOf(depositors[i]);
      const finalDepositorUsdcBalance = await usdc.balanceOf(depositors[i]);
      expect.equal(finalDepositorUsdcBalance, initialDepositorUsdcBalance.add(amount + interest));

      // Check that the depositor's bank balance(mapping) should be 0 
      const BankBalance = await deFiBank.bankBalance(depositors[i]);
      expect.equal(bankBalance, 0);
      
      // check to make sure depositor can't withdraw balance more than once 
      // by calling the function recursively e.g. reentrancy attack
      await pool.connect(signer).withdrawlBalance({value: amount + interest});
      await assert.reverts(pool.connect(signer).withdrawlBalance({value: amount + interest}), "reentrancy detected");
    }
  });
});