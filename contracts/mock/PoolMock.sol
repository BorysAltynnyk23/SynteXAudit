import "../pool/Pool.sol";
import "../synth/ERC20X.sol";

contract PoolMock is Pool {

    ERC20X public erc20x;

    function setAddressERC20X(address _erc20x) public {
        erc20x = ERC20X(_erc20x);
    }

    function burnERC20X(address account, uint256 amount) public {
        erc20x.burnInternal(account, amount);
    }
}