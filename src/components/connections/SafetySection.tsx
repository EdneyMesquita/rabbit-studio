import { SwitchField } from "./SwitchField";
import type { ConnectionSectionProps } from "./connectionFormTypes";

export function SafetySection({ input, update }: ConnectionSectionProps) {
  const advanced = input.advanced;
  const production = input.environment === "production";
  const set = (patch: Partial<typeof advanced>) => update("advanced", { ...advanced, ...patch });
  return (
    <>
      <SwitchField
        label="Read-only"
        description="Browse and peek only: publish, move, purge, delete and every other change are not offered."
        checked={advanced.readOnly}
        onCheckedChange={(readOnly) => set({ readOnly })}
      />
      <SwitchField
        label="Ask for the connection's name before destructive actions"
        description={
          production
            ? "Always on in production: purge, delete, closing connections and importing definitions ask for the name to be typed."
            : "Purge, delete, closing connections and importing definitions ask for the name to be typed, not just a click."
        }
        checked={production || advanced.typedConfirmation}
        disabled={production}
        onCheckedChange={(typedConfirmation) => set({ typedConfirmation })}
      />
    </>
  );
}
