import json
import os
import re
from typing import List, Dict, Any, Optional
from src.core.llm_provider import LLMProvider
from src.telemetry.logger import logger
from src.telemetry.metrics import tracker
from src.tools import tool_functions

class ReActAgent:
    """
    SKELETON: A ReAct-style Agent that follows the Thought-Action-Observation loop.
    Students should implement the core loop logic and tool execution.
    """
    
    def __init__(
        self,
        llm: LLMProvider,
        tools: List[Dict[str, Any]],
        max_steps: int = 5,
        memory_turns: Optional[int] = None,
    ):
        self.llm = llm
        self.tools = tools
        self.max_steps = max_steps
        self.memory_turns = memory_turns if memory_turns is not None else int(os.getenv("AGENT_MEMORY_TURNS", "12"))
        self.history: List[Dict[str, str]] = []

    def get_system_prompt(self) -> str:
        """
        TODO: Implement the system prompt that instructs the agent to follow ReAct.
        Should include:
        1.  Available tools and their descriptions.
        2.  Format instructions: Thought, Action, Observation.
        """
        tool_descriptions = "\n".join(
            [
                f"- {t['name']}: {t['description']} | parameters: {t.get('parameters', {})}"
                for t in self.tools
            ]
        )
        return (
            "You are an intelligent assistant that must use tools to solve multi-step tasks.\n"
            "Available tools:\n"
            f"{tool_descriptions}\n\n"
            "Use this exact format and output only plain text (no markdown):\n"
            "Thought: <brief reasoning>\n"
            "Action: {\"tool\": \"tool_name\", \"args\": { ... }}\n"
            "Observation: <tool result>\n"
            "... repeat Thought/Action/Observation as needed ...\n"
            "Final Answer: <final response to user>\n"
            "If you are ready to answer, output Final Answer and no Action."
        )

    def _trim_history(self) -> None:
        max_messages = max(self.memory_turns * 2, 0)
        if max_messages and len(self.history) > max_messages:
            self.history = self.history[-max_messages:]

    def _remember(self, role: str, content: str) -> None:
        self.history.append({"role": role, "content": content})
        self._trim_history()

    def _render_history(self) -> str:
        if not self.history:
            return ""

        lines = ["Conversation memory:"]
        for item in self.history:
            lines.append(f"{item['role'].capitalize()}: {item['content']}")
        lines.append("")
        return "\n".join(lines)

    def run(self, user_input: str) -> str:
        """
        TODO: Implement the ReAct loop logic.
        1. Generate Thought + Action.
        2. Parse Action and execute Tool.
        3. Append Observation to prompt and repeat until Final Answer.
        """
        logger.log_event("AGENT_START", {"input": user_input, "model": self.llm.model_name})

        memory_context = self._render_history()
        current_prompt = user_input if not memory_context else f"{memory_context}User: {user_input}"
        steps = 0
        last_response = ""
        final_answer = ""
        while steps < self.max_steps:
            try:
                result = self.llm.generate(current_prompt, system_prompt=self.get_system_prompt())
            except Exception as exc:
                error_msg = f"error: llm_request_failed ({exc})"
                logger.log_event("AGENT_LLM_ERROR", {"step": steps, "error": error_msg})
                return last_response or error_msg
            tracker.track_request(
                provider=result.get("provider", "unknown"),
                model=self.llm.model_name,
                usage=result.get("usage", {}),
                latency_ms=result.get("latency_ms", 0),
            )

            content = result.get("content", "")
            last_response = content
            logger.log_event("AGENT_LLM_RESPONSE", {"step": steps, "content": content})

            final_match = re.search(r"Final Answer:\s*(.*)$", content, re.DOTALL)
            if final_match:
                final_answer = final_match.group(1).strip()
                logger.log_event("AGENT_FINAL", {"step": steps, "answer": final_answer})
                break

            action_payload = self._extract_action(content)
            if not action_payload:
                logger.log_event("AGENT_ACTION_ERROR", {"step": steps, "error": "action_not_found"})
                return content.strip() or last_response or "error: action_not_found"

            tool_name = action_payload.get("tool")
            args = action_payload.get("args", {})
            observation = self._execute_tool(tool_name, args)
            logger.log_event(
                "AGENT_OBSERVATION",
                {"step": steps, "tool": tool_name, "observation": observation},
            )
            current_prompt = f"{current_prompt}\n\nObservation: {observation}"
            steps += 1

        logger.log_event("AGENT_END", {"steps": steps})
        if final_answer:
            self._remember("user", user_input)
            self._remember("assistant", final_answer)
            return final_answer
        fallback_answer = last_response or "error: no_response"
        self._remember("user", user_input)
        self._remember("assistant", fallback_answer)
        return fallback_answer

    def _extract_action(self, content: str) -> Dict[str, Any]:
        match = re.search(r"Action:\s*(\{.*\})", content, re.DOTALL)
        if not match:
            return {}
        raw_json = match.group(1).strip()
        try:
            payload = json.loads(raw_json)
        except json.JSONDecodeError:
            return {}
        if not isinstance(payload, dict):
            return {}
        return payload

    def _execute_tool(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Helper method to execute tools by name.
        """
        if tool_name not in tool_functions:
            return {"error": "tool_not_found", "tool": tool_name}
        tool_fn = tool_functions[tool_name]
        if not isinstance(args, dict):
            return {"error": "invalid_args", "tool": tool_name}
        try:
            return tool_fn(**args)
        except TypeError as exc:
            return {"error": "invalid_args", "tool": tool_name, "detail": str(exc)}
        except Exception as exc:
            return {"error": "tool_execution_failed", "tool": tool_name, "detail": str(exc)}
