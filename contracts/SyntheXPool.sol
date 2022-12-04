// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./ERC20X.sol";
import "./PriceOracle.sol";
import "./SyntheX.sol";

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract SyntheXPool is ERC20 {
    using SafeMath for uint256;

    SyntheX synthex;

    mapping(address => bool) synths;
    address[] private _synthsList;

    constructor(string memory name, string memory symbol, address _synthex) ERC20(name, symbol) {
        synthex = SyntheX(_synthex);
    }

    /* -------------------------------------------------------------------------- */
    /*                               View Functions                               */
    /* -------------------------------------------------------------------------- */
    function enableSynth(address _token) public {
        synths[_token] = true;
        _synthsList.push(_token);
    }

    function getSynths() public view returns (address[] memory) {
        return _synthsList;
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);
        // revert("Debt tokens cannot be transferred");
    }

    /* -------------------------------------------------------------------------- */
    /*                              Public Functions                              */
    /* -------------------------------------------------------------------------- */

    function issueSynth(address _token, address account, uint amount, uint amountUSD) public {
        require(msg.sender == address(synthex), "Only SyntheX can issue");
        require(synths[_token], "Synth not enabled");

        if(totalSupply() == 0){
            _mint(account, amount);
        } else {
            uint _totalDebt = synthex.getPoolTotalDebtUSD(address(this));
            uint totalSupply = totalSupply();
            uint debtSharePrice = _totalDebt * 1e18 / totalSupply;
            uint mintAmount = amountUSD * 1e18 / debtSharePrice;
            _mint(account, mintAmount);
        }
        ERC20X(_token).mint(account, amount);
    }

    function burnSynth(address _token, address account, uint amount, uint amountUSD) public {
        require(msg.sender == address(synthex), "Only SyntheX can burn");
        require(synths[_token], "Synth not enabled");

        uint _totalDebt = synthex.getPoolTotalDebtUSD(address(this));
        uint totalSupply = totalSupply();
        uint debtSharePrice = _totalDebt * 1e18 / totalSupply;
        uint burnAmount = amountUSD * 1e18 / debtSharePrice;
        _burn(account, burnAmount);
        ERC20X(_token).burn(account, amount);
    }

    function exchange(address src, address dst, address account, uint amount, uint amountDst) public {
        require(msg.sender == address(synthex), "Only SyntheX can exchange");
        require(synths[src], "Synth not enabled");
        require(synths[dst], "Synth not enabled");
        ERC20X(src).burn(account, amount);
        ERC20X(dst).mint(account, amountDst);
    }
}
