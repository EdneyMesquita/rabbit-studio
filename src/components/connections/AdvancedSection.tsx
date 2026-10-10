import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emptyAdvancedOptions, type ConnectionAdvancedOptions } from "@/types/connection";
import { DATA_FIELD, numberOrNull, type ConnectionSectionProps } from "./connectionFormTypes";
import { Field } from "./Field";
import { FieldRow } from "./FieldRow";
import { SwitchField } from "./SwitchField";

type NumberKey = "requestTimeoutMs" | "refreshIntervalMs";

export function AdvancedSection({ input, update }: ConnectionSectionProps) {
  const advanced = input.advanced;
  const set = (patch: Partial<ConnectionAdvancedOptions>) => update("advanced", { ...advanced, ...patch });

  const number = (key: NumberKey, id: string, label: string, placeholder: string, help?: string) => (
    <Field label={label} htmlFor={id} help={help}>
      <Input
        id={id}
        className={DATA_FIELD}
        type="number"
        min={0}
        step={500}
        value={advanced[key] ?? ""}
        onChange={(e) => set({ [key]: numberOrNull(e.target.value) })}
        placeholder={placeholder}
      />
    </Field>
  );

  return (
    <>
      <FieldRow>
        {number("requestTimeoutMs", "adv-timeout", "Request timeout (ms)", "15000", "How long one management API call may take")}
        {number("refreshIntervalMs", "adv-refresh", "Refresh interval (ms)", "5000", "How often open views refresh")}
      </FieldRow>
      <SwitchField
        label="Show system objects"
        description="Lists include amq.* exchanges and the default exchange."
        checked={advanced.showSystemObjects}
        onCheckedChange={(showSystemObjects) => set({ showSystemObjects })}
      />
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() =>
          // Reset only what this section holds; the guards live in Safety.
          set({ ...emptyAdvancedOptions(), readOnly: advanced.readOnly, typedConfirmation: advanced.typedConfirmation })
        }
      >
        <RotateCcw />
        Reset advanced options
      </Button>
    </>
  );
}
