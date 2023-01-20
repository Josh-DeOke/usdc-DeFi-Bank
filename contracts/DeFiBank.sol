// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "./IERC20.sol";
import "./ILendingPool.sol";


contract DeFiBank {
    address[] public depositors;
    uint public immutable amount;
    uint public immutable fee;
    bool public isWithdrawing;
    mapping(address => uint) public bankBalance;
    mapping(address => bool) public hasDeposited;

    // AAVE v2 lending pool
    ILendingPool pool = ILendingPool(0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9);
    // the USDC stablecoin
    IERC20 usdc = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    // aave interest bearing USDC
    IERC20 aUsdc = IERC20(0x9bA00D6856a4eDF4665BcA2C2309936572473B7E);

    constructor(uint _amount) {
        amount = _amount;
        // the bank will take a 0.5% fee on all amounts deposits 
        fee = amount * 5 / 1000;
    }

    function deposit() public payable {
        // transfer usdc from the depositor to the bank smartcontract to be deposited
        bool success = usdc.transferFrom(msg.sender, address(this), amount);

        // ensure the return value of the 'transferfrom' function is successful
        require(success, "transfer of funds failed");

        // bank will subtract their fee so ony the difference will be deposited in the pool
        // update the amount that will be deposited into the lending pool
        uint newAmount = (amount - fee);

        // approve the bank smartcontract transferring amount to aave lending pool
        // require statement used to check if the approval was successful or not 
        // and will stop the function from executing if so
        require(usdc.approve(address(pool), newAmount), 'approval failed');

        // deposit usdc into aave lending pool
        pool.deposit(address(usdc), newAmount, address(this), 0);

        // update depositors bank balance in the mapping
        bankBalance[msg.sender] = bankBalance[msg.sender] + newAmount;

        // add user to the list of depositors if they haven't already deposited
        if(!hasDeposited[msg.sender]) {
            depositors.push(msg.sender);
        }

        //update deposited status to keep track
        hasDeposited[msg.sender] = true;
    }
    // function to enable depositors to withdraw only their interest earned
    function withdrawlInterest() public {
        uint interest = (aUsdc.balanceOf(address(this)) - (amount));

        // approve the bank smartcontract spending the interest bearing aUsdc token
        // require statement used to check if the approval was successful or not 
        require(aUsdc.approve(address(pool), interest), "approval failed");

        // prevent reentrancy
        require(!isWithdrawing, "reentrancy detected");
        isWithdrawing = true;

        // iterate through all the depositors and allow any individual depositor to withdrawl any interest earned
        // but still keep the initial amount deposited within the bank
        // this will be an external call to withdrawl the interest on each depositor once and once only
        // this will prevent the external call from being made multiple times over each iteration potentially causing an unintended behavior or an infinite loop
        // the returned value will be saved in the array 'withdrawn'to check the amount withdrawn is the right amount
        // before using that amount to update the depsitors bank balance
        uint[] memory withdrawn = new uint[](depositors.length);
        for(uint i = 0; i < depositors.length; i++) {
            withdrawn[i] = pool.withdraw(address(usdc), interest, depositors[i]);

            // check that the withdrawal was successful and the correct amount was withdrawn i.e. only the interest
            // <= instead of the strict equality operator ==
            // This is so if the variable withdrawn[i] is less than interest for any reason, the function will still execute and the user's can still withdrawl.
            require(withdrawn[i] <= interest, "Incorrect amount withdrawn");
        }
        isWithdrawing = false;

        for(uint i = 0; i < depositors.length; i++) {
            // only withdrawl interest if interest has accrued
            if(withdrawn[i] > 0) {
                // update users bank balance
                bankBalance[depositors[i]] = bankBalance[depositors[i]] - withdrawn[i]; 
            }
        }
    }

    // function to allow depositors to withdraw their total balance(initial deposit + interest)
    function withdrawBalance() public {
        uint balance = aUsdc.balanceOf(address(this));

        // require statement used to check if the approval was successful or not 
        require(aUsdc.approve(address(pool), balance));

        // prevent reentrancy
        require(!isWithdrawing, "reentrancy detected");
        isWithdrawing = true;

        uint[] memory withdrawn2 = new uint[](depositors.length);
        for(uint i = 0; i < depositors.length; i++) {
            withdrawn2[i] = pool.withdraw(address(usdc), balance, depositors[i]);

            // check that the withdrawal was successful and the correct amount was withdrawn i.e. the entire balance
            require(withdrawn2[i] <= balance, "Incorrect amount withdrawn");
        }
        isWithdrawing = false;

        for(uint i = 0; i < depositors.length; i++) {
            // update their balance to 0
            bankBalance[depositors[i]] = 0;

            // delete depositor if they've withdrawn their entire balance
            delete depositors[i];
        }  
    }
}