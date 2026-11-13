// Chat assistant API (REQ-27). Stub for now: the UI calls this on every send so wiring up
// the RAG backend later only means replacing the body with a POST to the server
// (e.g. /api/chat/messages). The server holds the LLM keys; never call the LLM from here (NFR-4).
//
// `message` is the new user text; `history` is the conversation before it ({ id, role, text }[]).
// Expected to resolve with the assistant's reply once connected; returns null until then.
export async function sendMessage({ message, history }) {
  void message
  void history
  return null
}
