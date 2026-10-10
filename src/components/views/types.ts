import type { Tab } from "@/store/sessionsStore";
import type { DialogContext } from "@/store/dialogStore";

/** What every tab view receives. */
export interface ViewProps {
  tab: Tab;
  /** On screen (in a pane). Hidden tabs stay mounted: stop polling when false. */
  shown: boolean;
  /** Focused: keyboard shortcuts go to it. */
  active: boolean;
}

/** What every task dialog receives. */
export interface DialogProps {
  context: DialogContext;
  onClose: () => void;
}
