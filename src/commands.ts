import {
  clearActiveConversation,
  newConversation,
  retryLastReply,
} from "@/stores/chat.ts";
import { useConfig } from "@/stores/config.ts";

/**
 * Slash commands.
 *
 * The original app expected people to guess which bare keywords it recognised —
 * typing "anime" did something, typing "movies" did not, and nothing on screen
 * distinguished the two. Explicit commands make the app's actual surface
 * discoverable and keep it out of the model's way.
 */
export type Command = {
  /** Without the leading slash. */
  readonly name: string;
  readonly description: string;
  run(): void;
};

export const COMMANDS: readonly Command[] = [
  {
    name: "new",
    description: "Start a new chat",
    run: newConversation,
  },
  {
    name: "clear",
    description: "Clear this conversation",
    run: clearActiveConversation,
  },
  {
    name: "retry",
    description: "Regenerate the last reply",
    run: () => void retryLastReply(),
  },
  {
    name: "speak",
    description: "Toggle reading replies aloud",
    run: () => useConfig.getState().toggleSpeakReplies(),
  },
  {
    name: "collapse",
    description: "Toggle the sidebar",
    run: () => useConfig.getState().toggleSidebar(),
  },
  {
    name: "light",
    description: "Switch to the light theme",
    run: () => useConfig.getState().setTheme("light"),
  },
  {
    name: "dark",
    description: "Switch to the dark theme",
    run: () => useConfig.getState().setTheme("dark"),
  },
  {
    name: "system",
    description: "Follow the system theme",
    run: () => useConfig.getState().setTheme("system"),
  },
];

/** Matches the command being typed, if the input is a command at all. */
export function matchCommands(input: string): readonly Command[] {
  if (!input.startsWith("/")) return [];

  const query = input.slice(1).trim().toLowerCase();
  if (query.includes(" ")) return [];

  return COMMANDS.filter((command) => command.name.startsWith(query));
}

/** Resolves a fully typed command, for when the person presses Enter. */
export function resolveCommand(input: string): Command | undefined {
  if (!input.startsWith("/")) return undefined;
  const name = input.slice(1).trim().toLowerCase();
  return COMMANDS.find((command) => command.name === name);
}
