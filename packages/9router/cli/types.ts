export type Command = {
  id: string;
  name: string;
  description: string;
  run: () => Promise<void>;
};

/** Soft failure — printed, then return to the menu (does not crash the CLI). */
export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandError";
  }
}
