import { useEffect, useState } from "react";
import { useConnectionsStore } from "@/store/connectionsStore";
import {
  newProfileInput,
  profileToInput,
  type ConnectionProfile,
  type ConnectionProfileInput,
} from "@/types/connection";
import type { ConnectionSection, UpdateInput } from "./connectionFormTypes";

/** A new connection's color (DESIGN.md: Teal), so it never starts looking like production's red. */
const NEW_CONNECTION_COLOR = "#1E9AA6";

function initialInput(editing?: ConnectionProfile, copyOf?: ConnectionProfile): ConnectionProfileInput {
  if (editing) return profileToInput(editing);
  if (copyOf) return { ...profileToInput(copyOf), id: null, name: `${copyOf.name} copy` };
  return { ...newProfileInput(), color: NEW_CONNECTION_COLOR };
}

/** The connection form's state and its test / save actions. */
export function useConnectionForm(editing: ConnectionProfile | undefined, copyOf: ConnectionProfile | undefined, onSaved: () => void) {
  const [input, setInput] = useState<ConnectionProfileInput>(() => initialInput(editing, copyOf));
  const [section, setSection] = useState<ConnectionSection>("general");
  // A new connection's id is picked here, so "Save and connect" knows what
  // to connect to; the backend keeps a non-empty id as given.
  const [newId] = useState(() => crypto.randomUUID());
  const [testing, setTesting] = useState(false);
  const { saveProfile, testConnection, connect, lastTestResult, loading, error } = useConnectionsStore();

  // Test result and error live in the store, so clear whatever a previous
  // visit left behind instead of reopening the dialog with a stale banner.
  useEffect(() => {
    useConnectionsStore.setState({ lastTestResult: null, error: null });
  }, []);

  const update: UpdateInput = (key, value) => setInput((prev) => ({ ...prev, [key]: value }));

  async function test() {
    setTesting(true);
    try {
      await testConnection(input);
    } finally {
      setTesting(false);
    }
  }

  async function save(andConnect: boolean) {
    const id = editing?.id ?? newId;
    try {
      await saveProfile({ ...input, id });
    } catch {
      // saveProfile already put the message in the store; keep the dialog open
      return;
    }
    // connect reports its own failure on the connection's row
    if (andConnect) void connect(id);
    onSaved();
  }

  return {
    /** The connection's id, picked up front for a new one. */
    id: editing?.id ?? newId,
    input,
    update,
    section,
    setSection,
    testing,
    test,
    save,
    lastTestResult,
    loading,
    error,
  };
}
