import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { useConfirmStore } from "../../store/confirmStore";

/** The open `confirm()` question, if any. Escape and outside clicks cancel. */
export function ConfirmDialog() {
  const pending = useConfirmStore((s) => s.pending);
  if (!pending) return null;
  // Keyed, so a new question starts with an empty guard.
  return <Question key={`${pending.title}\u0000${pending.message}`} />;
}

function Question() {
  const pending = useConfirmStore((s) => s.pending)!;
  const answer = useConfirmStore((s) => s.answer);
  const [typed, setTyped] = useState("");
  const guarded = !!pending.typed;
  const ok = !guarded || typed.trim() === pending.typed;

  return (
    <Modal
      title={pending.title}
      danger={pending.danger}
      onClose={() => answer(false)}
      footer={
        <>
          <span className="flex-1" />
          <Button autoFocus={pending.danger && !guarded} onClick={() => answer(false)}>
            {pending.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={pending.danger ? "destructive" : "primary"}
            autoFocus={!pending.danger && !guarded}
            disabled={!ok}
            onClick={() => answer(true)}
          >
            {pending.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 whitespace-pre-line text-fg-2">{pending.message}</p>
        {guarded && (
          <form
            className="flex flex-col gap-1.5 rounded-md bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (ok) answer(true);
            }}
          >
            <label htmlFor="confirm-typed" className="text-sm text-fg-2">
              {pending.typedLabel ?? "Type"} <b className="font-mono font-medium text-fg">{pending.typed}</b> to confirm
            </label>
            <input
              id="confirm-typed"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="h-7 rounded-sm border border-field-line bg-field px-2 font-mono text-[12px] text-fg outline-none focus:border-accent"
            />
          </form>
        )}
      </div>
    </Modal>
  );
}
