pragma solidity 0.6.6;

contract ChainlinkOracleTest {
    int256 answer;

    constructor(int256 _answer) public {
        answer = _answer;
    }

    function latestAnswer() external view virtual returns (int256) {
        return answer;
    }
}
