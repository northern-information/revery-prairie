// RP-22 — Chronicle event store.
//
// addChronicleEvent(state, event) is the only path that appends to
// state.chronicle. The dedupe-by-id contract is enforced here so
// emitters can fire freely without worrying about double-writes
// within a frame.
//
// Implementation follows in the plan tasks.

export {}
