// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IMargin {

    event OpenPosition(address maker, address taker, address token0, address token1, uint price, uint amountToFill);
    event ClosePosition(address maker, address taker, address token0, address token1, uint price, uint amountToFill);
   
}