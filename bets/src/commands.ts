import type { CommandGroup } from "@xmtp/message-kit";
import { handler as bet } from "./handler/bet.js";

export const commands: CommandGroup[] = [
  {
    name: "Help",
    triggers: ["/help"],

    description: "Get help    with the bot.",
    commands: [
      {
        command: "/help",
        handler: undefined,
        description: "Get help with the bot.",
        params: {},
      },
    ],
  },
  {
    name: "Bet",
    triggers: [
      "/bet",
      "@bet",
      "/agree",
      "@agree",
      "/disagree",
      "@disagree",
      "/finalize",
      "@finalize",
      "/resolve",
      "@resolve",
      "/allBets",
      "@allBets",
    ],
    description:
      "Bet on a prediction, respond to an active bet, or finalize a bet.",
    commands: [
      {
        command: "/bet [prompt] [amount]",
        handler: bet, // Central handler for bets
        description:
          "Propose a new bet with a prediction and the amount to bet.",
        params: {
          prompt: {
            default: "",
            type: "prompt",
          },
          amount: {
            default: 10, // Default bet amount
            type: "number",
          },
        },
      },
      {
        command: "/agree [betId]",
        handler: bet, // Same handler but handles agree logic
        description: "Agree on an active bet by providing the bet's unique ID.",
        params: {
          betId: {
            type: "number",
          },
        },
      },
      {
        command: "/disagree [betId]",
        handler: bet, // Same handler but handles disagree logic
        description:
          "Disagree on an active bet by providing the bet's unique ID.",
        params: {
          betId: {
            type: "number",
          },
        },
      },
      {
        command: "/finalize [betId]",
        handler: bet, // Finalize handler for finalizing bets
        description:
          "Finalize a bet manually by providing the bet's unique ID.",
        params: {
          betId: {
            type: "number",
          },
        },
      },
      {
        command: "/resolve [betId]",
        handler: bet, // Finalize handler for finalizing bets
        description:
          "Finalize a bet manually by providing the bet's unique ID.",
        params: {
          betId: {
            type: "number",
          },
        },
      },
      {
        command: "/allBets",
        handler: bet, // Finalize handler for finalizing bets
        description: "Show all bets.",
        params: {},
      },
    ],
  },
];
