// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;


import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/IERC20.sol";

contract BinaryBetting {
    address public admin; // Bot address that controls the game creation and resolution
    IERC20 public usdcToken; // USDC token contract instance

    // Hardcode the USDC token address
    constructor() {
        admin = msg.sender; // Set the contract creator as the admin address
        usdcToken = IERC20(0x7Cf76E740Cb23b99337b21F392F22c47Ad910c67); // USDC token address on SKALE
    }

    struct Game {
        string gameName;        // Name of the game, e.g., "Mavs vs Lakers"
        address[] yesVoters;    // Addresses that voted "Yes"
        address[] noVoters;     // Addresses that voted "No"
        uint totalStake;        // Total stake (USDC) for the game
        bool resolved;          // Whether the game has been resolved
        bool yesWon;            // Outcome of the game (true for "Yes", false for "No")
    }

    // Array to store all games
    Game[] public games;

    // Event to be emitted when a new game is created
    event GameCreated(uint gameId, string gameName, uint totalStake);

    // Event to be emitted when a game is resolved and funds distributed
    event GameResolved(uint gameId, bool yesWon, uint totalDistributed);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    // Function to create a new betting game
    function createGame(
        string memory _gameName,
        address[] memory _yesVoters,
        address[] memory _noVoters,
        uint _stake
    ) external onlyAdmin returns (uint) { // Can only be called by the handler/bot
        require(_stake > 0, "Stake must be greater than 0");

        // Transfer USDC from the admin to this contract
        require(usdcToken.transferFrom(msg.sender, address(this), _stake), "Transfer failed");

        Game storage newGame = games.push();
        newGame.gameName = _gameName;
        newGame.yesVoters = _yesVoters;
        newGame.noVoters = _noVoters;
        newGame.totalStake = _stake;
        newGame.resolved = false;

        uint gameId = games.length - 1;

        // Emit the event that a new game has been created
        emit GameCreated(gameId, _gameName, _stake);
        return gameId;
    }

    // Function to set the decision of the game and distribute the rewards
    function resolveAndDistribute(uint gameId, bool _yesWon) external onlyAdmin {
        Game storage game = games[gameId];
        require(!game.resolved, "Game is already resolved");

        // Set the game outcome
        game.yesWon = _yesWon;
        game.resolved = true;

        // Calculate the total reward to be split based on votes
        uint totalWinners = _yesWon ? game.yesVoters.length : game.noVoters.length;
        require(totalWinners > 0, "No winning votes");

        // Distribute the rewards equally among the winning voters
        uint rewardPerWinner = game.totalStake / totalWinners;
        address[] storage winners = _yesWon ? game.yesVoters : game.noVoters;

        for (uint i = 0; i < winners.length; i++) {
            require(usdcToken.transfer(winners[i], rewardPerWinner), "Failed to send USDC");
        }

        // Emit the resolution and distribution event
        emit GameResolved(gameId, _yesWon, game.totalStake);
    }
}
