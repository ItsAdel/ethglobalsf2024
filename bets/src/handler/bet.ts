import { HandlerContext } from "@xmtp/message-kit";

const Bets = new Map();
let activeBetCounter = 0;

// Main handler function for processing commands
export async function handler(context: HandlerContext) {
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

    case "show":
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
  const senderAddress = context.message.sender.address;

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

  // Check if all users have responded, if so, finalize the bet
  if (await allUsersResponded(betId, context)) {
    await finalizeBet(context, betId);
  }
}

// Check if all users in the group have responded to the current bet
// TODO: FIX THIS
async function allUsersResponded(betId: number, context: HandlerContext) {
  const bet = Bets.get(betId);
  const allUsers = context.members!;
  console.log(allUsers);
  return allUsers.every((user) => bet.responses.has(user));
}

// Finalize the bet and display the results
async function finalizeBet(context: HandlerContext, betId: number) {
  const bet = Bets.get(betId);
  const agreeCount = bet.agreedUsers.length;
  const disagreeCount = bet.disagreedUsers.length;

  if (agreeCount > disagreeCount) {
    context.send(
      `Bet #${betId} finalized: Majority agreed to "${bet.prompt}" for ${bet.amount}.`
    );
  } else {
    context.send(
      `Bet #${betId} finalized: Majority disagreed with "${bet.prompt}".`
    );
  }

  // Mark bet as resolved
  Bets.set(betId, {
    ...bet,
    status: "resolved",
  });
}
