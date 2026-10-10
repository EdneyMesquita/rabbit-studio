import { useEffect, useState } from "react";
import { Command, CommandEmpty, CommandInput, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { matchKeywords } from "../../lib/paletteMatch";
import { useUiStore } from "../../store/uiStore";
import { PaletteActions } from "./PaletteActions";
import { PaletteConnections, PaletteObjects, PalettePlaces, PaletteTabs } from "./PaletteGoTo";
import { useBrokerSearch } from "./useBrokerSearch";

/** Ctrl+K: jump to any cluster, vhost, queue, exchange, view or action. */
export function QuickOpenPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const [search, setSearch] = useState("");
  // Fetched only while open and typed into: nothing runs behind a closed palette.
  const { results, loading } = useBrokerSearch(search, open);

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[72px] w-[min(640px,calc(100%-32px))] max-w-none translate-y-0 bg-popover sm:max-w-none"
      >
        <DialogTitle className="sr-only">Quick open</DialogTitle>
        <DialogDescription className="sr-only">Search queues, exchanges, connections and actions</DialogDescription>
        <Command
          filter={matchKeywords}
          loop
          className="bg-transparent **:data-[slot=command-input-wrapper]:h-[46px] **:data-[slot=command-input-wrapper]:gap-2.5 **:data-[slot=command-input-wrapper]:border-line **:data-[slot=command-input-wrapper]:px-3.5"
        >
          <div className="relative">
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder="Queues, exchanges, connections, actions"
              // the global focus outline is unlayered, so only !important beats it
              className="pr-10 outline-none!"
            />
            <Kbd className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2">Esc</Kbd>
          </div>
          <CommandList className="max-h-[420px] p-1.5">
            {!loading && <CommandEmpty>Nothing matches “{search}” in any connection.</CommandEmpty>}
            <PaletteObjects search={search} run={run} found={results} loading={loading} />
            <PaletteTabs search={search} run={run} />
            <PaletteConnections search={search} run={run} />
            <PalettePlaces search={search} run={run} />
            <PaletteActions search={search} run={run} />
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
