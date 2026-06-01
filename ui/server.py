"""
Flask API server — bridges the web UI to the real Python LLM backend.
Runs on port 5000. The static UI is served separately on port 8080.
"""
import json
import os
import re
import sys
import time

from flask import Flask, Response, jsonify, request, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
load_dotenv(os.path.join(ROOT, ".env"))

from src.core.gemini_provider import GeminiProvider
from src.core.openai_provider import OpenAIProvider
from src.agent.agent import ReActAgent
from src.tools import tool_specs
from src.telemetry.metrics import tracker

app = Flask(__name__)
CORS(app)

# In-memory session stores
chatbot_sessions: dict = {}  # session_id -> [{role, content}]
agent_sessions: dict = {}    # session_id -> ReActAgent


def build_provider():
    name = os.getenv("DEFAULT_PROVIDER", "gemini").lower()
    if name in {"gemini", "google"}:
        return GeminiProvider(
            model_name=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            api_key=os.getenv("GEMINI_API_KEY"),
        )
    return OpenAIProvider(
        model_name=os.getenv("OPENAI_MODEL", "gpt-4o"),
        api_key=os.getenv("OPENAI_API_KEY"),
    )


def sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def build_chatbot_prompt(history: list, query: str) -> str:
    system = (
        "You are a helpful travel assistant. Answer directly without using tools. "
        "If information is missing, make a best guess and explain your assumptions. "
        "You have memory of the conversation below."
    )
    if not history:
        return f"{system}\n\nUser: {query}"
    lines = [system, "", "Conversation so far:"]
    for msg in history[-12:]:
        role = "User" if msg["role"] == "user" else "Assistant"
        lines.append(f"{role}: {msg['content']}")
    lines.append(f"\nUser: {query}")
    return "\n".join(lines)


def _react_loop(agent, query, current_prompt):
    """Shared ReAct streaming generator."""
    system_prompt = agent.get_system_prompt()
    steps = 0
    last_response = ""
    final_answer = ""

    while steps < agent.max_steps:
        try:
            result = agent.llm.generate(current_prompt, system_prompt=system_prompt)
        except Exception as exc:
            yield sse({"type": "error", "content": str(exc)})
            return

        content = result.get("content", "")
        last_response = content
        latency = result.get("latency_ms", 0)

        thought_m = re.search(r"Thought:\s*(.*?)(?=Action:|Final Answer:|$)", content, re.DOTALL)
        if thought_m:
            yield sse({"type": "thought", "content": thought_m.group(1).strip(), "latency_ms": latency})

        final_m = re.search(r"Final Answer:\s*(.*)$", content, re.DOTALL)
        if final_m:
            final_answer = final_m.group(1).strip()
            yield sse({"type": "final", "content": final_answer})
            break

        action = agent._extract_action(content)
        if not action:
            yield sse({"type": "error", "content": "action_not_found"})
            break

        tool_name = action.get("tool", "")
        args = action.get("args", {})
        yield sse({"type": "action", "content": f'{tool_name}({json.dumps(args, ensure_ascii=False)})', "tool": tool_name})

        observation = agent._execute_tool(tool_name, args)
        obs_str = json.dumps(observation, ensure_ascii=False)
        yield sse({"type": "observation", "content": obs_str})

        current_prompt = f"{current_prompt}\n\nObservation: {obs_str}"
        steps += 1

    if not final_answer:
        final_answer = last_response or "error: no_response"
        yield sse({"type": "final", "content": final_answer})

    agent._remember("user", query)
    agent._remember("assistant", final_answer)
    yield sse({"type": "done", "steps": steps, "model": agent.llm.model_name,
               "turn": len(agent.history) // 2})


# ── Health ────────────────────────────────────────────────────────────────────

@app.route("/api/health")
def health():
    provider = os.getenv("DEFAULT_PROVIDER", "gemini")
    model = os.getenv("GEMINI_MODEL") if "gemini" in provider else os.getenv("OPENAI_MODEL")
    return jsonify({"status": "ok", "provider": provider, "model": model})


# ── Comparison (no memory) ────────────────────────────────────────────────────

@app.route("/api/chatbot", methods=["POST"])
def chatbot():
    query = request.get_json(force=True).get("query", "").strip()
    if not query:
        return jsonify({"error": "query required"}), 400
    provider = build_provider()
    prompt = (
        "You are a helpful travel assistant. Answer directly without using tools. "
        f"If information is missing, make a best guess.\n\nUser request: {query}"
    )
    result = provider.generate(prompt)
    tracker.track_request(provider=result.get("provider", "unknown"), model=provider.model_name,
                          usage=result.get("usage", {}), latency_ms=result.get("latency_ms", 0))
    return jsonify({"content": result.get("content", ""), "latency_ms": result.get("latency_ms", 0), "model": provider.model_name})


@app.route("/api/agent/stream", methods=["POST"])
def agent_stream():
    query = request.get_json(force=True).get("query", "").strip()
    if not query:
        return jsonify({"error": "query required"}), 400

    def generate():
        provider = build_provider()
        agent = ReActAgent(llm=provider, tools=tool_specs, max_steps=5)
        yield from _react_loop(agent, query, query)

    return Response(stream_with_context(generate()), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})


# ── Chat with memory ──────────────────────────────────────────────────────────

@app.route("/api/chat/chatbot", methods=["POST"])
def chat_chatbot():
    body = request.get_json(force=True)
    query = body.get("query", "").strip()
    session_id = body.get("session_id", "default")
    if not query:
        return jsonify({"error": "query required"}), 400

    history = chatbot_sessions.setdefault(session_id, [])
    provider = build_provider()
    prompt = build_chatbot_prompt(history, query)

    t0 = time.time()
    result = provider.generate(prompt)
    elapsed = int((time.time() - t0) * 1000)
    content = result.get("content", "")

    history.append({"role": "user", "content": query})
    history.append({"role": "assistant", "content": content})
    if len(history) > 20:
        chatbot_sessions[session_id] = history[-20:]

    return jsonify({"content": content, "latency_ms": elapsed,
                    "model": provider.model_name, "turn": len(history) // 2})


@app.route("/api/chat/agent/stream", methods=["POST"])
def chat_agent_stream():
    body = request.get_json(force=True)
    query = body.get("query", "").strip()
    session_id = body.get("session_id", "default")
    if not query:
        return jsonify({"error": "query required"}), 400

    def generate():
        if session_id not in agent_sessions:
            agent_sessions[session_id] = ReActAgent(llm=build_provider(), tools=tool_specs, max_steps=5)
        agent = agent_sessions[session_id]
        memory_ctx = agent._render_history()
        current_prompt = query if not memory_ctx else f"{memory_ctx}User: {query}"
        yield from _react_loop(agent, query, current_prompt)

    return Response(stream_with_context(generate()), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})


@app.route("/api/chat/clear", methods=["POST"])
def chat_clear():
    body = request.get_json(force=True)
    session_id = body.get("session_id", "default")
    mode = body.get("mode", "both")
    if mode in ("chatbot", "both"):
        chatbot_sessions.pop(session_id, None)
    if mode in ("agent", "both"):
        agent_sessions.pop(session_id, None)
    return jsonify({"cleared": True})


if __name__ == "__main__":
    print("\n🚀 API server running at http://localhost:5000")
    print("📋 Health check: http://localhost:5000/api/health\n")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
