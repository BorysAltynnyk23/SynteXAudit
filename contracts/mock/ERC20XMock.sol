import "../synth/ERC20X.sol";

contract ERC20XMock is ERC20X {

    function getFlashFee(address token, uint256 amount) public view returns (uint256) {
        token;
        uint256 ff = _flashFee(token, amount);
        return ff;
    }

    function getFlashFeeReceiver() public view returns (address) {
        address vault = _flashFeeReceiver();
        return vault;
    }
}
