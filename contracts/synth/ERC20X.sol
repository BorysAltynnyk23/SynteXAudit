// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20FlashMintUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";

import "../synthex/ISyntheX.sol";
import "../pool/IPool.sol";

import "../libraries/Errors.sol";

/**
 * @title ERC20X
 * @dev Synthetic token with minting and burning
 * @dev ERC20FlashMint for flash loan with fee (used to burn debt)
 */
contract ERC20X is ERC20Upgradeable, ERC20PermitUpgradeable, ERC20FlashMintUpgradeable, PausableUpgradeable, MulticallUpgradeable {
    // Pool that this token belong to
    IPool public pool; 
    // SyntheX contract 
    ISyntheX public synthex;
    /// @notice Fee charged for flash loan % in BASIS_POINTS
    uint public flashLoanFee;
    /// @notice Basis points: 1e4 * 1e18 = 100%
    uint public constant BASIS_POINTS = 10000e18;

    /// @notice Emitted when flash fee is updated
    event FlashFeeUpdated(uint _flashLoanFee);

    event Referred(address indexed referredBy, address indexed account);

    function initialize(string memory _name, string memory _symbol, address _pool, address _synthex) initializer external {
        __ERC20_init(_name, _symbol);
        __ERC20FlashMint_init();
        __Pausable_init();
        __Multicall_init();

        // check if supports interface
        require(IPool(_pool).supportsInterface(type(IPool).interfaceId), Errors.INVALID_ADDRESS);
        pool = IPool(payable(_pool));
        // check if supports interface
        require(ISyntheX(_synthex).supportsInterface(type(ISyntheX).interfaceId), Errors.INVALID_ADDRESS);
        synthex = ISyntheX(_synthex);
    }

    modifier onlyInternal(){
        require(msg.sender == address(pool), Errors.NOT_AUTHORIZED);
        _;
    }

    /* -------------------------------------------------------------------------- */
    /*                             External Functions                             */
    /* -------------------------------------------------------------------------- */
    /**
     * @notice Mint token. Issue debt
     * @param amount Amount of token to mint
     */
    function mint(uint256 amount, address recipient, address referredBy) external whenNotPaused {
        // ensure amount is greater than 0
        require(amount > 0, Errors.ZERO_AMOUNT);
        uint amountToMint = pool.commitMint(msg.sender, amount);
        // check if amount is correct
        require(amountToMint <= amount, Errors.INVALID_AMOUNT);
        _mint(recipient, amountToMint);
        if(referredBy != address(0)){
            emit Referred(referredBy, msg.sender);
        }
    }

    /**
     * @notice Burn synth. Repays debt
     * @param amount Amount of token to burn
     */
    function burn(uint256 amount) external whenNotPaused {
        require(amount > 0, Errors.ZERO_AMOUNT);
        uint amountToBurn = pool.commitBurn(msg.sender, amount);
        // check if amount is correct
        require(amountToBurn <= amount, Errors.INVALID_AMOUNT);
        _burn(msg.sender, amountToBurn);
    }

    /**
     * @notice Swap synth to another synth in pool
     * @param amount Amount of token to swap
     * @param synthTo Synth to swap to
     */
    function swap(uint256 amount, address synthTo, address _recipient, address referredBy) external whenNotPaused {
        require(amount > 0, Errors.ZERO_AMOUNT);
        uint amountToSwap = pool.commitSwap(_recipient, amount, synthTo);
        // check if amount is correct
        require(amountToSwap <= amount, Errors.INVALID_AMOUNT);
        _burn(msg.sender, amountToSwap);
        if(referredBy != address(0)){
            emit Referred(referredBy, msg.sender);
        }
    }

    /**
     * @notice Liquidate with this synth
     * @param account Account to liquidate
     * @param amount Amount of this token to liquidate
     * @param outAsset Collateral to receive
     */
    function liquidate(address account, uint256 amount, address outAsset) external whenNotPaused {
        require(amount > 0, Errors.ZERO_AMOUNT);
        uint amountToBurn = pool.commitLiquidate(msg.sender, account, amount, outAsset);
        // check if amount is correct
        require(amountToBurn <= amount, Errors.INVALID_AMOUNT);
        _burn(msg.sender, amountToBurn);
    }

    /* -------------------------------------------------------------------------- */
    /*                            Restricted Functions                            */
    /* -------------------------------------------------------------------------- */
    /**
     * @notice Debt pool contract minting synth
     * @param account Account to mint token
     * @param amount Amount of tokens to mint
     */
    function mintInternal(address account, uint256 amount) onlyInternal external {
        _mint(account, amount);
    }

    /**
     * @notice Debt pool contract burning synth
     * @param account Account to burn from
     * @param amount Amount of tokens to burn
     */
    function burnInternal(address account, uint256 amount) onlyInternal external {
        _burn(account, amount);
    }

    /* -------------------------------------------------------------------------- */
    /*                               Admin Functions                              */
    /* -------------------------------------------------------------------------- */
    /**
     * @dev Pause the token
     * @dev Only callable by L2 admin
     */
    function pause() external {
        require(synthex.isL2Admin(msg.sender), Errors.CALLER_NOT_L2_ADMIN);
        _pause();
    }

    /**
     * @dev Unpause the token
     * @dev Only callable by L2 admin
     */
    function unpause() external {
        require(synthex.isL2Admin(msg.sender), Errors.CALLER_NOT_L2_ADMIN);
        _unpause();
    }

    /* -------------------------------------------------------------------------- */
    /*                                 Flash Mint                                 */
    /* -------------------------------------------------------------------------- */
    /**
     * @notice Update flash fee
     * @param _flashLoanFee New flash fee
     */
    function updateFlashFee(uint _flashLoanFee) public {
        require(synthex.isL1Admin(msg.sender), Errors.CALLER_NOT_L1_ADMIN);
        require(_flashLoanFee <= BASIS_POINTS, Errors.INVALID_AMOUNT);
        flashLoanFee = _flashLoanFee;
        emit FlashFeeUpdated(_flashLoanFee);
    }

    /**
     * @notice Return flash fee = amount * flashLoanFee / 1e18
     * @param token Token address
     * @param amount Amount of token
     */
    function _flashFee(address token, uint256 amount) internal view override returns (uint256) {
        // silence warning about unused variable without the addition of bytecode.
        token;
        return amount * (flashLoanFee) / (BASIS_POINTS);
    }    

    function _flashFeeReceiver() internal view override returns (address) {
        return synthex.vault();
    }
}