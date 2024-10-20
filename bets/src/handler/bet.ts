import { HandlerContext, User } from "@xmtp/message-kit";
import OpenAI from "openai";
import axios from "axios";
import { ethers } from "ethers";

// Skale Network and Contracts Setup
// const skaleRpcUrl = "https://testnet.skalenodes.com/v1/giant-half-dual-testnet";
const privateKey = process.env.PRIVATE_KEY!;
const usdcAddress = "0x9C9172a30D789CD78705eA51c99b31ADB6bDFf4e";
const binaryBettingAddress = "0x46801AB04Ad479EC71308D187B4eA0231CF43F48";

// Contract ABIs
const usdcAbi = [
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint() external",
];

const binaryBettingAbi = [
  "function createGame(string memory _gameName, address[] memory _yesVoters, address[] memory _noVoters, uint _stake) returns (uint256)",
  "function resolveAndDistribute(uint gameId, bool _yesWon)",
  "function games(uint256) view returns (string memory gameName, uint256 totalStake, bool resolved, bool yesWon)",
];

// Initialize Contracts and Wallet
let provider,
  signer,
  usdcContract: ethers.Contract,
  binaryBettingContract: ethers.Contract;

function instantiateConnection() {
  provider = new ethers.JsonRpcProvider(process.env.SKALE_RPC_URL);
  signer = new ethers.Wallet(privateKey, provider);
  usdcContract = new ethers.Contract(usdcAddress, usdcAbi, signer);
  binaryBettingContract = new ethers.Contract(
    binaryBettingAddress,
    binaryBettingAbi,
    signer
  );
}

async function approveUSDC(amount: bigint) {
  const approveAmount = ethers.parseUnits(amount.toString(), 6); // Convert to USDC decimal format
  const approveTx = await usdcContract.approve(
    binaryBettingAddress,
    approveAmount
  );
  await approveTx.wait();
  console.log(`USDC approved for spending: ${amount} USDC`);
}

async function createGame(
  gameName: string,
  yesVoters: string[],
  noVoters: string[],
  stake: bigint
) {
  const stakeAmount = ethers.parseUnits(stake.toString(), 6); // Convert to USDC decimal format
  console.log(yesVoters);
  const createGameTx = await binaryBettingContract.createGame(
    gameName,
    yesVoters,
    noVoters,
    stakeAmount
  );
  const receipt = await createGameTx.wait();
  console.log("Transaction receipt:", receipt);
}

async function resolveGame(gameId: number, yesWon: boolean) {
  const resolveGameTx = await binaryBettingContract.resolveAndDistribute(
    gameId,
    yesWon
  );
  await resolveGameTx.wait();
  console.log(`Bet ${gameId} resolved with outcome: ${yesWon ? "Yes" : "No"}`);
}

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY,
});

interface Bet {
  prompt: string;
  amount: number;
  agreedUsers: string[];
  disagreedUsers: string[];
  responses: Map<string, string>;
  status: string;
  timestamps: {
    createdAt: number;
  };
}

const Bets = new Map();
let activeBetCounter = 14;
let systemPrompt;
let reply;

// Main handler function for processing commands
export async function handler(context: HandlerContext) {
  if (!process?.env?.OPEN_AI_API_KEY) {
    console.log("No OPEN_AI_API_KEY found in .env");
    return;
  }

  const {
    message: {
      content: { command, params },
    },
  } = context;

  switch (command) {
    case "bet":
      const rawPrompt = params.prompt;
      const rawAmount = params.amount;

      // Ensure that the last part is treated as the amount, while the rest is the prompt
      const words = rawPrompt.split(" ");
      const amount = parseFloat(words.pop()); // Extracts the last element as the amount
      const prompt = words.join(" "); // Remaining words form the prompt

      if (!prompt || isNaN(amount)) {
        context.reply(
          "Invalid bet format. Please provide a prompt and a valid amount."
        );
        return;
      }

      // Get current timestamp
      const currentTimestamp = Date.now();

      systemPrompt = `
      ### Context
      Given the current timestamp ${currentTimestamp} and user promt to bet on a winning outcome sometime in the future, figure out when they are trying to place the bet and output it in the format e.g 2024-10-19.
      The current year is 2024. All future dates will be creater than 2024 October 18
      ### Output: 
      Just the time in the format e.g. "2024-10-19"
      `;

      reply = (await textGeneration(prompt, systemPrompt)).reply;

      const betTimestamp = new Date(reply).getTime();

      console.log("Future time:", reply);

      const sportsData = await fetchNBAGames(reply);
      console.log("sportsData", sportsData);

      systemPrompt = `
      ### Context
      You are a helpful bot agent that lives inside a web3 messaging group for making sports bets. You job is to help see if the provided prompt can be cross reference with an api response
      to see if the existing sports bet is happening or happened and can be scheduled irrelevant of outcome. I will be pasting the data source and it needs to see if current user prompt can be used to place a bet.
      Remember you are not reporting any outcomes just seeing if a game exists that the user is prompting.
      Here is an example:
      sportsData [
      {
        id: 14110,
        date: '2024-10-19T00:00:00.000Z',
        visitor_name: 'Cleveland Cavaliers',
        home_name: 'Chicago Bulls',
        winner: 'Chicago Bulls'
      },
      {
        id: 14111,
        date: '2024-10-19T00:00:00.000Z',
        visitor_name: 'Miami Heat',
        home_name: 'Memphis Grizzlies',
        winner: 'Miami Heat'
      },
      {
        id: 14113,
        date: '2024-10-19T02:00:00.000Z',
        visitor_name: 'Utah Jazz',
        home_name: 'Portland Trail Blazers',
        winner: 'Portland Trail Blazers'
      },
      {
        id: 14114,
        date: '2024-10-19T02:30:00.000Z',
        visitor_name: 'Los Angeles Lakers',
        home_name: 'Golden State Warriors',
        winner: 'Golden State Warriors'
      }
      ]

      The user prompt is: Warriors win game

      You will check the data and see that Warriors is indeed playing a game. You will respond "yes"

      If user prompt is: Warriors loses game
    
      You will check the data and see that Warriors is indeed playing a game. You will respond "yes"

      If user prompt is: Raptors loses game

      You will check the data and see that Raptors is not playing a game. You will respond "no"

      ### Output
      If the game is real, then Respond "yes" or "no".
      `;

      reply = (
        await textGeneration(prompt, systemPrompt, JSON.stringify(sportsData))
      ).reply;
      console.log("yes/no", reply);

      if (reply === "no") {
        context.send(`Check your calendar grandpa, this game ain't real`);
        return;
      }

      // Increment bet counter for unique ID
      activeBetCounter++;
      const betId = activeBetCounter;

      // Store the bet along with the current timestamp
      Bets.set(betId, {
        prompt,
        amount,
        agreedUsers: [],
        disagreedUsers: [],
        responses: new Map(),
        status: "pending",
        timestamps: {
          createdAt: currentTimestamp,
          betTimestamp: betTimestamp,
        },
      });

      context.send(
        `New bet #${betId} proposed: "${prompt}" with an amount of ${amount}. Please respond with /agree ${betId} or /disagree ${betId}.`
      );
      break;

    case "agree":
      const agreeBetId = params.betId;

      if (!agreeBetId) {
        context.reply("Missing required parameters. Please provide betId.");
        return;
      }

      if (!Bets.has(agreeBetId)) {
        context.reply("Bet not found.");
        return;
      }

      await processResponse(context, agreeBetId, "agree");
      context.reply(context.message.sender.address);
      break;

    case "disagree":
      const disagreeBetId = params.betId;

      if (!disagreeBetId) {
        context.reply("Missing required parameters. Please provide betId.");
        return;
      }

      if (!Bets.has(disagreeBetId)) {
        context.reply("Bet not found.");
        return;
      }

      await processResponse(context, disagreeBetId, "disagree");
      break;

    case "finalize":
      const finalizeBetId = params.betId;

      if (!finalizeBetId) {
        context.reply("Missing required parameters. Please provide betId.");
        return;
      }

      if (!Bets.has(finalizeBetId)) {
        context.reply("Bet not found.");
        return;
      }
      await finalizeBet(context, finalizeBetId);
      break;

    case "resolve":
      const resolveBetId = params.betId;

      if (!resolveBetId) {
        context.reply("Missing required parameters. Please provide betId.");
        return;
      }

      if (!Bets.has(resolveBetId)) {
        context.reply("Bet not found.");
        return;
      }

      await resolveBet(context, resolveBetId);
      break;

    case "allBets":
      const betList = Array.from(Bets.entries())
        .filter(([_, bet]) => bet.status === "pending")
        .map(([id, bet]) => `Bet #${id}: ${bet.prompt} (${bet.amount})`)
        .join("\n");

      if (betList.length > 0) {
        context.send(`Active bets:\n${betList}`);
      } else {
        context.send("No active bets.");
      }
      break;

    default:
      // Handle unknown commands
      context.reply(
        "Unknown command. Use /help to see all available commands."
      );
  }
}

// Handle responses (agree/disagree) to a bet
async function processResponse(
  context: HandlerContext,
  betId: number,
  response: string
) {
  const bet = Bets.get(betId);
  const senderAddress = ethers.getAddress(context.message.sender.address);

  // Remove the sender from the opposite response list if they had previously responded
  if (response === "agree") {
    bet.disagreedUsers = bet.disagreedUsers.filter(
      (user: string) => user !== senderAddress
    );
    if (!bet.agreedUsers.includes(senderAddress)) {
      bet.agreedUsers.push(senderAddress);
    }
  } else if (response === "disagree") {
    bet.agreedUsers = bet.agreedUsers.filter(
      (user: string) => user !== senderAddress
    );
    if (!bet.disagreedUsers.includes(senderAddress)) {
      bet.disagreedUsers.push(senderAddress);
    }
  }

  bet.responses.set(senderAddress, response);

  const agreeCount = bet.agreedUsers.length;
  const disagreeCount = bet.disagreedUsers.length;

  context.send(
    `Someone has responded. There are now ${agreeCount} agrees and ${disagreeCount} disagrees for Bet #${betId}.`
  );
}

// Finalize the bet and display the results
async function finalizeBet(context: HandlerContext, betId: number) {
  instantiateConnection();

  const bet = Bets.get(betId);
  if (!bet) return;

  const gameName = bet.prompt;
  const yesVoters = bet.agreedUsers;
  const noVoters = bet.disagreedUsers;
  const amount = ethers.parseUnits(bet.amount.toString(), 6);

  const agreeCount = bet.agreedUsers.length;
  const disagreeCount = bet.disagreedUsers.length;

  try {
    // Approve USDC for contract spending
    await approveUSDC(amount);

    // Create the game in the smart contract
    await createGame(gameName, yesVoters, noVoters, amount);

    context.send(`Bet #${betId} successfully created.`);
    if (agreeCount > disagreeCount) {
      context.send(`Majority agreed to "${bet.prompt}" for ${bet.amount}.`);
    } else {
      context.send(`Majority disagreed with "${bet.prompt}".`);
    }
  } catch (error) {
    console.error("Error creating bet on-chain:", error);
    context.send("Failed to create bet on-chain.");
  }

  // Mark bet as resolved
  Bets.set(betId, {
    ...bet,
    status: "placed",
  });
}

async function resolveBet(context: HandlerContext, betId: number) {
  const bet = Bets.get(betId);

  if (!bet) {
    context.reply("Bet not found.");
    return;
  }

  // Use betTimestamp for the game's date
  const betDate = new Date(bet.timestamps.betTimestamp)
    .toISOString()
    .split("T")[0]; // Format the timestamp to YYYY-MM-DD

  try {
    // Fetch NBA data for the day the bet was placed
    const games = await fetchNBAGames(betDate);
    console.log("Fetched games for", betDate, games);

    // Use OpenAI to determine if the bet was won or lost based on NBA data
    const systemPrompt = `
    ### Context
    You are a helpful agent tasked with determining if a sports bet has been won or lost. I will provide you the bet prompt and the sports data for that day. 
    Your job is to analyze the data and decide if the bet was successful or not.
    Respond with "won" or "lost".
    `;

    const userPrompt = `The bet was: "${
      bet.prompt
    }". Here is the sports data: ${JSON.stringify(
      games
    )}. Did the user win or lose the bet?`;

    const { reply } = await textGeneration(userPrompt, systemPrompt);
    console.log("Outcome:", reply);

    const yesWon = reply === "won";
    await resolveGame(betId, yesWon);

    if (reply === "won" || reply === "lost") {
      context.send(`Bet #${betId} has been resolved: The bet was ${reply}.`);

      // Mark the bet as resolved and store the outcome
      Bets.set(betId, {
        ...bet,
        status: "resolved",
        outcome: reply, // Store the outcome ("won" or "lost")
      });
    } else {
      context.send("Unable to determine the outcome of the bet.");
    }
  } catch (error) {
    context.reply("Failed to resolve the bet.");
    console.error("Error resolving bet:", error);
  }
}

async function textGeneration(
  userPrompt: string,
  systemPrompt: string,
  data?: string
) {
  let messages = [];
  messages.push({
    role: "system",
    content: systemPrompt,
  });
  messages.push({
    role: "user",
    content: userPrompt + `Data Source ${data}`,
  });

  try {
    console.log("calling openAI");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages as any,
    });
    const reply = response.choices[0].message.content;
    const cleanedReply = reply
      ?.replace(/(\*\*|__)(.*?)\1/g, "$2")
      ?.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$2")
      ?.replace(/^#+\s*(.*)$/gm, "$1")
      ?.replace(/`([^`]+)`/g, "$1")
      ?.replace(/^`|`$/g, "");

    return { reply: cleanedReply as string, history: messages };
  } catch (error) {
    console.error("Failed to fetch from OpenAI:", error);
    throw error;
  }
}

// ---------------

interface Game {
  id: number;
  date: {
    start: string;
  };
  teams: {
    visitors: {
      name: string;
    };
    home: {
      name: string;
    };
  };
  status: {
    long: string;
  };
  scores?: {
    visitors: {
      points: number;
    };
    home: {
      points: number;
    };
  };
}

interface GameSummary {
  id: number;
  date: string;
  visitor_name: string;
  home_name: string;
  winner: string;
}

export async function fetchNBAGames(date: string): Promise<GameSummary[]> {
  try {
    const response = await axios.get(
      "https://api-nba-v1.p.rapidapi.com/games",
      {
        params: { date },
        headers: {
          "x-rapidapi-key": process.env.RAPIDAPI_KEY || "",
          "x-rapidapi-host": "api-nba-v1.p.rapidapi.com",
        },
      }
    );

    const games: Game[] = response.data.response;
    return resolveGames(games);
  } catch (error) {
    console.error("Error fetching NBA games:", error);
    throw new Error("Failed to fetch NBA games");
  }
}

function resolveGames(games: Game[]): GameSummary[] {
  const results: GameSummary[] = [];

  games.forEach((game) => {
    const visitors = game.teams.visitors;
    const home = game.teams.home;

    if (game.status.long === "Scheduled") {
      results.push({
        id: game.id,
        date: game.date.start,
        visitor_name: visitors.name,
        home_name: home.name,
        winner: "TBD",
      });
    } else if (game.status.long === "Finished") {
      const visitorsPoints = game.scores?.visitors.points || 0;
      const homePoints = game.scores?.home.points || 0;
      const winner = visitorsPoints > homePoints ? visitors.name : home.name;

      results.push({
        id: game.id,
        date: game.date.start,
        visitor_name: visitors.name,
        home_name: home.name,
        winner: winner,
      });
    }
  });

  return results;
}
